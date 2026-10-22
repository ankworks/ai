import { useState, type FormEvent } from 'react';
import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button, Input, Label, useI18n } from '@conai/ui';
import { adminAuth } from '../lib/admin-auth-client';
import { adminFetch } from '../lib/api';

interface EnableResult {
  totpURI: string;
  backupCodes: string[];
}

/**
 * Mandatory TOTP enrollment gate, shown after first admin sign-in.
 * enable → display otpauth URI / manual key / backup codes → verify → confirm.
 */
export function MfaSetupPage({ onEnrolled }: { onEnrolled: () => void }) {
  const { t } = useI18n();

  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<EnableResult | null>(null);
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [done, setDone] = useState(false);

  async function enable(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { data, error: err } = await adminAuth.twoFactor.enable({
        password,
        method: 'totp',
        issuer: 'ConAI Admin',
      });
      if (err || !data) {
        setError(err?.message ?? t('admin.signin.invalid'));
        return;
      }
      const result = data as unknown as EnableResult;
      setSetup(result);
      setSecret(new URL(result.totpURI).searchParams.get('secret') ?? '');
    } finally {
      setPending(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { error: err } = await adminAuth.twoFactor.verifyTotp({ code: code.trim() });
      if (err) {
        setError(t('admin.signin.invalid'));
        return;
      }
      // Flip our roster mirror only after the factor is verified server-side.
      await adminFetch('/me/confirm-mfa', { method: 'POST', body: {} });
      setDone(true);
      onEnrolled();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : t('admin.signin.invalid'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <div className="bg-primary/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
            {done ? (
              <ShieldCheck className="text-primary h-6 w-6" aria-hidden />
            ) : (
              <ShieldAlert className="text-primary h-6 w-6" aria-hidden />
            )}
          </div>
          <h1 className="font-heading text-foreground text-2xl font-bold tracking-tight">
            {t('admin.mfa.setupTitle')}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            {t('admin.mfa.setupSubtitle')}
          </p>
        </div>

        <div className="border-border bg-surface space-y-5 rounded-2xl border p-6 shadow-sm">
          {!setup ? (
            <form onSubmit={enable} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="mfa-password">{t('admin.signin.password')}</Label>
                <Input
                  id="mfa-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error ? <p className="text-destructive text-sm">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {t('admin.mfa.enable')}
              </Button>
            </form>
          ) : (
            <>
              <div className="space-y-2">
                <Label>{t('admin.mfa.secretKey')}</Label>
                <code className="bg-muted text-foreground block rounded-lg p-3 text-sm break-all">
                  {secret}
                </code>
              </div>

              <details className="text-sm">
                <summary className="text-muted-foreground cursor-pointer">
                  {t('admin.mfa.otpUri')}
                </summary>
                <code className="bg-muted text-foreground mt-2 block rounded-lg p-3 text-xs break-all">
                  {setup.totpURI}
                </code>
              </details>

              <div className="space-y-2">
                <Label>{t('admin.mfa.backupTitle')}</Label>
                <div className="bg-muted grid grid-cols-2 gap-1.5 rounded-lg p-3">
                  {setup.backupCodes.map((b) => (
                    <code key={b} className="text-foreground text-xs">
                      {b}
                    </code>
                  ))}
                </div>
                <p className="text-muted-foreground text-xs">{t('admin.mfa.backupNote')}</p>
              </div>

              <form onSubmit={verify} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="mfa-code">{t('admin.mfa.code')}</Label>
                  <Input
                    id="mfa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    className="text-center text-lg tracking-[0.4em]"
                  />
                </div>
                {error ? <p className="text-destructive text-sm">{error}</p> : null}
                <Button type="submit" className="w-full" disabled={pending || code.length !== 6}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {t('admin.mfa.confirm')}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
