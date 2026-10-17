import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Loader2, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  useI18n,
} from '@conai/ui';
import { authClient } from '../lib/auth-client';
import { authErrorMessage } from '../lib/auth-errors';

export function SecurityPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (next.length < 10) {
      setError(t('auth.err.weakPassword'));
      return;
    }
    if (next !== confirm) {
      setError(t('auth.err.match'));
      return;
    }
    setPending(true);
    try {
      const { error: err } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
      });
      if (err) {
        setError(authErrorMessage(err, t));
        return;
      }
      setSaved(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } finally {
      setPending(false);
    }
  }

  async function onSignOut() {
    await authClient.signOut();
    navigate('/signin', { replace: true });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-foreground text-2xl font-bold tracking-tight">
          {t('acc.security')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('acc.security.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" aria-hidden />
            {t('acc.security.changePw')}
          </CardTitle>
          <CardDescription>{t('acc.security.changePwDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onChangePassword} className="max-w-md space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cur-pw">{t('acc.security.currentPw')}</Label>
              <Input
                id="cur-pw"
                type="password"
                required
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-pw">{t('acc.security.newPw')}</Label>
              <Input
                id="new-pw"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">{t('auth.pwRule')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="conf-pw">{t('acc.security.confirmPw')}</Label>
              <Input
                id="conf-pw"
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

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t('acc.security.changePwAction')
                )}
              </Button>
              {saved ? (
                <span className="text-success text-sm">{t('acc.security.pwChanged')}</span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LogOut className="h-4 w-4" aria-hidden />
            {t('acc.security.sessions')}
          </CardTitle>
          <CardDescription>{t('acc.security.sessionsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={onSignOut}>
            {t('common.signout')}
          </Button>
          <Link to="/devices" className="text-primary text-sm hover:underline">
            {t('acc.devices')} →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
