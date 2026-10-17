import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  Bell,
  Box,
  CreditCard,
  ExternalLink,
  Gauge,
  KeyRound,
  Languages,
  MonitorSmartphone,
  MousePointerClick,
  ShieldCheck,
  LogOut,
  Sparkles,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge, Button, LanguageToggle, Logo, ThemeToggle, useI18n, type I18nKey } from '@conai/ui';
import { publicEnv } from '../env';
import { authClient } from '../lib/auth-client';

interface Section {
  to: string;
  labelKey: I18nKey;
  icon: LucideIcon;
  ready?: boolean;
}

const SECTIONS: Section[] = [
  { to: '/', labelKey: 'acc.overview', icon: Gauge, ready: true },
  { to: '/profile', labelKey: 'acc.profile', icon: UserRound, ready: true },
  { to: '/security', labelKey: 'acc.security', icon: ShieldCheck, ready: true },
  { to: '/devices', labelKey: 'acc.devices', icon: MonitorSmartphone, ready: true },
  { to: '/connected', labelKey: 'acc.connected', icon: KeyRound, ready: true },
  { to: '/plans', labelKey: 'acc.plans', icon: CreditCard, ready: true },
  { to: '/sparks', labelKey: 'acc.sparks', icon: Sparkles, ready: true },
  { to: '/referrals', labelKey: 'acc.referrals', icon: Users },
  { to: '/storage', labelKey: 'acc.storage', icon: Box },
  { to: '/memory', labelKey: 'acc.memory', icon: MousePointerClick },
  { to: '/preferences', labelKey: 'acc.preferences', icon: Languages, ready: true },
  { to: '/notifications', labelKey: 'acc.notifications', icon: Bell },
  { to: '/verification', labelKey: 'acc.verification', icon: Wallet },
];

function Layout({ children }: { children: ReactNode }) {
  const { t } = useI18n();

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="border-border bg-surface/90 sticky top-0 z-30 border-b backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
          <Link to="/" aria-label="ConAI home">
            <Logo withWordmark size={28} />
          </Link>
          <nav className="text-muted-foreground hidden items-center gap-4 text-sm font-medium md:flex">
            <a href={publicEnv.VITE_WEB_URL} className="hover:text-foreground">
              {t('nav.product')}
            </a>
            <a href={publicEnv.VITE_STATUS_URL} className="hover:text-foreground">
              {t('nav.status')}
            </a>
            <a href={publicEnv.VITE_WORKSPACE_URL} className="hover:text-foreground">
              {t('nav.workspace')}
            </a>
          </nav>
          <div className="flex items-center gap-1.5">
            <SessionChip />
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 md:flex-row md:px-6">
        {children}
      </div>
    </div>
  );
}

function SessionChip() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data } = authClient.useSession();

  if (!data) return null;
  const username = (data.user as { username?: string }).username;
  const label = username ? `@${username}` : data.user.email;

  async function signOut() {
    await authClient.signOut();
    navigate('/signin', { replace: true });
  }

  return (
    <div className="hidden items-center gap-2 sm:flex">
      <span className="text-muted-foreground max-w-36 truncate text-xs font-medium" title={label}>
        {label}
      </span>
      <Button size="sm" variant="ghost" onClick={signOut} aria-label={t('common.signout')}>
        <LogOut className="h-4 w-4" aria-hidden />
        <span className="hidden md:inline">{t('common.signout')}</span>
      </Button>
    </div>
  );
}

export function SettingsShell() {
  const { t } = useI18n();

  return (
    <Layout>
      <aside className="w-full shrink-0 md:w-60">
        <nav className="border-border bg-surface flex gap-1 overflow-x-auto rounded-xl border p-2 md:flex-col md:overflow-visible">
          {SECTIONS.map(({ to, labelKey, icon: Icon, ready }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                [
                  'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-active text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                ].join(' ')
              }
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">{t(labelKey)}</span>
              {ready ? (
                <Badge variant="success" className="ml-auto hidden md:inline-flex">
                  Live
                </Badge>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div className="border-border bg-surface text-muted-foreground mt-4 hidden rounded-xl border p-4 text-xs leading-relaxed md:block">
          <span className="text-foreground font-medium">{t('acc.shell.liveTitle')}</span>
          <br />
          {t('acc.shell.liveNote')}
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </Layout>
  );
}

export function AccountScaffoldButton() {
  const { t } = useI18n();
  return (
    <a href={publicEnv.VITE_WORKSPACE_URL}>
      <Button size="sm" variant="outline">
        <ExternalLink className="h-4 w-4" />
        {t('nav.workspace')}
      </Button>
    </a>
  );
}
