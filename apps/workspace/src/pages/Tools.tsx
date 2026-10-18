/**
 * Tools (Phase 4): the five workspace presets — Study, Coding, Writing,
 * Documents, Tools. Choosing one opens Chat with `?tool=<id>` so the server
 * injects the matching instruction set (governance §Core→Tool→Prefs).
 */

import { useNavigate } from 'react-router-dom';
import { ArrowRight, Calculator, Code2, FileText, Hammer, PenLine } from 'lucide-react';
import { useI18n, type I18nKey } from '@conai/ui';

interface ToolCard {
  id: 'study' | 'coding' | 'writing' | 'documents' | 'tools';
  icon: typeof Calculator;
  titleKey: I18nKey;
  bodyKey: I18nKey;
}

const TOOLS: ToolCard[] = [
  { id: 'study', icon: Calculator, titleKey: 'ws.toolStudy', bodyKey: 'ws.toolStudyBody' },
  { id: 'coding', icon: Code2, titleKey: 'ws.toolCoding', bodyKey: 'ws.toolCodingBody' },
  { id: 'writing', icon: PenLine, titleKey: 'ws.toolWriting', bodyKey: 'ws.toolWritingBody' },
  {
    id: 'documents',
    icon: FileText,
    titleKey: 'ws.toolDocuments',
    bodyKey: 'ws.toolDocumentsBody',
  },
  { id: 'tools', icon: Hammer, titleKey: 'ws.toolTools', bodyKey: 'ws.toolToolsBody' },
];

export function ToolsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8 md:py-10">
      <div className="mb-2">
        <h1 className="text-2xl font-semibold md:text-3xl">{t('ws.tools')}</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">{t('ws.toolsIntro')}</p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => navigate(`/chat?tool=${tool.id}`)}
            className="group border-border bg-card hover:border-primary/50 rounded-xl border p-5 text-left transition-colors"
          >
            <span className="bg-primary/10 text-primary inline-flex h-10 w-10 items-center justify-center rounded-lg">
              <tool.icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="mt-3 flex items-center gap-1.5">
              <h2 className="text-base font-semibold">{t(tool.titleKey)}</h2>
              <ArrowRight
                className="text-muted-foreground group-hover:text-primary h-4 w-4 transition-colors"
                aria-hidden
              />
            </div>
            <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
              {t(tool.bodyKey)}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
