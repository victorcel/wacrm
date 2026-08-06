// ============================================================
// Inbound `type: "unsupported"` webhooks.
//
// Meta does not hand every WhatsApp message over to the Cloud API. When
// a customer sends something the platform cannot deliver — a round video
// (PTV, recorded by holding the camera button), a poll, an edited
// message, view-once media — the webhook still fires, but with a
// placeholder in place of the content:
//
//   {
//     "from": "...", "id": "wamid...", "timestamp": "...",
//     "type": "unsupported",
//     "unsupported": { "type": "edit" },
//     "errors": [{ "code": 131051, "title": "Message type unknown",
//                  "error_data": { "details": "..." } }]
//   }
//
// Crucially there is **no media id**, so the original content is
// unrecoverable — we cannot download, proxy, or re-render it. All the
// webhook can do is record that something arrived and describe it.
//
// The two documented error codes are 131051 ("Message type unknown",
// the Cloud API does not support the type) and 131060 ("This message is
// currently unavailable", a first message to a business on the WhatsApp
// Business app).
//
// Reference:
// https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/unsupported
// ============================================================

/** The subset of the webhook message object this module reads. */
export interface UnsupportedMessagePayload {
  unsupported?: { type?: string };
  errors?: Array<{
    code?: number;
    title?: string;
    message?: string;
    error_data?: { details?: string };
  }>;
}

export interface UnsupportedMessageInfo {
  /**
   * Meta's own sub-type for the message it refused to deliver, e.g.
   * 'edit' or 'poll_creation'. Their documented list has no video entry,
   * so a round video may well arrive with this unset — hence `null`
   * rather than a thrown error or a guessed default.
   */
  subType: string | null;
  /** 131051 or 131060; see the module header. */
  errorCode: number | null;
  errorTitle: string | null;
  errorDetails: string | null;
}

/**
 * Extracts the diagnosable bits of an `unsupported` webhook. Pure and
 * total: every field independently degrades to `null`, because this runs
 * on payloads we have never seen and must never be the thing that throws
 * inside the webhook handler.
 */
export function describeUnsupportedMessage(
  message: UnsupportedMessagePayload
): UnsupportedMessageInfo {
  // Meta documents `errors` as an array but only ever populates one entry
  // per message; take the first and ignore any surprise extras.
  const error = message.errors?.[0];

  return {
    subType: message.unsupported?.type ?? null,
    errorCode: error?.code ?? null,
    errorTitle: error?.title ?? null,
    errorDetails: error?.error_data?.details ?? error?.message ?? null,
  };
}
