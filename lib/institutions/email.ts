import { requiredEnv } from "@/lib/env";

type SendInstitutionVerificationEmailInput = {
  toEmail: string;
  code: string;
  organizationName: string;
  expiresInMinutes: number;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveSenderEmail(): string {
  const configured = clean(process.env.RESEND_FROM_EMAIL);
  return configured || "There\'s No Chance <no-reply@theres-no-chance.com>";
}

export async function sendInstitutionVerificationEmail(
  input: SendInstitutionVerificationEmailInput
): Promise<{ id: string | null }> {
  const apiKey = requiredEnv("RESEND_API_KEY");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resolveSenderEmail(),
      to: [input.toEmail],
      subject: `Verify your institution email for ${input.organizationName}`,
      text: [
        `Your There\'s No Chance institution verification code is: ${input.code}`,
        `This code expires in ${input.expiresInMinutes} minutes.`,
        "If you did not request this code, you can ignore this email.",
      ].join("\n\n"),
      html: `<p>Your There&#39;s No Chance institution verification code is:</p><p style="font-size:24px;font-weight:700;letter-spacing:2px">${input.code}</p><p>This code expires in ${input.expiresInMinutes} minutes.</p><p>If you did not request this code, you can ignore this email.</p>`,
    }),
  });

  let payload: { id?: string; message?: string; error?: string } | null = null;
  try {
    payload = (await response.json()) as { id?: string; message?: string; error?: string };
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail = payload?.message || payload?.error || "Unknown email delivery failure.";
    throw new Error(`Institution verification email failed: ${detail}`);
  }

  return {
    id: clean(payload?.id) || null,
  };
}
