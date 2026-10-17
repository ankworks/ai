import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, Loader2 } from 'lucide-react';
import { Button, Input, Label, useI18n } from '@conai/ui';
import { AuthShell } from '../../components/AuthShell';
import { authClient } from '../../lib/auth-client';
import { authErrorMessage } from '../../lib/auth-errors';

/**
 * Password reset confirmation. The email link hits the API
 * (`/api/auth/reset-password/:token?callbackURL=…`) which validates the token
 * and 302s here with `?token=…` — we then set the new password.
 */
export function ResetPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) return;
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
      const { error: err } = await authClient.resetPassword({ token, newPassword: password });
      if (err) {
        setError(authErrorMessage(err, t));
        return;
      }
      setDone(true);
      setTimeout(() => navigate('/signin', { replace: true }), 1500);
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title={t('auth.resetTitle')} subtitle={t('auth.resetNoToken')}>
        <Link to="/signin" className="text-primary text-sm font-medium hover:underline">
          {t('common.signin')}
        </Link>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title={t('auth.resetTitle')} subtitle={t('auth.resetDone')}>
        <Link to="/signin" className="text-primary text-sm font-medium hover:underline">
          {t('common.signin')}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('auth.resetTitle')} subtitle={t('auth.resetSubtitle')}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="reset-pw">{t('auth.password')}</Label>
          <Input
            id="reset-pw"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">{t('auth.pwRule')}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="reset-confirm">{t('auth.passwordConfirm')}</Label>
          <Input
            id="reset-confirm"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}
          {t('auth.resetAction')}
        </Button>
      </form>
    </AuthShell>
  );
}
