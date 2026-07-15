import { describe, expect, it } from 'vitest';
import { renderTemplateText } from './template-render';

describe('renderTemplateText', () => {
  it('renders a static body with no header/footer', () => {
    const text = renderTemplateText({
      header_type: undefined,
      header_content: undefined,
      body_text: 'Hello there!',
      footer_text: undefined,
    });
    expect(text).toBe('Hello there!');
  });

  it('substitutes body {{N}} variables', () => {
    const text = renderTemplateText(
      {
        header_type: undefined,
        header_content: undefined,
        body_text: 'Hi {{1}}, your order {{2}} shipped.',
        footer_text: undefined,
      },
      { body: ['Ana', '#123'] },
    );
    expect(text).toBe('Hi Ana, your order #123 shipped.');
  });

  it('includes a TEXT header with its variable substituted', () => {
    const text = renderTemplateText(
      {
        header_type: 'text',
        header_content: 'Reminder for {{1}}',
        body_text: 'Your appointment is tomorrow.',
        footer_text: undefined,
      },
      { headerText: 'Ana' },
    );
    expect(text).toBe('Reminder for Ana\n\nYour appointment is tomorrow.');
  });

  it('includes the footer text', () => {
    const text = renderTemplateText({
      header_type: undefined,
      header_content: undefined,
      body_text: 'Body text',
      footer_text: 'Sent by Acme',
    });
    expect(text).toBe('Body text\n\nSent by Acme');
  });

  it('composes header, body, and footer together', () => {
    const text = renderTemplateText(
      {
        header_type: 'text',
        header_content: 'Hi {{1}}',
        body_text: 'Code: {{1}}',
        footer_text: 'Expires in 10 min',
      },
      { headerText: 'Ana', body: ['482913'] },
    );
    expect(text).toBe('Hi Ana\n\nCode: 482913\n\nExpires in 10 min');
  });

  it('omits non-text headers (image/video/document) from the preview', () => {
    const text = renderTemplateText({
      header_type: 'image',
      header_content: undefined,
      body_text: 'Check out our new product!',
      footer_text: undefined,
    });
    expect(text).toBe('Check out our new product!');
  });

  it('leaves the placeholder literal when a value is missing', () => {
    const text = renderTemplateText(
      { header_type: undefined, header_content: undefined, body_text: 'Hi {{1}}', footer_text: undefined },
      { body: [] },
    );
    expect(text).toBe('Hi {{1}}');
  });
});
