/**
 * Outbound email for auth flows (verification, password reset).
 *
 * Policy (SECURITY.md §9 + docs/MISSING_CREDENTIALS.md #10):
 *  - development: links are printed to the Worker log so local flows fully work;
 *  - production: requires a configured relay (EMAIL_API_URL + EMAIL_API_KEY) — otherwise
 *    sending FAILS LOUDLY instead of silently dropping user emails.
 *  - tokens never appear in structured request logs; only the dedicated dev e-mail
 *    channel prints them, and only when ENVIRONMENT=development.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailSender {
  readonly mode: 'relay' | 'dev-log';
  send(message: EmailMessage): Promise<void>;
}

export interface EmailEnv {
  EMAIL_API_URL?: string | undefined;
  EMAIL_API_KEY?: string | undefined;
  EMAIL_FROM?: string | undefined;
  ENVIRONMENT: 'development' | 'staging' | 'production';
}

export function createEmailSender(env: EmailEnv): EmailSender {
  const hasRelay = Boolean(env.EMAIL_API_URL && env.EMAIL_API_KEY);

  if (hasRelay) {
    const url = env.EMAIL_API_URL as string;
    const apiKey = env.EMAIL_API_KEY as string;
    const from = env.EMAIL_FROM ?? 'ConAI <no-reply@conai.dpdns.org>';
    return {
      mode: 'relay',
      async send(message) {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text ?? '',
          }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(
            `email relay rejected message (status ${res.status}): ${detail.slice(0, 200)}`,
          );
        }
      },
    };
  }

  if (env.ENVIRONMENT === 'development') {
    return {
      mode: 'dev-log',
      async send(message) {
        // Dedicated dev channel — intentional delivery of the link to local logs.
        console.warn(
          JSON.stringify({
            type: 'dev_email',
            to: message.to,
            subject: message.subject,
            text: message.text ?? '',
          }),
        );
      },
    };
  }

  return {
    mode: 'dev-log',
    async send() {
      throw new Error(
        'Email delivery is not configured (EMAIL_API_URL/EMAIL_API_KEY missing) — auth emails are not sent silently',
      );
    },
  };
}

export function verificationEmail(url: string): Pick<EmailMessage, 'subject' | 'html' | 'text'> {
  return {
    subject: 'Verify your ConAI email',
    text: `Confirm your email to activate your ConAI account: ${url}`,
    html: `<p>Confirm your email to activate your ConAI account.</p><p><a href="${url}">Verify email</a></p><p>If you did not sign up, you can ignore this email.</p>`,
  };
}

export function resetPasswordEmail(url: string): Pick<EmailMessage, 'subject' | 'html' | 'text'> {
  return {
    subject: 'Reset your ConAI password',
    text: `Reset your ConAI password: ${url}`,
    html: `<p>Reset your ConAI password:</p><p><a href="${url}">Choose a new password</a></p><p>This link expires shortly. If you did not request it, ignore this email.</p>`,
  };
}
