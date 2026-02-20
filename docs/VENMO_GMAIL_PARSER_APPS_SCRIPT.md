# Venmo Gmail Parser (Google Apps Script)

This script polls `Venmo/Unprocessed` emails, extracts payment data, calls the reconcile endpoint, and moves processed emails to `Venmo/Processed`.

## Setup

1. In Gmail, create labels:
   - `Venmo/Unprocessed`
   - `Venmo/Processed`
   - `Venmo/Error`
2. Create a Gmail filter targeting Venmo payment emails and apply `Venmo/Unprocessed`.
3. In Google Apps Script, create a new project and paste the script below.
4. Set script properties:
   - `RECONCILE_URL` = `https://theres-no-chance.com/api/payments/venmo/reconcile`
   - `RECONCILE_BEARER` = your `VENMO_RECONCILE_BEARER_SECRET`
5. Add a time-driven trigger to run `runVenmoParser` every 5 minutes.

## Script

```javascript
function runVenmoParser() {
  const props = PropertiesService.getScriptProperties();
  const reconcileUrl = props.getProperty("RECONCILE_URL");
  const reconcileBearer = props.getProperty("RECONCILE_BEARER");

  if (!reconcileUrl || !reconcileBearer) {
    throw new Error("Missing RECONCILE_URL or RECONCILE_BEARER.");
  }

  const unprocessedLabel = GmailApp.getUserLabelByName("Venmo/Unprocessed");
  const processedLabel = GmailApp.getUserLabelByName("Venmo/Processed");
  const errorLabel = GmailApp.getUserLabelByName("Venmo/Error");

  if (!unprocessedLabel || !processedLabel || !errorLabel) {
    throw new Error("Missing one or more required labels.");
  }

  const threads = unprocessedLabel.getThreads(0, 50);
  if (!threads.length) return;

  for (const thread of threads) {
    const messages = thread.getMessages();
    const payloads = [];
    const handledMessages = [];

    for (const message of messages) {
      if (!message.isUnread() && message.getLabels().some((l) => l.getName() === "Venmo/Processed")) {
        continue;
      }

      const subject = message.getSubject() || "";
      const body = message.getPlainBody() || "";
      const fullText = `${subject}\n${body}`;

      const amountMatch = fullText.match(/\$([0-9]+(?:\.[0-9]{2})?)/);
      if (!amountMatch) {
        message.addLabel(errorLabel);
        continue;
      }

      const amountUsd = Number(amountMatch[1]);
      if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
        message.addLabel(errorLabel);
        continue;
      }

      const txMatch = fullText.match(/(?:transaction|payment)\s*(?:id|#)?[:\s]+([A-Za-z0-9_-]+)/i);
      const handleMatch = fullText.match(/@([A-Za-z0-9_]+)/);

      payloads.push({
        gmailMessageId: message.getId(),
        venmoTransactionId: txMatch ? txMatch[1] : "",
        amountUsd: amountUsd,
        paidAt: message.getDate().toISOString(),
        payerDisplayName: "",
        payerHandle: handleMatch ? `@${handleMatch[1]}` : "",
        note: fullText,
        raw: {
          subject: subject,
        },
      });

      handledMessages.push(message);
    }

    if (!payloads.length) continue;

    const response = UrlFetchApp.fetch(reconcileUrl, {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: `Bearer ${reconcileBearer}`,
      },
      payload: JSON.stringify({ payments: payloads }),
      muteHttpExceptions: true,
    });

    if (response.getResponseCode() >= 200 && response.getResponseCode() < 300) {
      for (const message of handledMessages) {
        message.getThread().removeLabel(unprocessedLabel);
        message.getThread().addLabel(processedLabel);
      }
    } else {
      for (const message of handledMessages) {
        message.getThread().addLabel(errorLabel);
      }
    }
  }
}
```
