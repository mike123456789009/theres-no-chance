import { NextResponse } from "next/server";

import { processCoinbaseWebhookEvent, type CoinbaseWebhookEvent } from "@/lib/payments/coinbase-webhook";
import { verifyCoinbaseWebhookSignature } from "@/lib/payments/coinbase";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

export const runtime = "nodejs";

type CoinbaseWebhookEnvelope = {
  id: string;
  event: CoinbaseWebhookEvent;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseCoinbaseWebhookEnvelope(raw: unknown): CoinbaseWebhookEnvelope | null {
  if (!isRecord(raw)) return null;
  const envelopeId = clean(raw.id);
  const eventRaw = raw.event;
  if (!isRecord(eventRaw)) return null;

  const eventId = clean(eventRaw.id);
  const eventType = clean(eventRaw.type);
  const eventData = eventRaw.data;
  if (!eventId || !eventType || !isRecord(eventData)) return null;

  return {
    id: envelopeId || eventId,
    event: {
      id: eventId,
      type: eventType,
      data: eventData,
    },
  };
}

export async function POST(request: Request) {
  if (!isSupabaseServiceEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Coinbase webhook processing unavailable: missing service role configuration.",
        missingEnv: getMissingSupabaseServiceEnv(),
      },
      { status: 503 }
    );
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-cc-webhook-signature");

  try {
    const isValidSignature = verifyCoinbaseWebhookSignature({
      payload: rawBody,
      signatureHeader,
    });

    if (!isValidSignature) {
      return NextResponse.json({ error: "Invalid Coinbase signature." }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: "Coinbase webhook configuration invalid.",
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

  const envelope = parseCoinbaseWebhookEnvelope(parsedPayload);
  if (!envelope) {
    return NextResponse.json({ error: "Malformed Coinbase event payload." }, { status: 400 });
  }

  const service = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: webhookRow, error: webhookInsertError } = await service
    .from("webhook_events")
    .insert({
      provider: "coinbase",
      provider_event_id: envelope.event.id,
      event_type: envelope.event.type,
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
        error: "Unable to store Coinbase webhook event.",
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
    const result = await processCoinbaseWebhookEvent({
      service,
      event: envelope.event,
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
      envelopeId: envelope.id,
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
        error: "Coinbase webhook processing failed.",
        detail,
      },
      { status: 500 }
    );
  }
}
