import id from './id.json';
import en from './en.json';

export const languages = {
  id: 'Bahasa Indonesia',
  en: 'English',
} as const;

export const defaultLang = 'id' as const;

export type Lang = keyof typeof languages;

export const dictionaries = { id, en } as const;

export type Dictionary = typeof id;

/**
 * Get dictionary for a given language.
 */
export function getDictionary(lang: Lang): Dictionary {
  return dictionaries[lang] ?? dictionaries[defaultLang];
}

/**
 * Detect language from URL pathname.
 * Pattern: /id/... or /en/... — fallback to defaultLang.
 */
export function getLangFromUrl(url: URL): Lang {
  const [, lang] = url.pathname.split('/');
  if (lang in languages) {
    return lang as Lang;
  }
  return defaultLang;
}

/**
 * Get the opposite language for toggle.
 */
export function getOppositeLang(lang: Lang): Lang {
  return lang === 'id' ? 'en' : 'id';
}

/**
 * Build a localized URL path.
 * Example: localizePath('id', '/faq') → '/id/faq'
 *          localizePath('id', '/') → '/id/'
 */
export function localizePath(lang: Lang, path: string = ''): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (cleanPath === '/') {
    return `/${lang}/`;
  }
  return `/${lang}${cleanPath}`;
}

/**
 * Strip language prefix from URL.
 * Example: delocalizePath('/id/faq') → '/faq'
 */
export function delocalizePath(path: string): string {
  const [, lang, ...rest] = path.split('/');
  if (lang in languages) {
    return `/${rest.join('/')}` || '/';
  }
  return path;
}

/**
 * Type-safe translation function.
 * Usage: t('hero.title') → string
 */
export function createTranslator(lang: Lang) {
  const dict = getDictionary(lang);
  return function t(path: string): string {
    const keys = path.split('.');
    let value: unknown = dict;
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = (value as Record<string, unknown>)[key];
      } else {
        return path; // Fallback: return the key path
      }
    }
    return typeof value === 'string' ? value : path;
  };
}

/**
 * Get user's preferred language from Accept-Language header.
 * Used for server-side redirect on first visit.
 */
export function getLangFromHeaders(headers: Headers): Lang {
  const acceptLang = headers.get('accept-language');
  if (!acceptLang) return defaultLang;

  const parsed = acceptLang
    .split(',')
    .map((part) => {
      const [lang, q = '1'] = part.trim().split(';q=');
      return { lang: lang.toLowerCase().split('-')[0], q: parseFloat(q) };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of parsed) {
    if (lang in languages) {
      return lang as Lang;
    }
  }
  return defaultLang;
}
