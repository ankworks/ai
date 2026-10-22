import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@conai/ui';
import { adminAuth } from '../lib/admin-auth-client';

/**
 * Admin session gate. The admin better-auth instance owns its own cookie
 * (`conai_admin.session_token`), so `useSession` here never sees user-plane logins.
 */
export function RequireAdmin() {
  const { data, isPending } = adminAuth.useSession();
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
