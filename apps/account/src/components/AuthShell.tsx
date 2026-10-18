import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LanguageToggle, Logo, ThemeToggle } from '@conai/ui';

/**
 * Centered card layout for sign-in / sign-up / account setup.
 * Generous whitespace, light surface, no dark chrome in light mode (design spec).
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
        <Link to="/" aria-label="ConAI home">
          <Logo withWordmark size={28} />
        </Link>
        <div className="flex items-center gap-1.5">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <h1 className="font-heading text-foreground text-2xl font-bold tracking-tight">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{subtitle}</p>
            ) : null}
          </div>

          <div className="border-border bg-surface rounded-2xl border p-6 shadow-sm">
            {children}
          </div>

          {footer ? (
            <div className="text-muted-foreground mt-5 text-center text-sm">{footer}</div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
