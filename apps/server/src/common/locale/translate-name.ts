// Pattern-based translation for floor & restroom names.
// Building names are intentionally left untouched.
// (Duplicated in apps/web/src/lib/translate-name.ts — keep in sync.)

export type LocaleLang = 'he' | 'en';

interface NamePattern {
  he: RegExp;
  en: RegExp;
  heTpl: string;
  enTpl: string;
}

const FLOOR_PATTERNS: NamePattern[] = [
  { he: /^\s*קומה\s*(-?\d+)\s*$/, en: /^\s*floor\s*(-?\d+)\s*$/i, heTpl: 'קומה $1', enTpl: 'Floor $1' },
  { he: /^\s*קומת\s*קרקע\s*$/, en: /^\s*ground\s*(?:floor)?\s*$/i, heTpl: 'קומת קרקע', enTpl: 'Ground floor' },
  { he: /^\s*(?:קומת\s*)?מרתף\s*$/, en: /^\s*basement\s*$/i, heTpl: 'מרתף', enTpl: 'Basement' },
  { he: /^\s*(?:קומת\s*)?גג\s*$/, en: /^\s*roof\s*$/i, heTpl: 'גג', enTpl: 'Roof' },
];

const RESTROOM_PATTERNS: NamePattern[] = [
  { he: /^\s*שירותי(?:ם)?\s*גברים\s*$/, en: /^\s*men'?s?\s*(?:restroom|toilet|bathroom)?\s*$/i, heTpl: 'שירותי גברים', enTpl: "Men's restroom" },
  { he: /^\s*שירותי(?:ם)?\s*נשים\s*$/, en: /^\s*women'?s?\s*(?:restroom|toilet|bathroom)?\s*$/i, heTpl: 'שירותי נשים', enTpl: "Women's restroom" },
  { he: /^\s*שירותי(?:ם)?\s*(?:נכים|נגישות|מוגבלים)\s*$/, en: /^\s*accessible\s*(?:restroom|toilet|bathroom)?\s*$/i, heTpl: 'שירותי נגישות', enTpl: 'Accessible restroom' },
  { he: /^\s*שירותים\s*משותפים\s*$/, en: /^\s*unisex\s*(?:restroom|toilet|bathroom)?\s*$/i, heTpl: 'שירותים משותפים', enTpl: 'Unisex restroom' },
  { he: /^\s*שירותים?\s*$/, en: /^\s*(?:restroom|toilet|bathroom)s?\s*$/i, heTpl: 'שירותים', enTpl: 'Restroom' },
];

function applyPatterns(input: string, target: LocaleLang, patterns: NamePattern[]): string {
  if (!input) return input;
  for (const p of patterns) {
    const m = input.match(p.he);
    if (m) {
      const tpl = target === 'he' ? p.heTpl : p.enTpl;
      return tpl.replace(/\$(\d+)/g, (_s, i) => m[Number(i)] ?? '');
    }
  }
  for (const p of patterns) {
    const m = input.match(p.en);
    if (m) {
      const tpl = target === 'he' ? p.heTpl : p.enTpl;
      return tpl.replace(/\$(\d+)/g, (_s, i) => m[Number(i)] ?? '');
    }
  }
  return input;
}

function normalizeLang(lang: string): LocaleLang {
  return (lang || 'he').toLowerCase().split('-')[0] === 'en' ? 'en' : 'he';
}

export function translateFloorName(name: string, lang: string): string {
  return applyPatterns(name ?? '', normalizeLang(lang), FLOOR_PATTERNS);
}

export function translateRestroomName(name: string, lang: string): string {
  return applyPatterns(name ?? '', normalizeLang(lang), RESTROOM_PATTERNS);
}

/** Translate "Building › Floor › Restroom" — keeps Building, translates Floor + Restroom. */
export function translateLocationPath(path: string, lang: string): string {
  if (!path) return path;
  const parts = path.split(/\s*[›>]\s*/);
  if (parts.length <= 1) return path;
  const out = [...parts];
  if (out.length >= 2) out[1] = translateFloorName(out[1], lang);
  if (out.length >= 3) out[2] = translateRestroomName(out[2], lang);
  return out.join(' › ');
}
