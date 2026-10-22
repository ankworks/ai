import { Construction } from 'lucide-react';
import { Card, CardContent, useI18n } from '@conai/ui';

/** Honest placeholder for the 11 admin modules not built in this slice. */
export function ModulePlaceholder({ title }: { title: string }) {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Construction className="text-muted-foreground h-8 w-8" aria-hidden />
          <p className="font-medium">{t('admin.placeholder.title')}</p>
          <p className="text-muted-foreground max-w-md text-sm">{t('admin.placeholder.body')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
