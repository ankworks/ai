import { Link } from 'react-router-dom';
import { Construction } from 'lucide-react';
import { Badge, Button, Card, CardContent, useI18n, type I18nKey } from '@conai/ui';

/**
 * Honest placeholder for a workspace surface whose phase has not shipped yet.
 * It never pretends to work — it states exactly what is planned and where.
 */
export function PhasePage({ titleKey, phase }: { titleKey: I18nKey; phase: number }) {
  const { t } = useI18n();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 md:px-8 md:py-16">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl md:text-3xl">{t(titleKey)}</h1>
        <Badge variant="secondary">{t('common.phasePlanned')}</Badge>
      </div>

      <Card className="mt-6">
        <CardContent className="flex flex-col items-start gap-4 p-6 md:p-8">
          <span className="bg-secondary text-secondary-foreground flex h-11 w-11 items-center justify-center rounded-lg">
            <Construction className="h-5 w-5" aria-hidden />
          </span>
          <div className="space-y-2">
            <p className="font-medium">
              {t('ws.plannedPhase')} {phase}
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              This surface is part of the product plan but is not implemented yet. ConAI never ships
              fake screens: when this page gains real functionality it will be marked{' '}
              <span className="text-foreground font-medium">IMPLEMENTED</span> in the project
              progress checklist, with tests behind it.
            </p>
          </div>
          <div className="flex gap-3">
            <Link to="/">
              <Button variant="outline" size="sm">
                {t('common.back')}
              </Button>
            </Link>
            <Link to="/chat">
              <Button size="sm">{t('ws.chat')}</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
