// Проверка: язык и валюта по умолчанию берутся из телефона, деньги и множественное число форматируются по языку
import assert from 'node:assert/strict';
import { detectLocale, dict, money, setLocale, signedMoney } from '../src/i18n.ts';

// --- Выбор по умолчанию: регион важнее языка, неизвестный язык — английский ---
assert.deepEqual(detectLocale(['uk-UA']), { lang: 'uk', currency: 'UAH' });
assert.deepEqual(detectLocale(['ru-UA']), { lang: 'ru', currency: 'UAH' }, 'русский язык в Украине — гривны');
assert.deepEqual(detectLocale(['ru-RU']), { lang: 'ru', currency: 'RUB' });
assert.deepEqual(detectLocale(['en-US']), { lang: 'en', currency: 'USD' });
assert.deepEqual(detectLocale(['de-DE']), { lang: 'en', currency: 'EUR' }, 'немецкий не поддержан — английский, но евро');
assert.deepEqual(detectLocale(['uk']), { lang: 'uk', currency: 'UAH' }, 'без региона — по языку');
assert.deepEqual(detectLocale(['pl-PL', 'uk-UA']), { lang: 'uk', currency: 'UAH' }, 'регион без своей валюты в списке — валюта по языку');
assert.deepEqual(detectLocale([]), { lang: 'en', currency: 'USD' });
assert.deepEqual(detectLocale(['not a tag!!', 'ru-RU']), { lang: 'ru', currency: 'RUB' }, 'битый тег не роняет');

// --- Деньги: символ и разделители по языку, копейки только если есть ---
const clean = (s: string) => s.replace(/[\s  ]/g, ' ');
setLocale('ru', 'RUB');
assert.equal(clean(money(140968)), '140 968 ₽');
assert.equal(clean(money(12.5)), '12,50 ₽');
assert.equal(clean(signedMoney(-1479)), '−1 479 ₽');
setLocale('uk', 'UAH');
assert.equal(clean(money(1250)), '1 250 ₴');
setLocale('en', 'USD');
assert.equal(money(140968), '$140,968');
assert.equal(money(-5), '−$5');
setLocale('en', 'EUR');
assert.equal(money(10), '€10');

// --- Множественное число ---
const t = dict({ ru: { ops: '{n} операция|{n} операции|{n} операций|{n} операции' }, uk: { ops: '{n} операція|{n} операції|{n} операцій|{n} операції' }, en: { ops: '{n} transaction|{n} transactions' } });
setLocale('ru', 'RUB');
assert.equal(t('ops', { n: 1 }), '1 операция');
assert.equal(t('ops', { n: 3 }), '3 операции');
assert.equal(t('ops', { n: 11 }), '11 операций');
setLocale('uk', 'UAH');
assert.equal(t('ops', { n: 21 }), '21 операція');
setLocale('en', 'USD');
assert.equal(t('ops', { n: 1 }), '1 transaction');
assert.equal(t('ops', { n: 2 }), '2 transactions');

console.log('OK: язык, валюта, деньги и множественное число');

// --- Ввод: в английском запятая — разделитель тысяч, в русском — десятичная ---
import { parseSigned } from '../src/model.ts';
setLocale('en', 'USD');
assert.equal(parseSigned('1,250'), 1250);
assert.equal(parseSigned('$1,250.50'), 1250.5);
assert.equal(parseSigned('12,50'), 12.5, 'десятичная запятая с европейской клавиатуры');
assert.equal(parseSigned('0,99'), 0.99);
assert.equal(parseSigned('1,5+2,25'), 3.75);
assert.equal(parseSigned('1,234,567.89'), 1234567.89);
assert.equal(parseSigned('−1 200,50'), -1200.5);
setLocale('ru', 'RUB');
assert.equal(parseSigned('12,50'), 12.5);
console.log('OK: ввод сумм по языку');
