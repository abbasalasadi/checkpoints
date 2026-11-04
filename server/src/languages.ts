/**
 * The four checkpoint languages. Every exercise, progress row, attempt and
 * snapshot is keyed by one of these plus a slug — slugs are only unique within
 * a language.
 */

export type Language = 'go' | 'js' | 'rust' | 'java';

export const LANGUAGES: readonly Language[] = ['go', 'js', 'rust', 'java'] as const;

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** Source-file extension per language, used to find starter/main/test files. */
export const SOURCE_EXT: Record<Language, string> = { go: 'go', js: 'js', rust: 'rs', java: 'java' };

/** Slugs: Rust uses snake_case, JS uses kebab-case, Go is lowercase alnum. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
