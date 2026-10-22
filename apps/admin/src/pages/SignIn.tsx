import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, LockKeyhole } from 'lucide-react';
import { Button, Input, Label, Logo, ThemeToggle, LanguageToggle, useI18n } from '@conai/ui';
import { adminAuth, type AdminAuthClientError } from '../lib/admin-auth-client';

/**
 * Admin sign-in — two steps when the account has TOTP enabled:
 * credentials first, then the 6-digit authenticator code. The admin
 * better-auth instance rejects non-members itself (ADMIN_ACCESS_REQUIRED).
 */
export function SignInPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [step, setStep] = useState<'credentials' | 'totp'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function messageFor(err: AdminAuthClientError): string {
    if (err.code === 'ADMIN_LOCKED') return t('admin.signin.locked');
    return t('admin.signin.invalid');
  }

  async function onCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { data, error: err } = await adminAuth.signIn.email({
        email: email.trim(),
        password,
      });
      if (err) {
        setError(messageFor(err));
        return;
      }
      if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect === true) {
        setStep('totp');
        return;
      }
      navigate('/', { replace: true });
    } finally {
      setPending(false);
    }
  }

  async function onTotp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { error: err } = await adminAuth.twoFactor.verifyTotp({ code: code.trim() });
      if (err) {
        setError(t('admin.signin.invalid'));
        return;
      }
      navigate('/', { replace: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
        <Logo withWordmark size={28} />
        <div className="flex items-center gap-1.5">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <div className="bg-primary/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
              <LockKeyhole className="text-primary h-6 w-6" aria-hidden />
            </div>
            <h1 className="font-heading text-foreground text-2xl font-bold tracking-tight">
              {step === 'credentials' ? t('admin.signin.title') : t('admin.signin.totpTitle')}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {step === 'credentials' ? t('admin.signin.subtitle') : t('admin.signin.totpSubtitle')}
            </p>
          </div>

          <div className="border-border bg-surface rounded-2xl border p-6 shadow-sm">
            {step === 'credentials' ? (
              <form onSubmit={onCredentials} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">{t('admin.signin.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">{t('admin.signin.password')}</Label>
                  <Input
                    id="password"
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
                  {t('admin.signin.submit')}
                </Button>
              </form>
            ) : (
              <form onSubmit={onTotp} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="totp">{t('admin.signin.totpCode')}</Label>
                  <Input
                    id="totp"
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
                  {t('admin.signin.verify')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setStep('credentials');
                    setCode('');
                    setError(null);
                  }}
                >
                  {t('common.back')}
                </Button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
