/* Язык и валюта: текущие настройки, словари рядом с кодом, деньги и месяцы через Intl, выбор по умолчанию по телефону */
export type Lang = 'ru' | 'uk' | 'en';
export type Currency = 'UAH' | 'RUB' | 'USD' | 'EUR';

export const LANGS: readonly (readonly [Lang, string])[] = [['uk', 'Українська'], ['ru', 'Русский'], ['en', 'English']];
export const CURRENCIES: readonly Currency[] = ['UAH', 'RUB', 'USD', 'EUR'];

const LOCALE: Record<Lang, string> = { ru: 'ru-RU', uk: 'uk-UA', en: 'en-US' };

let lang: Lang = 'ru';
let currency: Currency = 'RUB';
let moneyInt: Intl.NumberFormat, moneyFrac: Intl.NumberFormat, plural: Intl.PluralRules;

export function setLocale(l: Lang, c: Currency) {
  if (l === lang && c === currency && moneyInt) return;
  lang = l; currency = c;
  const base = { style: 'currency', currency: c, currencyDisplay: 'narrowSymbol' } as const;
  moneyInt = new Intl.NumberFormat(LOCALE[l], { ...base, maximumFractionDigits: 0 });
  moneyFrac = new Intl.NumberFormat(LOCALE[l], { ...base, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  plural = new Intl.PluralRules(LOCALE[l]);
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}
setLocale(lang, currency);

export const getLang = () => lang;
export const getCurrency = () => currency;
export const locale = () => LOCALE[lang];

export const isLang = (v: unknown): v is Lang => v === 'ru' || v === 'uk' || v === 'en';
export const isCurrency = (v: unknown): v is Currency => CURRENCIES.includes(v as Currency);

/** Копейки показываются, только если они есть: 1 250 ₴, но 12,50 $ */
export function money(n: number): string {
  const v = Math.round(n * 100) / 100;
  return (Number.isInteger(v) ? moneyInt : moneyFrac).format(v + 0).replace(/-/, '−');
}
export const signedMoney = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
export const num = (n: number, digits = 0) => n.toLocaleString(LOCALE[lang], { maximumFractionDigits: digits });
const signs = new Map<string, string>();
/** Символ валюты для подписей у полей ввода; кешируется — зовётся на каждой строке плана */
export function currencySign(c: Currency = currency): string {
  const k = `${lang}:${c}`;
  let v = signs.get(k);
  if (v === undefined) {
    v = new Intl.NumberFormat(LOCALE[lang], { style: 'currency', currency: c, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find((p) => p.type === 'currency')?.value ?? c;
    signs.set(k, v);
  }
  return v;
}

const MONTHS: Record<Lang, string[]> = {
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
  uk: ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
/** Название месяца в именительном падеже: Intl в ru/uk отдаёт родительный («октября») */
export const monthName = (m: number) => MONTHS[lang][m - 1];

export const fmtDate = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(d + 'T00:00').toLocaleDateString(LOCALE[lang], opts);

/**
 * Словарь модуля: { ru: {...}, uk: {...}, en: {...} }, ключи берутся из ru. Подстановки — {name}.
 * Множественное число — формы через «|» в порядке one|few|many|other (ru, uk) или one|other (en), число — {n}.
 */
export function dict<K extends string>(d: { ru: Record<K, string>; uk: Record<K, string>; en: Record<K, string> }) {
  return (key: K, vars?: Record<string, string | number>): string => {
    let s = d[lang][key] ?? d.ru[key] ?? key;
    if (s.includes('|') && vars && typeof vars.n === 'number') {
      const forms = s.split('|');
      const order = lang === 'en' ? ['one', 'other'] : ['one', 'few', 'many', 'other'];
      s = forms[order.indexOf(plural.select(vars.n))] ?? forms[forms.length - 1];
    }
    return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
  };
}

const EUROZONE = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES',
  'AD', 'MC', 'SM', 'VA', 'ME', 'XK']);

/** Язык — первый поддерживаемый из языков телефона; валюта — по региону, иначе по языку */
export function detectLocale(tags: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]):
  { lang: Lang; currency: Currency } {
  const found = tags.map((t) => t.toLowerCase().split(/[-_]/)[0]).find(isLang);
  const l: Lang = found ?? 'en';
  let region: string | undefined;
  for (const t of tags) {
    try { region = new Intl.Locale(t).region; } catch { /* битый тег — пропускаем */ }
    if (region) break;
  }
  const byLang: Currency = l === 'uk' ? 'UAH' : l === 'ru' ? 'RUB' : 'USD';
  const c: Currency = region === 'UA' ? 'UAH' : region === 'RU' ? 'RUB' : region && EUROZONE.has(region) ? 'EUR'
    : region === 'US' ? 'USD' : byLang;
  return { lang: l, currency: c };
}
