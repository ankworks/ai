import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Info,
  Megaphone,
  RefreshCw,
  ServerOff,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  LanguageToggle,
  Logo,
  Skeleton,
  ThemeToggle,
  type StatusState,
} from '@conai/ui';
import type { StatusPageResponse } from '@conai/shared';
import { Link } from 'react-router-dom';
import { publicEnv } from './env';

const STATE_META: Record<
  StatusState,
  { label: string; badge: 'success' | 'warning' | 'destructive' | 'secondary'; dot: string }
> = {
  operational: { label: 'Operational', badge: 'success', dot: 'bg-success' },
  degraded: { label: 'Degraded', badge: 'warning', dot: 'bg-warning' },
  partial_outage: { label: 'Partial outage', badge: 'warning', dot: 'bg-warning' },
  major_outage: { label: 'Major outage', badge: 'destructive', dot: 'bg-destructive' },
  maintenance: { label: 'Maintenance', badge: 'secondary', dot: 'bg-lavender' },
  unknown: { label: 'Awaiting data', badge: 'secondary', dot: 'bg-muted-foreground/50' },
};

async function fetchStatus(): Promise<StatusPageResponse> {
  const res = await fetch(`${publicEnv.VITE_API_BASE_URL}/status`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Status API returned ${res.status}`);
  return (await res.json()) as StatusPageResponse;
}

export default function App() {
  const { data, error, isPending, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['status'],
    queryFn: fetchStatus,
    refetchInterval: 30_000,
  });

  const overall = data?.overall ?? 'unknown';

  return (
    <div className="bg-background min-h-screen">
      <header className="border-border bg-surface/90 border-b backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-3 px-4 md:px-6">
          <Link to="/" aria-label="ConAI status home" className="flex items-center gap-3">
            <Logo withWordmark size={28} />
            <Badge variant="outline">Status</Badge>
          </Link>
          <div className="flex items-center gap-1.5">
            <LanguageToggle />
            <ThemeToggle />
            <a href={publicEnv.VITE_WEB_URL}>
              <Button size="sm" variant="ghost">
                conai.dpdns.org
              </Button>
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-10 md:px-6 md:py-14">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">Service status</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              States reflect live health probes — components without probe data show “Awaiting
              data”, never a fabricated green light.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label="Refresh status"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Overall banner */}
        <Card className={`mt-6 ${overall === 'operational' ? 'border-success/40' : ''}`}>
          <CardContent className="flex items-center gap-4 p-5">
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-full ${
                overall === 'operational'
                  ? 'bg-success/10 text-success'
                  : 'bg-muted text-muted-foreground'
              }`}
              aria-hidden
            >
              {overall === 'operational' ? (
                <CheckCircle2 className="h-6 w-6" />
              ) : overall === 'unknown' ? (
                <Info className="h-6 w-6" />
              ) : (
                <AlertTriangle className="h-6 w-6" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-lg font-semibold">{STATE_META[overall].label}</p>
              <p className="text-muted-foreground text-xs">
                {isPending
                  ? 'Loading probe data…'
                  : error
                    ? 'Live API unreachable — last known state shown below.'
                    : dataUpdatedAt
                      ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString()}`
                      : ''}
              </p>
            </div>
            <Badge className="ml-auto" variant={STATE_META[overall].badge}>
              {overall === 'unknown' ? 'No probes yet' : 'Live'}
            </Badge>
          </CardContent>
        </Card>

        {isPending ? (
          <div className="mt-6 space-y-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <section aria-label="Components" className="mt-6">
            <h2 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wide uppercase">
              Components
            </h2>
            <div className="space-y-3">
              {data?.components.map((comp) => (
                <Card key={comp.id}>
                  <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATE_META[comp.state].dot}`}
                        aria-hidden
                      />
                      <div>
                        <p className="text-sm font-semibold">{comp.name}</p>
                        <p className="text-muted-foreground text-xs">{comp.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pl-5 sm:pl-0">
                      <span className="text-muted-foreground text-xs">
                        {comp.lastCheckedAt
                          ? `checked ${new Date(comp.lastCheckedAt).toLocaleString()}`
                          : 'no probe data'}
                      </span>
                      <Badge variant={STATE_META[comp.state].badge}>
                        {STATE_META[comp.state].label}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Incidents / maintenance / announcements — real rows or honest empty states */}
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="text-warning h-4 w-4" aria-hidden />
                Incident history
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              {data && data.incidents.length > 0 ? (
                <ul className="space-y-2">
                  {data.incidents.map((inc) => (
                    <li key={inc.id} className="flex items-center justify-between gap-2">
                      <span>{inc.title}</span>
                      <Badge variant={STATE_META[inc.state].badge}>
                        {STATE_META[inc.state].label}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="text-success h-4 w-4" aria-hidden />
                  No incidents recorded.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="text-primary h-4 w-4" aria-hidden />
                Scheduled maintenance
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              {data && data.maintenance.length > 0 ? (
                <ul className="space-y-2">
                  {data.maintenance.map((m) => (
                    <li key={m.id}>{m.title}</li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2">
                  <ServerOff className="h-4 w-4" aria-hidden />
                  No maintenance scheduled.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="text-indigo h-4 w-4" aria-hidden />
              Announcements
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {data && data.announcements.length > 0 ? (
              <ul className="space-y-3">
                {data.announcements.map((a) => (
                  <li key={a.id}>
                    <p className="text-foreground font-medium">{a.title}</p>
                    <p>{a.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No announcements.</p>
            )}
          </CardContent>
        </Card>

        {error ? (
          <p className="border-destructive/30 bg-destructive/5 text-destructive mt-6 rounded-lg border px-4 py-3 text-sm">
            Could not reach the ConAI API status endpoint. Retrying every 30 seconds…
          </p>
        ) : null}
      </main>

      <footer className="border-border border-t py-6">
        <div className="text-muted-foreground mx-auto flex max-w-4xl items-center justify-between px-4 text-xs md:px-6">
          <span>© {new Date().getFullYear()} ConAI</span>
          <a href={publicEnv.VITE_WEB_URL} className="hover:text-foreground">
            Back to conai.dpdns.org
          </a>
        </div>
      </footer>
    </div>
  );
}
