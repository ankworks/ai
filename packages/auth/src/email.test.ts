import { describe, expect, it, vi } from 'vitest';
import { createEmailSender, resetPasswordEmail, verificationEmail } from './email';

describe('createEmailSender', () => {
  it('dev-log mode prints a dedicated JSON channel and does not throw', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sender = createEmailSender({ ENVIRONMENT: 'development' });
    expect(sender.mode).toBe('dev-log');
    await sender.send({ to: 'a@b.test', subject: 'Hi', text: 'body', html: '<p>body</p>' });
    expect(warn).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(warn.mock.calls[0]?.[0]));
    expect(payload).toMatchObject({ type: 'dev_email', to: 'a@b.test', subject: 'Hi' });
    warn.mockRestore();
  });

  it('production WITHOUT relay fails loudly (no silent drops)', async () => {
    const sender = createEmailSender({ ENVIRONMENT: 'production' });
    await expect(sender.send({ to: 'a@b.test', subject: 'x', html: '' })).rejects.toThrow(
      /not configured/i,
    );
  });

  it('relay mode POSTs JSON with a Bearer token', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const sender = createEmailSender({
      ENVIRONMENT: 'production',
      EMAIL_API_URL: 'https://api.resend.com/emails',
      EMAIL_API_KEY: 're_secret',
      EMAIL_FROM: 'ConAI <no-reply@conai.test>',
    });
    expect(sender.mode).toBe('relay');
    await sender.send({ to: 'a@b.test', subject: 'Hi', html: '<p>hi</p>', text: 'hi' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer re_secret');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ to: ['a@b.test'], subject: 'Hi' });
    vi.unstubAllGlobals();
  });

  it('relay mode surfaces upstream rejections as errors', async () => {
    vi.stubGlobal('fetch', async () => new Response('quota', { status: 429 }));
    const sender = createEmailSender({
      ENVIRONMENT: 'production',
      EMAIL_API_URL: 'https://api.resend.com/emails',
      EMAIL_API_KEY: 're_secret',
    });
    await expect(sender.send({ to: 'a@b.test', subject: 'x', html: '' })).rejects.toThrow(
      /status 429/,
    );
    vi.unstubAllGlobals();
  });
});

describe('email templates', () => {
  it('embeds the action URL in both text and HTML', () => {
    const url = 'https://example.com/verify?token=abc';
    const v = verificationEmail(url);
    expect(v.text).toContain(url);
    expect(v.html).toContain(url);
    const r = resetPasswordEmail(url);
    expect(r.text).toContain(url);
    expect(r.html).toContain(url);
  });
});
