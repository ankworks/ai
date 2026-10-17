import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Button, LanguageToggle, Logo, ThemeToggle, useI18n } from '@conai/ui';
import { publicEnv } from '../env';

const NAV_ITEMS = [
  { key: 'nav.features', href: '/#features' },
  { key: 'nav.plans', href: '/#plans' },
  { key: 'nav.teams', href: '/#features' },
] as const;

export function Header() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const goHash = (href: string) => {
    const hash = href.includes('#') ? href.split('#')[1] : '';
    setOpen(false);
    if (location.pathname !== '/') {
      // navigating from /trust back to home sections happens via <Link>
      return;
    }
    if (hash) document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <header className="border-border/70 bg-surface/85 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between gap-4 px-4 md:px-6">
        <Link to="/" className="flex items-center" aria-label="ConAI home">
          <Logo withWordmark size={30} />
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.key}
              href={item.href}
              onClick={() => goHash(item.href)}
              className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
            >
              {t(item.key)}
            </a>
          ))}
          <Link
            to="/trust"
            className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
          >
            {t('nav.trust')}
          </Link>
          <a
            href={publicEnv.VITE_STATUS_URL}
            className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
          >
            {t('nav.status')}
          </a>
        </nav>

        <div className="flex items-center gap-1.5">
          <LanguageToggle />
          <ThemeToggle />
          <a href={publicEnv.VITE_ACCOUNT_URL} className="hidden md:block">
            <Button variant="ghost" size="sm">
              {t('common.signin')}
            </Button>
          </a>
          <a href={publicEnv.VITE_ACCOUNT_URL} className="hidden md:block">
            <Button size="sm">{t('common.signupFree')}</Button>
          </a>
          <Button
            variant="ghost"
            size="iconSm"
            className="md:hidden"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {open ? (
        <nav className="border-border bg-surface border-t px-4 py-3 md:hidden" aria-label="Mobile">
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.key}
                href={item.href}
                onClick={() => goHash(item.href)}
                className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md px-3 py-2 text-sm font-medium"
              >
                {t(item.key)}
              </a>
            ))}
            <Link
              to="/trust"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md px-3 py-2 text-sm font-medium"
            >
              {t('nav.trust')}
            </Link>
            <a
              href={publicEnv.VITE_STATUS_URL}
              className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md px-3 py-2 text-sm font-medium"
            >
              {t('nav.status')}
            </a>
            <a href={publicEnv.VITE_ACCOUNT_URL} className="mt-2">
              <Button className="w-full" size="sm">
                {t('common.signupFree')}
              </Button>
            </a>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
