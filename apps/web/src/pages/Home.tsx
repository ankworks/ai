import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  Brain,
  Check,
  Code2,
  GraduationCap,
  MessagesSquare,
  Users,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge, Button, Card, CardContent, useI18n, type I18nKey } from '@conai/ui';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { publicEnv } from '../env';

// ── Content data (typed against the English dictionary) ──────────────────────

const FEATURES: Array<{ icon: LucideIcon; title: I18nKey; body: I18nKey }> = [
  { icon: MessagesSquare, title: 'features.chat.title', body: 'features.chat.body' },
  { icon: GraduationCap, title: 'features.study.title', body: 'features.study.body' },
  { icon: Code2, title: 'features.coding.title', body: 'features.coding.body' },
  { icon: Users, title: 'features.teams.title', body: 'features.teams.body' },
  { icon: Zap, title: 'features.sparks.title', body: 'features.sparks.body' },
  { icon: Brain, title: 'features.memory.title', body: 'features.memory.body' },
];

const STEPS: Array<{ title: I18nKey; body: I18nKey }> = [
  { title: 'how.step1.title', body: 'how.step1.body' },
  { title: 'how.step2.title', body: 'how.step2.body' },
  { title: 'how.step3.title', body: 'how.step3.body' },
];

interface PlanCard {
  id: 'personal' | 'student' | 'teams' | 'enterprise';
  name: I18nKey;
  body: I18nKey;
  price: I18nKey;
  sparks: I18nKey | null;
  storage: I18nKey | null;
  features: I18nKey[];
  highlight?: boolean;
}

const PLANS: PlanCard[] = [
  {
    id: 'personal',
    name: 'plans.personal',
    body: 'plans.personalBody',
    price: 'plans.free',
    sparks: 'plans.feature500Sparks',
    storage: 'plans.feature500MB',
    features: ['plans.feature500Sparks', 'plans.feature500MB'],
  },
  {
    id: 'student',
    name: 'plans.student',
    body: 'plans.studentBody',
    price: 'plans.free',
    sparks: 'plans.feature700Sparks',
    storage: 'plans.feature1GB',
    features: ['plans.feature700Sparks', 'plans.feature1GB', 'plans.featureVerify'],
    highlight: true,
  },
  {
    id: 'teams',
    name: 'plans.teams',
    body: 'plans.teamsBody',
    price: 'plans.free',
    sparks: 'plans.feature1000Sparks',
    storage: 'plans.feature2GB',
    features: [
      'plans.feature1000Sparks',
      'plans.feature2GB',
      'plans.feature30Members',
      'plans.feature5Teams',
    ],
  },
  {
    id: 'enterprise',
    name: 'plans.enterprise',
    body: 'plans.enterpriseBody',
    price: 'plans.contact',
    sparks: null,
    storage: null,
    features: ['plans.featureContact'],
  },
];

function useScrollToHash() {
  const { hash } = useLocation();
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }, [hash, reduced]);
}

export function Home() {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  useScrollToHash();

  const rise = reduced
    ? {}
    : {
        initial: { opacity: 0, y: 18 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: '-60px' },
        transition: { duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] as const },
      };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="container mx-auto px-4 pt-16 pb-20 text-center md:px-6 md:pt-24 md:pb-28">
          <motion.div {...rise} className="mx-auto max-w-3xl">
            <Badge className="mb-6" variant="secondary">
              {t('hero.badge')}
            </Badge>
            <h1 className="text-4xl leading-tight text-balance md:text-6xl">
              {t('hero.title1')}
              <br />
              <span className="text-primary">{t('hero.title2')}</span>
            </h1>
            <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-base text-pretty md:text-lg">
              {t('hero.subtitle')}
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href={publicEnv.VITE_ACCOUNT_URL}>
                <Button size="lg" className="min-w-44">
                  {t('hero.ctaPrimary')}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
              <a href="#how">
                <Button size="lg" variant="outline" className="min-w-44">
                  {t('hero.ctaSecondary')}
                </Button>
              </a>
            </div>
            <p className="text-muted-foreground mt-5 text-sm">{t('hero.note')}</p>
          </motion.div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────── */}
        <section id="features" className="border-border bg-surface border-t py-16 md:py-24">
          <div className="container mx-auto px-4 md:px-6">
            <motion.div {...rise} className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl md:text-4xl">{t('features.title')}</h2>
              <p className="text-muted-foreground mt-4">{t('features.subtitle')}</p>
            </motion.div>

            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <motion.div key={title} {...rise}>
                  <Card className="h-full transition-shadow hover:shadow-md">
                    <CardContent className="flex h-full flex-col gap-3 p-6">
                      <span className="bg-primary/10 text-primary inline-flex h-10 w-10 items-center justify-center rounded-lg">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <h3 className="text-lg">{t(title)}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">{t(body)}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────── */}
        <section id="how" className="py-16 md:py-24">
          <div className="container mx-auto px-4 md:px-6">
            <motion.h2 {...rise} className="text-center text-3xl md:text-4xl">
              {t('how.title')}
            </motion.h2>
            <div className="mx-auto mt-12 grid max-w-4xl gap-8 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <motion.div key={step.title} {...rise} className="text-center">
                  <div className="bg-indigo text-indigo-foreground mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold">
                    {i + 1}
                  </div>
                  <h3 className="text-lg">{t(step.title)}</h3>
                  <p className="text-muted-foreground mt-2 text-sm">{t(step.body)}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Plans ────────────────────────────────────────────────────── */}
        <section id="plans" className="border-border bg-surface border-t py-16 md:py-24">
          <div className="container mx-auto px-4 md:px-6">
            <motion.div {...rise} className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl md:text-4xl">{t('plans.title')}</h2>
              <p className="text-muted-foreground mt-4">{t('plans.subtitle')}</p>
            </motion.div>

            <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {PLANS.map((plan) => (
                <motion.div key={plan.id} {...rise} className="relative">
                  <Card className={`h-full ${plan.highlight ? 'border-primary shadow-lg' : ''}`}>
                    {plan.highlight ? (
                      <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                        {t('plans.mostPopular')}
                      </Badge>
                    ) : null}
                    <CardContent className="flex h-full flex-col p-6">
                      <h3 className="text-lg">{t(plan.name)}</h3>
                      <p className="text-muted-foreground mt-1 text-sm">{t(plan.body)}</p>
                      <div className="mt-5 flex items-baseline gap-1.5">
                        <span className="text-3xl font-bold">{t(plan.price)}</span>
                        {plan.price === 'plans.free' ? (
                          <span className="text-muted-foreground text-sm">{t('plans.perDay')}</span>
                        ) : null}
                      </div>
                      <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-start gap-2">
                            <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            <span className="text-muted-foreground">{t(f)}</span>
                          </li>
                        ))}
                      </ul>
                      <a href={publicEnv.VITE_ACCOUNT_URL} className="mt-6">
                        <Button className="w-full" variant={plan.highlight ? 'default' : 'outline'}>
                          {plan.price === 'plans.contact'
                            ? t('plans.contact')
                            : t('common.signupFree')}
                        </Button>
                      </a>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────── */}
        <section className="py-16 md:py-24">
          <motion.div {...rise} className="container mx-auto max-w-3xl px-4 text-center md:px-6">
            <h2 className="text-3xl md:text-4xl">{t('cta.title')}</h2>
            <p className="text-muted-foreground mt-4">{t('cta.body')}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href={publicEnv.VITE_ACCOUNT_URL}>
                <Button size="lg" className="min-w-44">
                  {t('common.signup')}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
              <Link to="/trust">
                <Button size="lg" variant="ghost">
                  {t('nav.trust')}
                </Button>
              </Link>
            </div>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
