import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, MailCheck } from 'lucide-react';
import { Button, Input, Label, useI18n } from '@conai/ui';
import { AuthShell } from '../../components/AuthShell';
import { useCaptcha } from '../../components/TurnstileField';
import { authClient } from '../../lib/auth-client';
import { authErrorMessage } from '../../lib/auth-errors';

const USERNAME_RE = /^[a-zA-Z0-9_.]+$/;

export function SignUpPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const captcha = useCaptcha();

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [verifySentTo, setVerifySentTo] = useState<string | null>(null);
  const [resendPending, setResendPending] = useState(false);
  const [resent, setResent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const uname = username.trim().toLowerCase();
    if (uname.length < 3 || uname.length > 30 || !USERNAME_RE.test(uname)) {
      setError(t('auth.err.usernameInvalid'));
      return;
    }
    if (password.length < 10) {
      setError(t('auth.err.weakPassword'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.err.match'));
      return;
    }

    setPending(true);
    try {
      const headers: Record<string, string> = {};
      const token = captcha.getToken();
      if (token) headers['x-captcha-response'] = token;

      const { data, error: err } = await authClient.signUp.email(
        {
          name: name.trim(),
          username: uname,
          email: email.trim(),
          password,
        },
        { headers },
      );
      if (err) {
        setError(authErrorMessage(err, t));
        captcha.reset();
        return;
      }
      if (data?.user) {
        if (data.token) {
          // Email verification disabled (config change) — go straight to setup.
          navigate('/setup', { replace: true });
        } else {
          setVerifySentTo(data.user.email);
        }
      }
    } finally {
      setPending(false);
    }
  }

  async function onResend() {
    if (!verifySentTo) return;
    setResendPending(true);
    try {
      const { error: err } = await authClient.sendVerificationEmail({
        email: verifySentTo,
        callbackURL: '/',
      });
      setResent(!err);
      if (err) setError(authErrorMessage(err, t));
    } finally {
      setResendPending(false);
    }
  }

  if (verifySentTo) {
    return (
      <AuthShell
        title={t('auth.verifyTitle')}
        subtitle={t('auth.verifyBody')}
        footer={
          <Link to="/signin" className="text-primary font-medium hover:underline">
            {t('common.signin')}
          </Link>
        }
      >
        <div className="space-y-4">
          <div className="border-border bg-accent/40 rounded-lg border px-4 py-3 text-sm">
            <span className="text-muted-foreground">{t('auth.email')}: </span>
            <span className="text-foreground font-medium">{verifySentTo}</span>
          </div>
          <div className="text-muted-foreground flex items-start gap-3 text-sm">
            <MailCheck className="text-primary mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <p className="leading-relaxed">
              {t('auth.devEmailNote')}
              <br />
              {t('auth.verifyAfterNote')}
            </p>
          </div>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onResend}
              disabled={resendPending}
            >
              {resendPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : resent ? (
                t('auth.verifyResent')
              ) : (
                t('auth.verifyResendAction')
              )}
            </Button>
            <Link to="/signin" className="flex-1">
              <Button className="w-full">{t('common.signin')}</Button>
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t('auth.signUpTitle')}
      subtitle={t('auth.signUpSubtitle')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link to="/signin" className="text-primary font-medium hover:underline">
            {t('common.signin')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t('auth.name')}</Label>
          <Input
            id="name"
            required
            autoComplete="name"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="username">{t('auth.username')}</Label>
          <Input
            id="username"
            required
            autoComplete="username"
            minLength={3}
            maxLength={30}
            pattern="[a-zA-Z0-9_.]+"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">{t('auth.usernameHint')}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="su-email">{t('auth.email')}</Label>
          <Input
            id="su-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="su-password">{t('auth.password')}</Label>
          <Input
            id="su-password"
            type="password"
            required
            autoComplete="new-password"
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">{t('auth.pwRule')}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="su-confirm">{t('auth.passwordConfirm')}</Label>
          <Input
            id="su-confirm"
            type="password"
            required
            autoComplete="new-password"
            minLength={10}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        {captcha.enabled ? <div className="flex justify-center">{captcha.widget}</div> : null}

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('auth.signUpAction')}
        </Button>
      </form>
    </AuthShell>
  );
}
