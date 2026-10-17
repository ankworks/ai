import { DEFAULT_LANGUAGE, type Language } from '../brand';
import { dictionaries, type I18nKey } from './dictionaries';

export type { I18nKey };
export { dictionaries, en, vi } from './dictionaries';

export type TranslateParams = Record<string, string | number>;

/**
 * Translate a key in the given language with simple `{placeholder}` interpolation.
 * Falls back to English, then to the key itself, so a missing string never breaks UI.
 */
export function translate(lang: Language, key: I18nKey, params?: TranslateParams): string {
  const dict = dictionaries[lang] ?? dictionaries[DEFAULT_LANGUAGE];
  const template = dict[key] ?? dictionaries[DEFAULT_LANGUAGE][key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/** Detect browser language, defaulting to English. */
export function detectLanguage(navigatorLanguages?: readonly string[]): Language {
  for (const l of navigatorLanguages ?? []) {
    const base = l.toLowerCase().split('-')[0];
    if (base === 'vi') return 'vi';
    if (base === 'en') return 'en';
  }
  return DEFAULT_LANGUAGE;
}
