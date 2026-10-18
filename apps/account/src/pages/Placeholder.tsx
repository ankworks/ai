import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@conai/ui';
import { Link } from 'react-router-dom';
import { ArrowRight, Construction } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Honest "not implemented yet" panel for account sections whose phase hasn't shipped.
 * Never pretends to hold real account data.
 */
export function Placeholder({
  title,
  phase,
  children,
}: {
  title: string;
  phase: number;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
        <Badge variant="secondary">Planned · Phase {phase}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="text-muted-foreground h-5 w-5" aria-hidden />
            Not connected yet
          </CardTitle>
          <CardDescription>
            This section becomes functional when Phase {phase} ships against the live API. No
            placeholder data is shown — the checklist in PROGRESS.md is the source of truth.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">{children}</CardContent>
      </Card>

      <Link
        to="/preferences"
        className="text-primary inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
      >
        Preferences works right now
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
