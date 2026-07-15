/**
 * Render the human-readable preview text for a template send — what
 * gets stored in `messages.content_text` and shown in the inbox
 * bubble. Composes header (if TEXT) + body + footer with {{N}}
 * variables substituted, mirroring what the recipient actually sees
 * on WhatsApp.
 *
 * Every caller that sends a `content_type: 'template'` message
 * (manual chat send, automations, flows, broadcasts) should go
 * through this instead of hand-rolling its own {{N}} substitution —
 * that duplication is how header/footer text silently went missing
 * from some send paths while the body-only render in the chat
 * composer looked fine.
 */

import type { MessageTemplate } from '@/types';

function substitute(text: string, params: string[]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (match, raw) => {
    const idx = Number(raw) - 1;
    const value = params[idx];
    return value && value.trim().length > 0 ? value : match;
  });
}

export interface TemplateRenderParams {
  /** Values for body {{1}}, {{2}}, … indexed by variable position. */
  body?: string[];
  /** Value for a TEXT header's {{1}}, when the header has a variable. */
  headerText?: string;
}

/**
 * Build the full preview text (header + body + footer) for a
 * template send. Non-text headers (image/video/document) aren't
 * representable as text and are omitted — the bubble already shows a
 * "Template" badge plus, where relevant, the media itself.
 */
export function renderTemplateText(
  template: Pick<MessageTemplate, 'header_type' | 'header_content' | 'body_text' | 'footer_text'>,
  params: TemplateRenderParams = {},
): string {
  const parts: string[] = [];

  if (template.header_type === 'text' && template.header_content) {
    parts.push(substitute(template.header_content, params.headerText ? [params.headerText] : []));
  }

  parts.push(substitute(template.body_text, params.body ?? []));

  if (template.footer_text) {
    parts.push(template.footer_text);
  }

  return parts.join('\n\n');
}
