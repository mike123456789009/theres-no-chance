import { NextResponse } from "next/server";

import { checkUserAdminAccess } from "@/lib/auth/admin";
import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GrantBody = {
  confirmIntent?: unknown;
  confirmAcknowledge?: unknown;
  confirmTargetEmail?: unknown;
  confirmPhrase?: unknown;
};

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "on"].includes(normalized);
  }
  return false;
}

function normalizeEmail(value: unknown): string {
  return clean(value).toLowerCase();
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAllowlistedAdmin();
  if (!auth.ok) {
    return auth.response;
  }

  if (!isSupabaseServiceEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Admin role management unavailable: missing service role configuration.",
        missingEnv: getMissingSupabaseServiceEnv(),
      },
      { status: 503 }
    );
  }

  const resolvedParams = await context.params;
  const userId = clean(resolvedParams.userId);

  if (!isUuidLike(userId)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  let body: GrantBody;
  try {
    body = (await request.json()) as GrantBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (clean(body.confirmIntent) !== "grant_platform_admin") {
    return NextResponse.json({ error: "Confirmation intent missing or invalid." }, { status: 400 });
  }

  if (!parseBoolean(body.confirmAcknowledge)) {
    return NextResponse.json({ error: "Risk acknowledgement is required." }, { status: 400 });
  }

  if (clean(body.confirmPhrase) !== "GRANT ADMIN") {
    return NextResponse.json({ error: "Confirmation phrase must exactly match GRANT ADMIN." }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: targetUserResult, error: targetUserError } = await service.auth.admin.getUserById(userId);
  if (targetUserError || !targetUserResult?.user) {
    return NextResponse.json({ error: "Target user was not found." }, { status: 404 });
  }

  const targetUser = targetUserResult.user;
  const targetEmail = normalizeEmail(targetUser.email);

  if (!targetEmail) {
    return NextResponse.json({ error: "Target user does not have a usable email." }, { status: 400 });
  }

  const providedEmail = normalizeEmail(body.confirmTargetEmail);
  if (!providedEmail || providedEmail !== targetEmail) {
    return NextResponse.json(
      {
        error: "Confirmation email does not match the selected user.",
      },
      { status: 400 }
    );
  }

  const targetAdminAccess = await checkUserAdminAccess({
    userId: targetUser.id,
    email: targetUser.email,
  });

  if (targetAdminAccess.isAdmin) {
    return NextResponse.json({
      status: "already_admin",
      message: "User already has platform admin access.",
      user: {
        id: targetUser.id,
        email: targetUser.email ?? null,
      },
    });
  }

  const { error: insertError } = await service.from("user_roles").insert({
    user_id: targetUser.id,
    role: "platform_admin",
    organization_id: null,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({
        status: "already_admin",
        message: "User already has platform admin access.",
        user: {
          id: targetUser.id,
          email: targetUser.email ?? null,
        },
      });
    }

    return NextResponse.json(
      {
        error: "Unable to grant platform admin role.",
        detail: insertError.message,
      },
      { status: 500 }
    );
  }

  const { error: auditError } = await service.from("admin_action_log").insert({
    admin_user_id: auth.adminUser.id,
    action: "grant_platform_admin",
    target_type: "user",
    target_id: targetUser.id,
    details: {
      grantedByEmail: auth.adminUser.email,
      grantedToEmail: targetUser.email ?? null,
    },
  });

  return NextResponse.json({
    status: "granted",
    message: "Platform admin role granted.",
    user: {
      id: targetUser.id,
      email: targetUser.email ?? null,
    },
    auditLogged: !auditError,
    auditWarning: auditError?.message ?? null,
  });
}
