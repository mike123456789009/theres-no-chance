import { NextResponse } from "next/server";

import { processStripeWebhookEvent } from "@/lib/payments/stripe-webhook";
import { verifyStripeWebhookSignature } from "@/lib/payments/stripe";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

export const runtime = "nodejs";

type StripeEventPayload = {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseStripeEvent(raw: unknown): StripeEventPayload | null {
  if (!isRecord(raw)) return null;
  const id = clean(raw.id);
  const type = clean(raw.type);
  const data = raw.data;
  if (!id || !type || !isRecord(data) || !isRecord(data.object)) return null;
  return {
    id,
    type,
    data: {
      object: data.object,
    },
  };
}

export async function POST(request: Request) {
  if (!isSupabaseServiceEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Stripe webhook processing unavailable: missing service role configuration.",
        missingEnv: getMissingSupabaseServiceEnv(),
      },
      { status: 503 }
    );
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("stripe-signature");

  try {
    const isValidSignature = verifyStripeWebhookSignature({
      payload: rawBody,
      signatureHeader,
    });

    if (!isValidSignature) {
      return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: "Stripe webhook configuration invalid.",
        detail: error instanceof Error ? error.message : "Unknown signature verification error.",
      },
      { status: 503 }
    );
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Webhook payload must be valid JSON." }, { status: 400 });
  }

  const event = parseStripeEvent(parsedPayload);
  if (!event) {
    return NextResponse.json({ error: "Malformed Stripe event payload." }, { status: 400 });
  }

  const service = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: webhookRow, error: webhookInsertError } = await service
    .from("webhook_events")
    .insert({
      provider: "stripe",
      provider_event_id: event.id,
      event_type: event.type,
      payload: parsedPayload,
      processing_status: "pending",
      received_at: nowIso,
    })
    .select("id")
    .single();

  if (webhookInsertError) {
    if (webhookInsertError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }

    return NextResponse.json(
      {
        error: "Unable to store Stripe webhook event.",
        detail: webhookInsertError.message,
      },
      { status: 500 }
    );
  }

  const webhookEventId = clean((webhookRow as { id?: string })?.id);
  if (!webhookEventId) {
    return NextResponse.json({ error: "Webhook event insert succeeded without id." }, { status: 500 });
  }

  try {
    const result = await processStripeWebhookEvent({
      service,
      event,
    });

    const statusNote = result.details.join(" | ").slice(0, 1000);

    const { error: finalizeError } = await service
      .from("webhook_events")
      .update({
        processing_status: "processed",
        processed_at: new Date().toISOString(),
        error_message: statusNote || null,
      })
      .eq("id", webhookEventId);

    if (finalizeError) {
      return NextResponse.json(
        {
          error: "Webhook processing completed but final status update failed.",
          detail: finalizeError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      received: true,
      processed: result.processed,
      ignored: result.ignored,
      details: result.details,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown webhook processing error.";

    await service
      .from("webhook_events")
      .update({
        processing_status: "failed",
        processed_at: new Date().toISOString(),
        error_message: detail.slice(0, 1000),
      })
      .eq("id", webhookEventId);

    return NextResponse.json(
      {
        error: "Stripe webhook processing failed.",
        detail,
      },
      { status: 500 }
    );
  }
}
