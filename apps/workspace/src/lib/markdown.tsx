/**
 * Dependency-free Markdown renderer for assistant messages.
 * Supports: headings, bold/italic/strike, inline code, fenced code blocks
 * (with copy button), links (http/https only), lists, blockquotes, hr and
 * line breaks. Everything renders as React nodes — no raw HTML injection.
 */

import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@conai/ui';
import { useI18n } from '@conai/ui';

/** Split text into safe inline nodes: `code`, **bold**, *italic*, ~~strike~~, [link](url). */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern =
    /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(~~[^~\n]+~~)|(\[[^\]\n]+\]\((?:https?:\/\/)[^)\s]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-i${i++}`;
    if (token.startsWith('`')) {
      nodes.push(
        <code
          key={key}
          className="bg-muted rounded px-1.5 py-0.5 font-mono text-[0.85em] break-words"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('~~')) {
      nodes.push(<s key={key}>{token.slice(2, -2)}</s>);
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const linkMatch = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(token);
      if (linkMatch) {
        nodes.push(
          <a
            key={key}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline underline-offset-2"
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="group/code border-border my-2 overflow-hidden rounded-lg border">
      <div className="bg-muted/60 flex items-center justify-between px-3 py-1.5">
        <span className="text-muted-foreground font-mono text-xs">{language || 'code'}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => {
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? (
            <Check className="mr-1 h-3 w-3" aria-hidden />
          ) : (
            <Copy className="mr-1 h-3 w-3" aria-hidden />
          )}
          {copied ? t('ws.copied') : t('ws.copyCode')}
        </Button>
      </div>
      <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

/** Parse markdown block structure then render. */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split('\n');
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    // Fenced code
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] ?? '';
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? '')) {
        body.push(lines[i] ?? '');
        i += 1;
      }
      i += 1; // closing fence (or EOF)
      blocks.push(<CodeBlock key={`b${key++}`} language={lang} code={body.join('\n')} />);
      continue;
    }

    // Heading
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = (heading[1] ?? '#').length;
      const content = renderInline(heading[2] ?? '', `h${key}`);
      const cls = 'font-semibold tracking-tight';
      const sizes: Record<number, string> = {
        1: 'text-xl',
        2: 'text-lg',
        3: 'text-base',
        4: 'text-sm',
      };
      const Tag = `h${Math.min(level + 2, 6)}` as unknown as 'h6';
      blocks.push(
        <Tag key={`b${key++}`} className={`${cls} ${sizes[level] ?? 'text-base'} mt-3 first:mt-0`}>
          {content}
        </Tag>,
      );
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={`b${key++}`} className="border-border my-3" />);
      i += 1;
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const body: string[] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('>')) {
        body.push((lines[i] ?? '').replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={`b${key++}`}
          className="border-primary/40 bg-muted/40 my-2 border-l-2 py-1 pl-3 text-sm italic"
        >
          {renderInline(body.join(' '), `q${key}`)}
        </blockquote>,
      );
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*[-*+]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`b${key++}`} className="my-2 list-disc space-y-1 pl-5 text-sm">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `ul${key}-${idx}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={`b${key++}`} className="my-2 list-decimal space-y-1 pl-5 text-sm">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `ol${key}-${idx}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // Paragraph (merge consecutive plain lines)
    const para: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i] ?? '';
      if (
        next.trim() === '' ||
        /^```/.test(next) ||
        /^#{1,4}\s/.test(next) ||
        /^\s*[-*+]\s+/.test(next) ||
        /^\s*\d+\.\s+/.test(next) ||
        next.startsWith('>') ||
        /^(-{3,}|\*{3,})\s*$/.test(next)
      ) {
        break;
      }
      para.push(next);
      i += 1;
    }
    blocks.push(
      <p
        key={`b${key++}`}
        className="my-1.5 text-sm leading-relaxed break-words whitespace-pre-wrap first:mt-0 last:mb-0"
      >
        {renderInline(para.join('\n'), `p${key}`)}
      </p>,
    );
  }

  return <div className="prose-conai space-y-1">{blocks}</div>;
}
