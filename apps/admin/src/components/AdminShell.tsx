import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Gauge,
  LifeBuoy,
  Loader2,
  Settings,
  ShieldCheck,
  Users,
  KeyRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge, Button, Logo, ThemeToggle, LanguageToggle, useI18n } from '@conai/ui';
import { useQuery } from '@tanstack/react-query';
import { adminAuth } from '../lib/admin-auth-client';
import { adminFetch, AdminApiError } from '../lib/api';
import type { AdminMe } from '../lib/types';
import { MfaSetupPage } from '../pages/MfaSetup';

interface NavItem {
  to: string;
  labelKey: Parameters<ReturnType<typeof useI18n>['t']>[0];
  icon: LucideIcon;
  permission: string;
}

const NAV: NavItem[] = [
  { to: '/', labelKey: 'admin.nav.dashboard', icon: Gauge, permission: 'admin.dashboard.view' },
  { to: '/users', labelKey: 'admin.nav.users', icon: Users, permission: 'admin.users.view' },
  {
    to: '/admins',
    labelKey: 'admin.nav.admins',
    icon: ShieldCheck,
    permission: 'admin.roles.manage',
  },
  { to: '/audit', labelKey: 'admin.nav.audit', icon: LifeBuoy, permission: 'admin.audit.view' },
  {
    to: '/settings',
    labelKey: 'admin.nav.settings',
    icon: Settings,
    permission: 'admin.settings.manage',
  },
];

/**
 * Authenticated admin frame: permission-filtered navigation, role/MFA status,
 * and the hard MFA gate (the API rejects everything pre-MFA anyway — this is
 * the visible counterpart that walks admins through enrollment).
 */
export function AdminShell() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const me = useQuery({
    queryKey: ['admin-me'],
    queryFn: () => adminFetch<AdminMe>('/me'),
    retry: (count, error) => !(error instanceof AdminApiError && error.status === 401) && count < 1,
  });

  if (me.isPending) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('common.loading')}
        </div>
      </div>
    );
  }

  if (me.error) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center px-4">
        <div className="text-center">
          <p className="text-foreground font-medium">{t('admin.error.session')}</p>
          <Button className="mt-4" onClick={() => navigate('/signin', { replace: true })}>
            {t('common.signin')}
          </Button>
        </div>
      </div>
    );
  }

  const admin = me.data!.admin;
  const can = (permission: string) => admin.permissions.includes(permission);

  if (!admin.mfaEnrolled) {
    return <MfaSetupPage onEnrolled={() => void me.refetch()} />;
  }

  return (
    <div className="bg-background min-h-screen">
      <header className="border-border bg-surface/90 sticky top-0 z-30 border-b backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 md:px-6">
          <div className="flex items-center gap-3">
            <Logo withWordmark size={28} />
            <Badge variant="indigo">Admin</Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <LanguageToggle />
            <ThemeToggle />
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await adminAuth.signOut();
                navigate('/signin', { replace: true });
              }}
            >
              {t('common.signout')}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8 md:px-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="space-y-1">
            {NAV.filter((item) => can(item.permission)).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-surface',
                  ].join(' ')
                }
              >
                <item.icon className="h-4 w-4" aria-hidden />
                {t(item.labelKey)}
              </NavLink>
            ))}
          </nav>

          <div className="border-border mt-6 border-t pt-4">
            <p className="text-muted-foreground px-3 text-xs font-medium tracking-wide uppercase">
              {t('admin.me.signedInAs')}
            </p>
            <p className="text-foreground mt-2 truncate px-3 text-sm font-medium">{admin.email}</p>
            <p className="text-muted-foreground flex items-center gap-1.5 px-3 pt-1 text-xs">
              <KeyRound className="h-3 w-3" aria-hidden />
              {t(`admin.role.${admin.role}` as Parameters<typeof t>[0])}
            </p>
            <p className="text-muted-foreground flex items-center gap-1.5 px-3 pt-1 text-xs">
              <ShieldCheck className="h-3 w-3 text-emerald-500" aria-hidden />
              {t('admin.me.mfaOn')}
            </p>
          </div>

          <div className="border-border mt-6 border-t pt-4">
            <p className="text-muted-foreground px-3 text-xs font-medium tracking-wide uppercase">
              {t('admin.nav.modules')}
            </p>
            <p className="text-muted-foreground mt-2 flex items-center gap-1.5 px-3 text-xs">
              <BarChart3 className="h-3 w-3" aria-hidden />
              11 / 16
            </p>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet context={{ admin, can }} />
        </main>
      </div>
    </div>
  );
}
