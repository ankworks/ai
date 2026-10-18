import {
  Activity,
  BadgeCheck,
  BarChart3,
  Bell,
  BrainCircuit,
  ClipboardList,
  Database,
  FileSearch,
  Gauge,
  KeyRound,
  LifeBuoy,
  MessagesSquare,
  ServerCog,
  Settings,
  ShieldAlert,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge, Button, Card, CardContent, LanguageToggle, Logo, ThemeToggle } from '@conai/ui';
import { Link } from 'react-router-dom';
import { publicEnv } from './env';

interface Module {
  name: string;
  icon: LucideIcon;
  phase: number;
}

/** All 16 admin modules from the product spec — none are clickable until implemented. */
const MODULES: Module[] = [
  { name: 'Dashboard', icon: Gauge, phase: 6 },
  { name: 'Users', icon: Users, phase: 6 },
  { name: 'Student Verification', icon: BadgeCheck, phase: 6 },
  { name: 'Teams', icon: MessagesSquare, phase: 6 },
  { name: 'AI Providers', icon: ServerCog, phase: 6 },
  { name: 'AI Models', icon: BrainCircuit, phase: 6 },
  { name: 'API Credentials', icon: KeyRound, phase: 6 },
  { name: 'Sparks', icon: BarChart3, phase: 6 },
  { name: 'Referrals', icon: Activity, phase: 6 },
  { name: 'Storage', icon: Database, phase: 6 },
  { name: 'AI Governance', icon: ClipboardList, phase: 6 },
  { name: 'Trust & Safety', icon: ShieldAlert, phase: 6 },
  { name: 'Reports', icon: FileSearch, phase: 6 },
  { name: 'Maintenance', icon: Settings, phase: 6 },
  { name: 'Notifications', icon: Bell, phase: 6 },
  { name: 'Audit Logs', icon: LifeBuoy, phase: 6 },
];

export default function App() {
  return (
    <div className="bg-background min-h-screen">
      <header className="border-border bg-surface/90 sticky top-0 z-30 border-b backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
          <div className="flex items-center gap-3">
            <Link to="/" aria-label="ConAI admin home">
              <Logo withWordmark size={28} />
            </Link>
            <Badge variant="indigo">Admin</Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <LanguageToggle />
            <ThemeToggle />
            <a href={publicEnv.VITE_WEB_URL}>
              <Button size="sm" variant="ghost">
                Exit
              </Button>
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-14">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">Administration</h1>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
              The admin system runs as a separate application with its own sessions, MFA, and
              fine-grained permissions. Server-side authorization is checked on every route — hiding
              UI is never the control.
            </p>
          </div>
          <Badge variant="warning">Auth: Phase 6 (MFA required)</Badge>
        </div>

        <Card className="mt-6 border-dashed">
          <CardContent className="text-muted-foreground flex flex-col gap-2 p-5 text-sm md:flex-row md:items-center md:justify-between">
            <p>
              <span className="text-foreground font-medium">Admin access is locked.</span> No
              sign-in exists yet; the module tiles below are a roadmap, not fake controls.
            </p>
            <Link to="/account" className="shrink-0">
              <Button size="sm" variant="outline">
                User account platform
              </Button>
            </Link>
          </CardContent>
        </Card>

        <section aria-label="Admin modules" className="mt-8">
          <h2 className="text-muted-foreground mb-4 text-sm font-semibold tracking-wide uppercase">
            Modules
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map(({ name, icon: Icon, phase }) => (
              <Card key={name} className="opacity-90">
                <CardContent className="flex flex-col gap-3 p-5">
                  <div className="flex items-center justify-between">
                    <span className="bg-secondary text-secondary-foreground flex h-9 w-9 items-center justify-center rounded-lg">
                      <Icon className="h-4.5 w-4.5" aria-hidden />
                    </span>
                    <Badge variant="outline">Phase {phase}</Badge>
                  </div>
                  <p className="text-sm font-semibold">{name}</p>
                  <p className="text-muted-foreground text-xs">Planned</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
