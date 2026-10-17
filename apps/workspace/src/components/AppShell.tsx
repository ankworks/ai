import { NavLink, Outlet, Link } from 'react-router-dom';
import { useState } from 'react';
import {
  Code2,
  FileText,
  GraduationCap,
  History,
  Home,
  Library,
  Menu,
  MessageSquare,
  PenLine,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Button,
  LanguageToggle,
  Logo,
  ThemeToggle,
  useI18n,
  usePreferences,
  type I18nKey,
} from '@conai/ui';
import { publicEnv } from '../env';

interface NavItem {
  to: string;
  labelKey: I18nKey;
  icon: LucideIcon;
}

const AI_NAV: NavItem[] = [
  { to: '/', labelKey: 'ws.home', icon: Home },
  { to: '/chat', labelKey: 'ws.chat', icon: MessageSquare },
  { to: '/study', labelKey: 'ws.study', icon: GraduationCap },
  { to: '/coding', labelKey: 'ws.coding', icon: Code2 },
  { to: '/writing', labelKey: 'ws.writing', icon: PenLine },
  { to: '/documents', labelKey: 'ws.documents', icon: FileText },
  { to: '/tools', labelKey: 'ws.tools', icon: Wrench },
];

const LIBRARY_NAV: NavItem[] = [
  { to: '/library', labelKey: 'ws.library', icon: Library },
  { to: '/history', labelKey: 'ws.history', icon: History },
  { to: '/teams', labelKey: 'ws.teams', icon: Users },
];

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();

  const renderItems = (items: NavItem[]) =>
    items.map(({ to, labelKey, icon: Icon }) => (
      <NavLink
        key={to}
        to={to}
        end={to === '/'}
        onClick={onNavigate}
        title={collapsed ? t(labelKey) : undefined}
        className={({ isActive }) =>
          [
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            collapsed ? 'justify-center px-2' : '',
            isActive
              ? 'bg-sidebar-active text-primary'
              : 'text-sidebar-foreground hover:bg-sidebar-hover hover:text-foreground',
          ].join(' ')
        }
      >
        <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden />
        {!collapsed ? <span>{t(labelKey)}</span> : null}
      </NavLink>
    ));

  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4" aria-label="Workspace">
      <div className="space-y-1">{renderItems(AI_NAV)}</div>
      <div className="space-y-1">
        {!collapsed ? (
          <p className="text-muted-foreground px-3 pb-1 text-[11px] font-semibold tracking-wider uppercase">
            Library
          </p>
        ) : null}
        {renderItems(LIBRARY_NAV)}
      </div>
    </nav>
  );
}

function SidebarContent({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const setSidebarCollapsed = usePreferences((s) => s.setSidebarCollapsed);
  const { t } = useI18n();

  return (
    <>
      <div className="border-sidebar-border flex h-16 items-center justify-between border-b px-4">
        <Link to="/" aria-label="ConAI home">
          {collapsed ? <Logo size={26} /> : <Logo withWordmark size={26} />}
        </Link>
        <Button
          variant="ghost"
          size="iconSm"
          className="hidden lg:inline-flex"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setSidebarCollapsed(!collapsed)}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>
      <NavList collapsed={collapsed} onNavigate={onNavigate} />
      <div className="border-sidebar-border text-muted-foreground border-t p-3 text-xs">
        {collapsed ? null : <p className="px-2">{t('hero.note')}</p>}
      </div>
    </>
  );
}

/**
 * Workspace application shell:
 *  - light sidebar in light mode (brand rule), dark sidebar only under dark theme
 *  - collapsible via persisted preference
 *  - mobile drawer
 */
export function AppShell() {
  const collapsed = usePreferences((s) => s.sidebarCollapsed);
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="bg-background flex min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className={`border-sidebar-border bg-sidebar sticky top-0 hidden h-screen shrink-0 flex-col border-r transition-[width] lg:flex ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        <SidebarContent collapsed={collapsed} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="bg-foreground/40 absolute inset-0"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="border-sidebar-border bg-sidebar relative flex h-full w-64 flex-col border-r">
            <Button
              variant="ghost"
              size="iconSm"
              className="absolute top-4 right-2 z-10"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
            <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-surface/90 sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b px-4 backdrop-blur-md md:px-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="iconSm"
              className="lg:hidden"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <Link to="/" className="lg:hidden">
              <Logo withWordmark size={24} />
            </Link>
          </div>
          <div className="flex items-center gap-1.5">
            <LanguageToggle />
            <ThemeToggle />
            <a href={publicEnv.VITE_ACCOUNT_URL}>
              <Button size="sm" variant="outline">
                {t('common.signin')}
              </Button>
            </a>
          </div>
        </header>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
