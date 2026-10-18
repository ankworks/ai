/**
 * Server-side system prompt assembly (governance §10b).
 *
 * Hierarchy implemented in Phase 4: **Core Safety (hard-coded) → Tool
 * instructions (server-owned map) → User Prefs lite (approved Smart
 * Memories)**. Admin Global Policies and richer user prefs arrive in Phase 6
 * and slot between Core Safety and Tool here. The user's own request text is
 * NEVER rewritten — it travels as normal messages after this block.
 */

import { SETTING_KEYS } from '@conai/database';

/** Tool ids usable as `tool` on the chat request (workspace surfaces). */
export const TOOL_IDS = ['study', 'coding', 'writing', 'documents', 'tools'] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export function isToolId(value: unknown): value is ToolId {
  return typeof value === 'string' && (TOOL_IDS as readonly string[]).includes(value);
}

/**
 * Hard-coded safety layer — code, not a policy row: it cannot be edited away
 * from the admin UI (spec: "Core safety and authorization rules are code").
 */
export const CORE_SAFETY = [
  'You are ConAI, a helpful AI assistant.',
  'Do not produce content that facilitates serious harm: child sexual exploitation, terrorism, ' +
    'targeted harassment, or instructions for weapons of mass destruction.',
  'Do not present unlawful activity as advice. If asked for medical, legal, or financial ' +
    'decisions, add a short disclaimer that you are not a licensed professional.',
  'Protect privacy: do not invent personal data about real people, and refuse requests to ' +
    'harvest or dox private information.',
  'Be honest about uncertainty — never fabricate citations, sources, or quoted events.',
].join(' ');

/** Workspace tool instructions (server-owned; client can only pick the id). */
export const TOOL_INSTRUCTIONS: Record<ToolId, string> = {
  study:
    'Study mode: explain concepts step by step, adapt to the learner level implied in the ' +
    'question, and finish with a short quiz or practice question when it helps.',
  coding:
    'Coding mode: give working, idiomatic code first; explain trade-offs briefly; ask for ' +
    'missing context (language, runtime, constraints) only when it blocks a correct answer.',
  writing:
    'Writing mode: draft in the requested tone and length, offer one alternative phrasing for ' +
    'key sentences, and keep the user’s voice rather than replacing it.',
  documents:
    'Documents mode: help structure, summarize, and revise documents. When summarizing, stay ' +
    'faithful to provided text and never invent passages.',
  tools:
    'Tools mode: break multi-step tasks into a clear plan, state which step you are on, and ' +
    'flag anything that needs the user’s confirmation before proceeding.',
};

export interface MemoryLine {
  content: string;
}

/**
 * Approved memories only (status='approved' AND enabled=1), newest first,
 * capped so the prompt stays small. Each line is truncated defensively.
 */
export function assembleSystemPrompt(input: {
  tool?: ToolId | undefined;
  memories?: readonly MemoryLine[];
}): string {
  const parts: string[] = [CORE_SAFETY];
  if (input.tool) parts.push(TOOL_INSTRUCTIONS[input.tool]);
  const memories = (input.memories ?? [])
    .map((m) => m.content.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((c) => (c.length > 600 ? `${c.slice(0, 597)}...` : c));
  if (memories.length > 0) {
    parts.push(
      'The user approved the following personal memories for context (use only when relevant; ' +
        `never repeat them verbatim unless asked):\n${memories.map((m) => `- ${m}`).join('\n')}`,
    );
  }
  return parts.join('\n\n');
}

/** Load approved+enabled memories for a user (D1). */
export async function loadApprovedMemories(db: D1Database, userId: string): Promise<MemoryLine[]> {
  const res = await db
    .prepare(
      `SELECT content FROM user_memories
        WHERE user_id = ? AND status = 'approved' AND enabled = 1
        ORDER BY updated_at DESC
        LIMIT 20`,
    )
    .bind(userId)
    .all<{ content: string }>();
  return (res.results ?? []) as unknown as MemoryLine[];
}

export interface UploadLimits {
  maxImagesPerMessage: number;
  maxDocumentsPerMessage: number;
  maxPdfPages: number;
  maxImageMb: number;
  maxDocumentMb: number;
}

const DEFAULT_LIMITS: UploadLimits = {
  maxImagesPerMessage: 2,
  maxDocumentsPerMessage: 2,
  maxPdfPages: 50,
  maxImageMb: 10,
  maxDocumentMb: 20,
};

/** Fetch the seeded upload limits (falls back to storage defaults). */
export async function loadUploadLimits(db: D1Database): Promise<UploadLimits> {
  const row = await db
    .prepare('SELECT value FROM platform_settings WHERE key = ?')
    .bind(SETTING_KEYS.uploadLimits)
    .first<{ value: string }>();
  try {
    const parsed = JSON.parse(row?.value ?? '{}') as Partial<UploadLimits>;
    return { ...DEFAULT_LIMITS, ...parsed };
  } catch {
    return { ...DEFAULT_LIMITS };
  }
}
