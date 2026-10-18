import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@conai/ui';
import { authClient } from '../lib/auth-client';

/**
 * Session gate for signed-in routes: while the session query is pending show a
 * neutral loader; when it settles without a session, bounce to /signin and
 * remember where the user was headed.
 */
export function RequireAuth() {
  const { data, isPending } = authClient.useSession();
  const location = useLocation();
  const { t } = useI18n();

  if (isPending) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('common.loading')}
        </div>
      </div>
    );
  }

  if (!data) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
