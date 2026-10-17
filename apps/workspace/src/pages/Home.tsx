import { Link } from 'react-router-dom';
import { ArrowRight, Code2, GraduationCap, MessageSquare, PenLine, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge, Button, Card, CardContent, Textarea, useI18n } from '@conai/ui';

const QUICK_ACTIONS: Array<{ to: string; icon: LucideIcon; label: string }> = [
  { to: '/study', icon: GraduationCap, label: 'Study a topic' },
  { to: '/coding', icon: Code2, label: 'Write code' },
  { to: '/writing', icon: PenLine, label: 'Draft writing' },
  { to: '/chat', icon: MessageSquare, label: 'Open chat' },
];

export function Home() {
  const { t, language } = useI18n();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 md:px-8 md:py-14">
      <header>
        <h1 className="text-3xl md:text-4xl">{t('hero.title1')}</h1>
        <p className="text-muted-foreground mt-2" lang={language}>
          {t('hero.subtitle')}
        </p>
      </header>

      {/* AI Composer — real input UI; generation activates with the gateway in Phase 3 */}
      <Card className="mt-8 shadow-sm">
        <CardContent className="p-4 md:p-5">
          <label htmlFor="composer" className="sr-only">
            {t('ws.searchPlaceholder')}
          </label>
          <Textarea
            id="composer"
            placeholder={t('ws.searchPlaceholder')}
            className="bg-muted/60 min-h-24 resize-none border-0 shadow-none focus-visible:ring-1"
            disabled
            aria-describedby="composer-note"
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p id="composer-note" className="text-muted-foreground text-xs">
              <Badge variant="outline" className="mr-2 align-middle">
                {t('ws.plannedPhase')} 3
              </Badge>
              The AI Gateway (Ollama Cloud) connects here — generation is disabled until it is
              really live.
            </p>
            <Button disabled aria-disabled="true" className="sm:self-end">
              <Sparkles className="h-4 w-4" />
              {t('ws.newChat')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <section className="mt-10">
        <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
          Quick actions
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.map(({ to, icon: Icon, label }) => (
            <Link key={to} to={to}>
              <Card className="transition-all hover:-translate-y-0.5 hover:shadow-md">
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-lg">
                    <Icon className="h-4.5 w-4.5" aria-hidden />
                  </span>
                  <span className="text-sm font-medium">{label}</span>
                  <ArrowRight className="text-muted-foreground ml-auto h-4 w-4" aria-hidden />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent conversations — honest empty state */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
            Recent conversations
          </h2>
          <Link to="/history" className="text-primary text-sm font-medium hover:underline">
            {t('ws.history')}
          </Link>
        </div>
        <Card className="mt-3 border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-2 p-10 text-center">
            <MessageSquare className="text-muted-foreground h-6 w-6" aria-hidden />
            <p className="text-sm font-medium">No conversations yet</p>
            <p className="text-muted-foreground max-w-sm text-xs">
              History lands with AI Chat in Phase 3 — nothing is mocked here until real
              conversations exist.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
