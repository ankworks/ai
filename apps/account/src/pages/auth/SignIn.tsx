import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, MailCheck } from 'lucide-react';
import { Button, Input, Label, useI18n } from '@conai/ui';
import { AuthShell } from '../../components/AuthShell';
import { useCaptcha } from '../../components/TurnstileField';
import { authClient } from '../../lib/auth-client';
import { authErrorMessage } from '../../lib/auth-errors';

export function SignInPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const captcha = useCaptcha();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotPending, setForgotPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const headers: Record<string, string> = {};
      const token = captcha.getToken();
      if (token) headers['x-captcha-response'] = token;

      const { data, error: err } = await authClient.signIn.email(
        { email: email.trim(), password },
        { headers },
      );
      if (err) {
        setError(authErrorMessage(err, t));
        captcha.reset();
        return;
      }
      if (data) navigate('/', { replace: true });
    } finally {
      setPending(false);
    }
  }

  async function onForgot(e: FormEvent) {
    e.preventDefault();
    setForgotPending(true);
    setError(null);
    try {
      const { error: err } = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}reset-password`,
      });
      if (err) {
        setError(authErrorMessage(err, t));
        return;
      }
      setForgotSent(true);
    } finally {
      setForgotPending(false);
    }
  }

  if (forgotOpen) {
    return (
      <AuthShell
        title={t('auth.forgotTitle')}
        subtitle={forgotSent ? t('auth.forgotSent') : t('auth.forgotSubtitle')}
        footer={
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => {
              setForgotOpen(false);
              setForgotSent(false);
              setError(null);
            }}
          >
            {t('common.back')}
          </button>
        }
      >
        {forgotSent ? (
          <div className="text-muted-foreground flex items-start gap-3 text-sm">
            <MailCheck className="text-primary mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <p className="leading-relaxed">
              {t('auth.forgotSent')}
              <br />
              <span className="text-xs">{t('auth.devEmailNote')}</span>
            </p>
          </div>
        ) : (
          <form onSubmit={onForgot} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forgot-email">{t('auth.email')}</Label>
              <Input
                id="forgot-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={forgotPending}>
              {forgotPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('auth.forgotAction')
              )}
            </Button>
          </form>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t('auth.signInTitle')}
      subtitle={t('auth.signInSubtitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link to="/signup" className="text-primary font-medium hover:underline">
            {t('common.signup')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t('auth.email')}</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t('auth.password')}</Label>
            <button
              type="button"
              className="text-muted-foreground hover:text-primary text-xs"
              onClick={() => setForgotOpen(true)}
            >
              {t('auth.forgot')}
            </button>
          </div>
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {captcha.enabled ? <div className="flex justify-center">{captcha.widget}</div> : null}

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('auth.signInAction')}
        </Button>
      </form>
    </AuthShell>
  );
}
