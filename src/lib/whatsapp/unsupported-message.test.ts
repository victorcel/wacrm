import { describe, expect, it } from 'vitest';

import { describeUnsupportedMessage } from '@/lib/whatsapp/unsupported-message';

// The payload below is Meta's own documented example, verbatim:
// https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/unsupported
const META_DOC_EXAMPLE = {
  from: '16505551234',
  id: 'wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQUFERjg0NDEzNDdFODU3MUMxMAA=',
  timestamp: '1750090702',
  errors: [
    {
      code: 131051,
      title: 'Message type unknown',
      message: 'Message type unknown',
      error_data: { details: 'Message type is currently not supported.' },
    },
  ],
  type: 'unsupported',
  unsupported: { type: 'edit' },
};

describe('describeUnsupportedMessage', () => {
  it("pulls Meta's sub-type and error detail out of the documented payload", () => {
    expect(describeUnsupportedMessage(META_DOC_EXAMPLE)).toEqual({
      subType: 'edit',
      errorCode: 131051,
      errorTitle: 'Message type unknown',
      errorDetails: 'Message type is currently not supported.',
    });
  });

  // Round videos (PTV — the "hold the camera button" recording) have no
  // entry in Meta's documented `unsupported.type` list, so the object may
  // be absent entirely. We must still describe the message rather than
  // throw, since this is exactly the case we are chasing.
  it('tolerates a missing `unsupported` object', () => {
    expect(describeUnsupportedMessage({ errors: META_DOC_EXAMPLE.errors })).toEqual({
      subType: null,
      errorCode: 131051,
      errorTitle: 'Message type unknown',
      errorDetails: 'Message type is currently not supported.',
    });
  });

  it('tolerates a missing `errors` array', () => {
    expect(
      describeUnsupportedMessage({ unsupported: META_DOC_EXAMPLE.unsupported })
    ).toEqual({
      subType: 'edit',
      errorCode: null,
      errorTitle: null,
      errorDetails: null,
    });
  });

  it('falls back to `message` when `error_data.details` is absent', () => {
    expect(
      describeUnsupportedMessage({
        ...META_DOC_EXAMPLE,
        errors: [{ code: 131060, title: 'Re-engagement message', message: 'Currently unavailable' }],
      })
    ).toEqual({
      subType: 'edit',
      errorCode: 131060,
      errorTitle: 'Re-engagement message',
      errorDetails: 'Currently unavailable',
    });
  });

  it('reports only the first error when Meta sends several', () => {
    expect(
      describeUnsupportedMessage({
        ...META_DOC_EXAMPLE,
        errors: [
          { code: 131051, title: 'first' },
          { code: 131060, title: 'second' },
        ],
      }).errorCode
    ).toBe(131051);
  });

  it('describes an empty payload without throwing', () => {
    expect(describeUnsupportedMessage({})).toEqual({
      subType: null,
      errorCode: null,
      errorTitle: null,
      errorDetails: null,
    });
  });
});
