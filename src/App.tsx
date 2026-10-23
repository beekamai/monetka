import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { Category, Kind, State, ThemeMode, ThemeStyle, Tx } from './model.ts';
import { PALETTE, keepLocale, relocalize, translateStock, withLocale, monthInText, monthKey, monthTitle, normalizeReport, parseExpr, parseSigned, shiftDay, shiftMonth, todayISO, uid } from './model.ts';
import type { Currency, Lang } from './i18n.ts';
import { CURRENCIES, LANGS, currencySign, detectLocale, dict, fmtDate, isCurrency, isLang, locale, money, num, setLocale, signedMoney } from './i18n.ts';
import type { CatRow } from './calc.ts';
import { monthTrend, planFor, summarize } from './calc.ts';
import {
  beforeRestore, createSaver, dropBeforeRestore, dropBroken, exportBroken, hasBroken, load, pickFile, saveBeforeRestore, saveFile,
} from './storage.ts';
import { exportMonth, importWorkbook } from './xlsxio.ts';
import { Onboarding } from './onboarding.tsx';
import { DayBars, Donut, Progress, TrendChart } from './charts.tsx';
import { CalcKeys, GlassDefs, Money, Portal, Seg, Sheet, SwipeArea, haptic, popBack, reducedMotion, stepOption, useBack, useSwipe } from './ui.tsx';

type Tab = 'overview' | 'ops' | 'plan' | 'more';
const TABS: readonly Tab[] = ['overview', 'ops', 'plan', 'more'];

/** undo — состояние до действия, after — сразу после: отмена разрешена, только пока база не менялась */
interface Toast { id: number; text: string; undo?: State; after?: State }
type Update = (fn: (d: State) => void, undoText?: string) => void;
type Replace = (next: State, undoText?: string) => void;
type Notify = (text: string) => void;

const t = dict({
  ru: {
    saveFailed: 'Не удалось сохранить данные. Проверь свободное место на телефоне.',
    localeTitle: 'Язык и валюта',
    currencyHint: 'Валюта — только подпись к суммам: при смене числа не пересчитываются.',
    undoStale: 'Уже были другие изменения — отменить нельзя',
    undone: 'Отменено',
    undoBtn: 'Отменить',
    prevMonth: 'Предыдущий месяц',
    nextMonth: 'Следующий месяц',
    backToCurrent: '{month}, вернуться к текущему',
    gotIt: 'Понятно',
    snoozed: 'Напомню через две недели',
    snoozeLabel: 'Напомнить через две недели',
    addIncome: '+ Доход',
    addExpense: '+ Расход',
    tabOverview: 'Обзор',
    tabOps: 'Операции',
    tabPlan: 'План',
    tabMore: 'Ещё',
    repeated: 'Повторено сегодня',
    savedIn: 'Сохранено в {month}',
    saved: 'Сохранено',
    txDeleted: 'Операция удалена',
    kindSpend: 'Траты',
    incomes: 'Доходы',
    expenses: 'Расходы',
    all: 'Все',
    backupOld: 'Последней резервной копии больше месяца ({date}).',
    backupNone: 'Резервной копии ещё нет.',
    dataLocal: 'Данные хранятся только на этом телефоне.',
    makeBackup: 'Сделать копию →',
    heroLbl: 'Остаток на конец периода',
    startLbl: 'Начальная {amount}',
    fromPrev: ' · из прошлого месяца',
    savedLbl: 'Отложено',
    totalSpent: 'Всего списано',
    planSub: 'план {amount}',
    tipsSub: 'чаевые {amount}',
    overspend: 'перерасход · ',
    noJar: 'без копилки',
    inTotal: 'в общем {amount}',
    withJar: 'с копилкой',
    whereMoney: 'Куда ушли деньги',
    noSpendMonth: 'Трат в этом месяце пока нет',
    spentCap: 'потрачено',
    moreN: 'ещё {n}',
    byDay: 'По дням',
    noIncomeMonth: 'Доходов в этом месяце пока нет',
    chartSoon: 'Здесь появится график трат',
    peakIncome: 'Яркий столбец — самый доходный день. Копилка в траты не входит.',
    peakSpend: 'Яркий столбец — самый затратный день. Копилка в траты не входит.',
    trendTitle: 'Динамика за полгода',
    trendEmpty: 'График появится, когда наберётся хотя бы два месяца операций',
    legIncome: 'доходы',
    legExpense: 'расходы',
    legBalance: 'остаток',
    keepPct: 'Сохраняешь {n}% дохода',
    overPct: 'Тратишь на {n}% больше дохода',
    trendHint: 'За шесть месяцев: доля дохода, которая не ушла на траты. Копилка считается сохранённой.',
    recentOps: 'Последние операции',
    addFirst: 'Добавь первую операцию кнопкой внизу',
    noCategory: 'Без категории',
    deletedOps: 'Удалено операций: {n}',
    movedOps: 'Перенесено операций: {n}',
    searchPh: 'Поиск по описанию или категории',
    clearSearch: 'Очистить поиск',
    found: 'Найдено {n}, итого {total}',
    nothingFound: 'Ничего не нашлось',
    noOps: 'Операций нет',
    selectHint: 'Зажми операцию, чтобы выбрать несколько',
    selectedOps: 'Выбранные операции',
    clearSel: 'Снять выбор',
    move: 'Перенести',
    del: 'Удалить',
    moveOnly: 'Перенести можно только расходы или только доходы',
    moveTitle: 'Перенести {n} в категорию',
    notAmount: 'Не похоже на сумму',
    jarLeft: 'ещё {amount}',
    goalLow: 'цель',
    planLow: 'план',
    plan: 'План',
    fact: 'Факт',
    diff: 'Разница',
    planHint: 'Нажми на сумму плана, чтобы изменить её только на {month}. Можно считать прямо в поле: 3000+1500.',
    jar: 'Копилка',
    jarHint: 'Не трата: деньги остаются твоими, просто отложены. План — сколько отложить за месяц, больше — только лучше.',
    plansReset: 'Планы месяца сброшены',
    resetPlans: 'Сбросить планы месяца к значениям по умолчанию',
    startTitle: 'Начальная сумма — {month}',
    autoPh: '{n} (авто)',
    startHint: 'Пусто — подставится остаток прошлого месяца. Минус тоже можно, если месяц начался с долга.',
    appearance: 'Оформление',
    minimal: 'Минимализм',
    glass: 'Стекло',
    themeAuto: 'Как в системе',
    themeLight: 'Светлая',
    themeDark: 'Тёмная',
    categories: 'Категории',
    addCat: '+ Добавить',
    jarTag: 'копилка',
    tipsTag: 'чаевые',
    data: 'Данные',
    exportXlsx: 'Экспорт месяца в Excel',
    importXlsx: 'Импорт из таблицы (.xlsx)',
    backup: 'Резервная копия',
    restore: 'Восстановить из копии',
    undoRestoreBtn: 'Вернуть данные до восстановления',
    exportBrokenBtn: 'Выгрузить повреждённые данные',
    forgetBrokenBtn: 'Удалить повреждённые данные из приложения',
    readOnlyHint: 'Хранилище сейчас только для чтения: импорт и восстановление выключены, чтобы ничего не затереть.',
    lastBackup: 'Последняя резервная копия: {date}.',
    importHelp: 'Импорт понимает шаблон Google Таблиц «Месячный бюджет»: листы «Сводка» и «Транзакции». Повторный импорт не дублирует операции.',
    backupBefore: 'Делай резервную копию перед сменой телефона или переустановкой.',
    gestures: 'Жесты',
    gesturesHint: 'Длинный свайп по экрану — соседняя вкладка, короткий — соседний раздел. По шапке с месяцем — соседний месяц, тап по месяцу — текущий. Зажми операцию, чтобы выбрать несколько. Шторку можно смахнуть вниз.',
    showIntro: 'Показать знакомство',
    importAllDone: 'Всё уже импортировано ({n})',
    noOpsInFile: 'В файле не нашлось операций',
    exportFile: 'Монетка {month}.xlsx',
    importAdded: 'Импорт: +{n} операция|Импорт: +{n} операции|Импорт: +{n} операций|Импорт: +{n} операции',
    importSkipped: ', {n} уже были',
    importCats: ', новых категорий {n}',
    fileReadFail: 'Не удалось прочитать файл',
    exportFail: 'Экспорт не удался',
    backupFail: 'Не удалось сохранить копию',
    notBackup: 'Это не файл резервной копии Монетки',
    opsN: '{n} операция|{n} операции|{n} операций|{n} операции',
    droppedN: '\n{n} повреждённая запись в копии будет пропущена.|\n{n} повреждённые записи в копии будут пропущены.|\n{n} повреждённых записей в копии будут пропущены.|\n{n} повреждённой записи в копии будут пропущены.',
    restoreConfirm: 'Заменить данные копией?\nСейчас: {now}. В копии: {copy}.{skipped}',
    restoreNoSnapshot: 'Не удалось сохранить текущие данные на случай отката. Всё равно восстановить?',
    restored: 'Данные восстановлены из копии',
    noSaved: 'Сохранённых данных нет',
    undoRestoreConfirm: 'Вернуть данные, которые были до последнего восстановления?\nСейчас: {now}. Было: {was}.',
    restoredBack: 'Возвращены данные до восстановления',
    saveFileFail: 'Не удалось сохранить файл',
    forgetConfirm: 'Удалить сохранённые повреждённые данные из приложения? Это необратимо.',
    newOp: 'Новая операция',
    op: 'Операция',
    expense: 'Расход',
    income: 'Доход',
    amountAria: 'Сумма',
    calcFail: 'не получается посчитать',
    description: 'Описание',
    descPh: 'Например: продукты, такси',
    date: 'Дата',
    repeatToday: 'Повторить сегодня',
    repeatNote: ' ({amount}, исходная не изменится)',
    save: 'Сохранить',
    newCat: 'Новая категория',
    category: 'Категория',
    name: 'Название',
    namePh: 'Например: Техника',
    dup: 'Такая категория уже есть',
    planDefault: 'План по умолчанию на месяц, {cur}',
    colorAria: 'Цвет {color}',
    jarDesc: 'Деньги откладываются, а не тратятся: в расходы не входят, план — цель накоплений',
    tips: 'Чаевые',
    tipsDesc: 'Входят в доходы и отдельно копятся в «Отложено» вместе с копилкой',
    inCat: 'В категории {n} операция. При удалении перенести её в:|В категории {n} операции. При удалении перенести их в:|В категории {n} операций. При удалении перенести их в:|В категории {n} операции. При удалении перенести их в:',
    ownPlan: 'В этом месяце задан свой план: {amount}.',
    delCatConfirm: 'Удалить категорию «{name}»?',
    catDeleted: 'Категория удалена',
  },
  uk: {
    saveFailed: 'Не вдалося зберегти дані. Перевір вільне місце на телефоні.',
    localeTitle: 'Мова і валюта',
    currencyHint: 'Валюта — лише підпис до сум: при зміні числа не перераховуються.',
    undoStale: 'Відтоді були інші зміни — скасувати не можна',
    undone: 'Скасовано',
    undoBtn: 'Скасувати',
    prevMonth: 'Попередній місяць',
    nextMonth: 'Наступний місяць',
    backToCurrent: '{month}, повернутися до поточного',
    gotIt: 'Зрозуміло',
    snoozed: 'Нагадаю за два тижні',
    snoozeLabel: 'Нагадати за два тижні',
    addIncome: '+ Дохід',
    addExpense: '+ Витрата',
    tabOverview: 'Огляд',
    tabOps: 'Операції',
    tabPlan: 'План',
    tabMore: 'Ще',
    repeated: 'Повторено сьогодні',
    savedIn: 'Збережено: {month}',
    saved: 'Збережено',
    txDeleted: 'Операцію видалено',
    kindSpend: 'Витрати',
    incomes: 'Доходи',
    expenses: 'Витрати',
    all: 'Усі',
    backupOld: 'Остання резервна копія — понад місяць тому ({date}).',
    backupNone: 'Резервної копії ще немає.',
    dataLocal: 'Дані зберігаються лише на цьому телефоні.',
    makeBackup: 'Зробити копію →',
    heroLbl: 'Залишок на кінець періоду',
    startLbl: 'Початкова {amount}',
    fromPrev: ' · з минулого місяця',
    savedLbl: 'Відкладено',
    totalSpent: 'Усього списано',
    planSub: 'план {amount}',
    tipsSub: 'чайові {amount}',
    overspend: 'перевитрата · ',
    noJar: 'без скарбнички',
    inTotal: 'загалом {amount}',
    withJar: 'зі скарбничкою',
    whereMoney: 'Куди пішли гроші',
    noSpendMonth: 'Витрат цього місяця ще немає',
    spentCap: 'витрачено',
    moreN: 'ще {n}',
    byDay: 'За днями',
    noIncomeMonth: 'Доходів цього місяця ще немає',
    chartSoon: 'Тут зʼявиться графік витрат',
    peakIncome: 'Яскравий стовпчик — найприбутковіший день. Скарбничка у витрати не входить.',
    peakSpend: 'Яскравий стовпчик — найвитратніший день. Скарбничка у витрати не входить.',
    trendTitle: 'Динаміка за пів року',
    trendEmpty: 'Графік зʼявиться, коли назбирається хоча б два місяці операцій',
    legIncome: 'доходи',
    legExpense: 'витрати',
    legBalance: 'залишок',
    keepPct: 'Заощаджуєш {n}% доходу',
    overPct: 'Витрачаєш на {n}% більше за дохід',
    trendHint: 'За шість місяців: частка доходу, яка не пішла на витрати. Скарбничка вважається заощадженою.',
    recentOps: 'Останні операції',
    addFirst: 'Додай першу операцію кнопкою внизу',
    noCategory: 'Без категорії',
    deletedOps: 'Видалено операцій: {n}',
    movedOps: 'Перенесено операцій: {n}',
    searchPh: 'Пошук за описом або категорією',
    clearSearch: 'Очистити пошук',
    found: 'Знайдено {n}, разом {total}',
    nothingFound: 'Нічого не знайдено',
    noOps: 'Операцій немає',
    selectHint: 'Утримуй операцію, щоб вибрати кілька',
    selectedOps: 'Вибрані операції',
    clearSel: 'Зняти вибір',
    move: 'Перенести',
    del: 'Видалити',
    moveOnly: 'Переносити можна лише витрати або лише доходи',
    moveTitle: 'Перенести {n} до категорії',
    notAmount: 'Не схоже на суму',
    jarLeft: 'ще {amount}',
    goalLow: 'мета',
    planLow: 'план',
    plan: 'План',
    fact: 'Факт',
    diff: 'Різниця',
    planHint: 'Натисни на суму плану, щоб змінити її лише на {month}. Можна рахувати прямо в полі: 3000+1500.',
    jar: 'Скарбничка',
    jarHint: 'Не витрата: гроші залишаються твоїми, просто відкладені. План — скільки відкласти за місяць, більше — лише краще.',
    plansReset: 'Плани місяця скинуто',
    resetPlans: 'Скинути плани місяця до типових',
    startTitle: 'Початкова сума — {month}',
    autoPh: '{n} (авто)',
    startHint: 'Якщо порожньо, підставиться залишок минулого місяця. Мінус теж можна, якщо місяць почався з боргу.',
    appearance: 'Оформлення',
    minimal: 'Мінімалізм',
    glass: 'Скло',
    themeAuto: 'Як у системі',
    themeLight: 'Світла',
    themeDark: 'Темна',
    categories: 'Категорії',
    addCat: '+ Додати',
    jarTag: 'скарбничка',
    tipsTag: 'чайові',
    data: 'Дані',
    exportXlsx: 'Експорт місяця в Excel',
    importXlsx: 'Імпорт із таблиці (.xlsx)',
    backup: 'Резервна копія',
    restore: 'Відновити з копії',
    undoRestoreBtn: 'Повернути дані до відновлення',
    exportBrokenBtn: 'Вивантажити пошкоджені дані',
    forgetBrokenBtn: 'Видалити пошкоджені дані із застосунку',
    readOnlyHint: 'Сховище зараз лише для читання: імпорт і відновлення вимкнено, щоб нічого не перезаписати.',
    lastBackup: 'Остання резервна копія: {date}.',
    importHelp: 'Імпорт розуміє шаблон Google Таблиць «Місячний бюджет»: аркуші «Сводка» і «Транзакции». Повторний імпорт не дублює операції.',
    backupBefore: 'Роби резервну копію перед зміною телефона або перевстановленням.',
    gestures: 'Жести',
    gesturesHint: 'Довгий свайп по екрану — сусідня вкладка, короткий — сусідній розділ. По шапці з місяцем — сусідній місяць, тап по місяцю — поточний. Утримуй операцію, щоб вибрати кілька. Шторку можна змахнути вниз.',
    showIntro: 'Показати знайомство',
    importAllDone: 'Усе вже імпортовано ({n})',
    noOpsInFile: 'У файлі не знайшлося операцій',
    exportFile: 'Монетка {month}.xlsx',
    importAdded: 'Імпорт: +{n} операція|Імпорт: +{n} операції|Імпорт: +{n} операцій|Імпорт: +{n} операції',
    importSkipped: ', {n} уже були',
    importCats: ', нових категорій: {n}',
    fileReadFail: 'Не вдалося прочитати файл',
    exportFail: 'Експорт не вдався',
    backupFail: 'Не вдалося зберегти копію',
    notBackup: 'Це не файл резервної копії Монетки',
    opsN: '{n} операція|{n} операції|{n} операцій|{n} операції',
    droppedN: '\n{n} пошкоджений запис у копії буде пропущено.|\n{n} пошкоджені записи в копії буде пропущено.|\n{n} пошкоджених записів у копії буде пропущено.|\n{n} пошкодженого запису в копії буде пропущено.',
    restoreConfirm: 'Замінити дані копією?\nЗараз: {now}. У копії: {copy}.{skipped}',
    restoreNoSnapshot: 'Не вдалося зберегти поточні дані на випадок відкату. Усе одно відновити?',
    restored: 'Дані відновлено з копії',
    noSaved: 'Збережених даних немає',
    undoRestoreConfirm: 'Повернути дані, які були до останнього відновлення?\nЗараз: {now}. Було: {was}.',
    restoredBack: 'Повернено дані до відновлення',
    saveFileFail: 'Не вдалося зберегти файл',
    forgetConfirm: 'Видалити збережені пошкоджені дані із застосунку? Це незворотно.',
    newOp: 'Нова операція',
    op: 'Операція',
    expense: 'Витрата',
    income: 'Дохід',
    amountAria: 'Сума',
    calcFail: 'не вдається порахувати',
    description: 'Опис',
    descPh: 'Наприклад: продукти, таксі',
    date: 'Дата',
    repeatToday: 'Повторити сьогодні',
    repeatNote: ' ({amount}, початкова не зміниться)',
    save: 'Зберегти',
    newCat: 'Нова категорія',
    category: 'Категорія',
    name: 'Назва',
    namePh: 'Наприклад: Техніка',
    dup: 'Така категорія вже є',
    planDefault: 'Типовий план на місяць, {cur}',
    colorAria: 'Колір {color}',
    jarDesc: 'Гроші відкладаються, а не витрачаються: у витрати не входять, план — мета заощаджень',
    tips: 'Чайові',
    tipsDesc: 'Входять у доходи й окремо накопичуються у «Відкладено» разом зі скарбничкою',
    inCat: 'У категорії {n} операція. Під час видалення перенести її до:|У категорії {n} операції. Під час видалення перенести їх до:|У категорії {n} операцій. Під час видалення перенести їх до:|У категорії {n} операції. Під час видалення перенести їх до:',
    ownPlan: 'Для цього місяця задано окремий план: {amount}.',
    delCatConfirm: 'Видалити категорію «{name}»?',
    catDeleted: 'Категорію видалено',
  },
  en: {
    saveFailed: "Couldn't save your data. Check free space on your phone.",
    localeTitle: 'Language and currency',
    currencyHint: 'Currency is only a label: amounts are not converted when you change it.',
    undoStale: "Other changes were made since — can't undo",
    undone: 'Undone',
    undoBtn: 'Undo',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    backToCurrent: '{month}, back to current',
    gotIt: 'Got it',
    snoozed: "I'll remind you in two weeks",
    snoozeLabel: 'Remind me in two weeks',
    addIncome: '+ Income',
    addExpense: '+ Expense',
    tabOverview: 'Overview',
    tabOps: 'Transactions',
    tabPlan: 'Plan',
    tabMore: 'More',
    repeated: 'Repeated today',
    savedIn: 'Saved to {month}',
    saved: 'Saved',
    txDeleted: 'Transaction deleted',
    kindSpend: 'Spending',
    incomes: 'Income',
    expenses: 'Expenses',
    all: 'All',
    backupOld: 'Your last backup is over a month old ({date}).',
    backupNone: 'No backup yet.',
    dataLocal: 'Your data is stored only on this phone.',
    makeBackup: 'Back up now →',
    heroLbl: 'Balance at end of period',
    startLbl: 'Starting {amount}',
    fromPrev: ' · from last month',
    savedLbl: 'Set aside',
    totalSpent: 'Total spent',
    planSub: 'plan {amount}',
    tipsSub: 'tips {amount}',
    overspend: 'over budget · ',
    noJar: 'excl. savings',
    inTotal: 'total {amount}',
    withJar: 'incl. savings',
    whereMoney: 'Where the money went',
    noSpendMonth: 'No spending this month yet',
    spentCap: 'spent',
    moreN: '{n} more',
    byDay: 'By day',
    noIncomeMonth: 'No income this month yet',
    chartSoon: 'The spending chart will appear here',
    peakIncome: "The brightest bar is the day with the most income. Savings aren't counted as spending.",
    peakSpend: "The brightest bar is the day with the most spending. Savings aren't counted as spending.",
    trendTitle: 'Six-month trend',
    trendEmpty: 'The chart appears once you have at least two months of transactions',
    legIncome: 'income',
    legExpense: 'expenses',
    legBalance: 'balance',
    keepPct: 'You keep {n}% of your income',
    overPct: 'You spend {n}% more than you earn',
    trendHint: "Over six months: the share of income that wasn't spent. Savings count as kept.",
    recentOps: 'Recent transactions',
    addFirst: 'Add your first transaction with the button below',
    noCategory: 'No category',
    deletedOps: 'Transactions deleted: {n}',
    movedOps: 'Transactions moved: {n}',
    searchPh: 'Search by note or category',
    clearSearch: 'Clear search',
    found: 'Found {n}, total {total}',
    nothingFound: 'Nothing found',
    noOps: 'No transactions',
    selectHint: 'Press and hold a transaction to select several',
    selectedOps: 'Selected transactions',
    clearSel: 'Clear selection',
    move: 'Move',
    del: 'Delete',
    moveOnly: 'You can move only expenses or only income at a time',
    moveTitle: 'Move {n} to category',
    notAmount: "That doesn't look like an amount",
    jarLeft: '{amount} to go',
    goalLow: 'goal',
    planLow: 'plan',
    plan: 'Plan',
    fact: 'Actual',
    diff: 'Difference',
    planHint: 'Tap a planned amount to change it for {month} only. You can calculate right in the field: 3000+1500.',
    jar: 'Savings',
    jarHint: "Not spending: the money stays yours, it's just set aside. The plan is how much to set aside each month — more is only better.",
    plansReset: "This month's plans were reset",
    resetPlans: "Reset this month's plans to defaults",
    startTitle: 'Starting balance — {month}',
    autoPh: '{n} (auto)',
    startHint: "Leave empty to use last month's balance. A negative amount is fine if the month started in debt.",
    appearance: 'Appearance',
    minimal: 'Minimal',
    glass: 'Glass',
    themeAuto: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    categories: 'Categories',
    addCat: '+ Add',
    jarTag: 'savings',
    tipsTag: 'tips',
    data: 'Data',
    exportXlsx: 'Export month to Excel',
    importXlsx: 'Import from spreadsheet (.xlsx)',
    backup: 'Backup',
    restore: 'Restore from backup',
    undoRestoreBtn: 'Undo the last restore',
    exportBrokenBtn: 'Export damaged data',
    forgetBrokenBtn: 'Delete damaged data from the app',
    readOnlyHint: 'Storage is read-only right now: import and restore are off so nothing gets overwritten.',
    lastBackup: 'Last backup: {date}.',
    importHelp: 'Import understands the Google Sheets "Monthly budget" template: the sheets "Сводка" and "Транзакции". Importing again does not duplicate transactions.',
    backupBefore: 'Back up before changing phones or reinstalling.',
    gestures: 'Gestures',
    gesturesHint: 'A long swipe across the screen switches tabs, a short one switches sections. Swipe the month header to change the month, tap it to go back to the current one. Press and hold a transaction to select several. Swipe a sheet down to close it.',
    showIntro: 'Show the intro',
    importAllDone: 'Everything is already imported ({n})',
    noOpsInFile: 'No transactions found in the file',
    exportFile: 'Monetka {month}.xlsx',
    importAdded: 'Import: +{n} transaction|Import: +{n} transactions',
    importSkipped: ', {n} already there',
    importCats: ', new categories: {n}',
    fileReadFail: "Couldn't read the file",
    exportFail: 'Export failed',
    backupFail: "Couldn't save the backup",
    notBackup: 'This is not a Monetka backup file',
    opsN: '{n} transaction|{n} transactions',
    droppedN: '\n{n} damaged record in the backup will be skipped.|\n{n} damaged records in the backup will be skipped.',
    restoreConfirm: 'Replace your data with the backup?\nNow: {now}. In backup: {copy}.{skipped}',
    restoreNoSnapshot: "Couldn't save your current data for rollback. Restore anyway?",
    restored: 'Data restored from backup',
    noSaved: 'No saved data',
    undoRestoreConfirm: 'Bring back the data from before the last restore?\nNow: {now}. Before: {was}.',
    restoredBack: 'Data from before the restore is back',
    saveFileFail: "Couldn't save the file",
    forgetConfirm: 'Delete the saved damaged data from the app? This cannot be undone.',
    newOp: 'New transaction',
    op: 'Transaction',
    expense: 'Expense',
    income: 'Income',
    amountAria: 'Amount',
    calcFail: "can't calculate",
    description: 'Note',
    descPh: 'For example: groceries, taxi',
    date: 'Date',
    repeatToday: 'Repeat today',
    repeatNote: " ({amount}, the original stays as is)",
    save: 'Save',
    newCat: 'New category',
    category: 'Category',
    name: 'Name',
    namePh: 'For example: Electronics',
    dup: 'This category already exists',
    planDefault: 'Default monthly plan, {cur}',
    colorAria: 'Color {color}',
    jarDesc: 'Money is set aside, not spent: not counted as expenses, the plan is a savings goal',
    tips: 'Tips',
    tipsDesc: 'Counted as income and also add up under “Set aside” together with savings',
    inCat: 'This category has {n} transaction. When deleting, move it to:|This category has {n} transactions. When deleting, move them to:',
    ownPlan: 'This month has its own plan: {amount}.',
    delCatConfirm: 'Delete the category “{name}”?',
    catDeleted: 'Category deleted',
  },
});

export function App() {
  const [s, setS] = useState<State | null>(null);
  const sRef = useRef<State | null>(null);
  const [month, setMonth] = useState(monthKey(todayISO()));
  const [tab, setTab] = useState<Tab>('overview');
  const [dir, setDir] = useState<1 | -1>(1);
  const [monthDir, setMonthDir] = useState<1 | -1 | 0>(0);
  /** Переход из напоминания: «Ещё» прокручивает к резервной копии и подсвечивает кнопку */
  const spotBackup = useRef(false);
  const [editing, setEditing] = useState<Tx | 'new-expense' | 'new-income' | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [notice, setNotice] = useState<() => string>();
  const persist = useRef(true);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const mainRef = useRef<HTMLElement>(null);

  const notify: Notify = (text) => setToast({ id: Date.now(), text });
  const saver = useRef<ReturnType<typeof createSaver> | null>(null);
  const flush = () => {
    if (sRef.current && persist.current) saver.current?.save(sRef.current);
    return saver.current?.flush();
  };

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const demo = !Capacitor.isNativePlatform() && q.has('demo');
    const boot = demo
      ? import('./demo.ts').then(({ demoState }) => {
        const st = demoState();
        if (q.get('style') === 'glass') st.style = 'glass';
        if (q.get('theme') === 'dark' || q.get('theme') === 'light') st.theme = q.get('theme') as ThemeMode;
        const t = q.get('tab') as Tab | null;
        if (t && TABS.includes(t)) setTab(t);
        if (q.has('onboarding')) st.onboarded = false;
        if (isLang(q.get('lang'))) {
          st.lang = q.get('lang') as Lang;
          st.currency = detectLocale([st.lang]).currency;
          st.categories = translateStock(st.categories, st.lang);
        }
        if (isCurrency(q.get('cur'))) st.currency = q.get('cur') as Currency;
        return { state: st, seq: 0, persist: false, notice: undefined, fresh: false };
      })
      : load();
    boot.then((r) => {
      const st = withLocale(r.state, !!r.fresh);
      setLocale(st.lang!, st.currency!);
      persist.current = r.persist;
      saver.current = createSaver(r.seq, () => notify(t('saveFailed')));
      sRef.current = st;
      setS(st);
      // Функцию в сеттер — только обёрнутой: иначе Preact примет её за апдейтер и положит в state строку
      setNotice(() => r.notice);
    });
  }, []);
  useEffect(() => { if (s && persist.current) saver.current?.save(s); }, [s]);
  useEffect(() => {
    const onHide = () => { void flush(); };
    const onVis = () => { if (document.visibilityState === 'hidden') onHide(); };
    document.addEventListener('visibilitychange', onVis);
    addEventListener('pagehide', onHide);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') popBack(); };
    addEventListener('keydown', onKey);
    const subs = Capacitor.isNativePlatform() ? [
      CapApp.addListener('pause', onHide),
      CapApp.addListener('backButton', () => {
        if (popBack()) return;
        if (tabRef.current !== 'overview') goTab('overview');
        else void Promise.resolve(flush()).finally(() => CapApp.exitApp());
      }),
    ] : [];
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      removeEventListener('pagehide', onHide);
      removeEventListener('keydown', onKey);
      subs.forEach((p) => p.then((h) => h.remove()));
    };
  }, []);

  const mode = s?.theme, style = s?.style;
  useEffect(() => {
    if (!mode) return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = mode === 'dark' || (mode === 'auto' && mq.matches);
      const root = document.documentElement;
      root.dataset.theme = dark ? 'dark' : 'light';
      root.dataset.style = style ?? 'minimal';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [mode, style]);
  useEffect(() => {
    if (style !== 'glass') return;
    const root = document.documentElement;
    let idle = 0;
    const onScroll = () => {
      if (!idle) root.dataset.scrolling = '';
      clearTimeout(idle);
      idle = window.setTimeout(() => { idle = 0; delete root.dataset.scrolling; }, 180);
    };
    addEventListener('scroll', onScroll, { passive: true });
    return () => { removeEventListener('scroll', onScroll); clearTimeout(idle); delete root.dataset.scrolling; };
  }, [style]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 5000 : 2800);
    return () => clearTimeout(t);
  }, [toast]);

  // Язык и валюта — глобальные для форматтеров: выставляются до рендера, смена в настройках сразу перерисовывает всё
  if (s) setLocale(s.lang ?? 'ru', s.currency ?? 'RUB');
  const m = useMemo(() => (s ? summarize(s, month) : null), [s, month]);

  const goTab = (t: Tab) => {
    const cur = TABS.indexOf(tabRef.current), next = TABS.indexOf(t);
    if (cur === next) return;
    setDir(next > cur ? 1 : -1);
    setTab(t);
    haptic();
    scrollTo({ top: 0 });
  };
  const goMonth = (delta: number) => {
    setMonthDir(delta > 0 ? 1 : delta < 0 ? -1 : 0);
    setMonth((k) => (delta === 0 ? monthKey(todayISO()) : shiftMonth(k, delta)));
    haptic();
  };
  const dragContent = (dx: number | null) => {
    const el = mainRef.current;
    if (!el) return;
    if (dx == null) { el.style.transition = ''; el.style.transform = ''; return; }
    const i = TABS.indexOf(tabRef.current);
    const edge = (dx > 0 && i === 0) || (dx < 0 && i === TABS.length - 1);
    el.style.transition = 'none';
    el.style.transform = `translateX(${dx * (edge ? 0.12 : 0.35)}px)`;
  };
  const swipeTabs = useSwipe((d) => { const t = TABS[TABS.indexOf(tabRef.current) + d]; if (!t) return false; goTab(t); }, { onDrag: dragContent });
  const swipeMonth = useSwipe((d) => { goMonth(d); });

  if (!s || !m) return <div class="splash" />;

  const replace: Replace = (next, undoText) => {
    const prev = sRef.current!;
    sRef.current = next;
    setS(next);
    if (undoText) setToast({ id: Date.now(), text: undoText, undo: prev, after: next });
    else setToast((t) => (t?.undo ? null : t));
  };
  const update: Update = (fn, undoText) => {
    const d = structuredClone(sRef.current!);
    fn(d);
    replace(d, undoText);
  };
  const undo = () => {
    if (!toast?.undo) return;
    if (sRef.current !== toast.after) { setToast({ id: Date.now(), text: t('undoStale') }); return; }
    sRef.current = toast.undo;
    setS(toast.undo);
    setToast({ id: Date.now(), text: t('undone') });
    haptic();
  };

  const isCurrent = month === monthKey(todayISO());
  const dq = Capacitor.isNativePlatform() ? null : new URLSearchParams(location.search);
  const obFreeze = dq?.has('demo') && dq.has('obstep') ? { step: Number(dq.get('obstep')), t: Number(dq.get('obt') ?? 3) } : undefined;

  return (
    <div class="app">
      {s.style === 'glass' && <GlassDefs />}
      <header class="top" {...swipeMonth}>
        <button class="icon-btn" aria-label={t('prevMonth')} onClick={() => goMonth(-1)}>‹</button>
        <button class="month" aria-label={isCurrent ? monthTitle(month) : t('backToCurrent', { month: monthTitle(month) })} onClick={() => goMonth(0)}>
          <span key={month} class={monthDir > 0 ? 'm-in next' : monthDir < 0 ? 'm-in prev' : 'm-in'}>{monthTitle(month)}</span>
          {!isCurrent && <i class="today-dot" aria-hidden="true" />}
        </button>
        <button class="icon-btn" aria-label={t('nextMonth')} onClick={() => goMonth(1)}>›</button>
      </header>

      <main ref={mainRef} class="content-wrap" {...swipeTabs}>
        <div key={tab} class={dir > 0 ? 'content enter-next' : 'content enter-prev'}>
          {notice && (
            <section class="card notice">
              <span>{notice()}</span>
              <button class="link" onClick={() => setNotice(undefined)}>{t('gotIt')}</button>
            </section>
          )}
          {tab === 'overview' && <Overview s={s} m={m} month={month} onEdit={setEditing}
            onBackup={() => { spotBackup.current = true; goTab('more'); }}
            onSnooze={() => { update((d) => { d.backupSnooze = shiftDay(todayISO(), 14); }); notify(t('snoozed')); }} />}
          {tab === 'ops' && <Ops s={s} m={m} onEdit={setEditing} update={update} />}
          {tab === 'plan' && <Plan s={s} m={m} month={month} update={update} notify={notify} />}
          {tab === 'more' && <More s={s} m={m} month={month} readOnly={!persist.current} current={() => sRef.current!} update={update} replace={replace} notify={notify}
            takeSpot={() => { const v = spotBackup.current; spotBackup.current = false; return v; }} />}
        </div>
      </main>

      {(tab === 'overview' || tab === 'ops') && (
        <div class="fabs">
          <button class="fab income" onClick={() => { haptic(); setEditing('new-income'); }}>{t('addIncome')}</button>
          <button class="fab expense" onClick={() => { haptic(); setEditing('new-expense'); }}>{t('addExpense')}</button>
        </div>
      )}

      <nav class="tabs" style={{ '--i': TABS.indexOf(tab) }}>
        <span class="tab-pill" aria-hidden="true" />
        {([['overview', t('tabOverview'), 'M4 13h4v7H4zM10 8h4v12h-4zM16 4h4v16h-4z'], ['ops', t('tabOps'), 'M4 6h16M4 12h16M4 18h10'], ['plan', t('tabPlan'), 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z'], ['more', t('tabMore'), 'M5 12h.01M12 12h.01M19 12h.01']] as const).map(([k, l, d]) => (
          <button class={tab === k ? 'tab on' : 'tab'} aria-current={tab === k ? 'page' : undefined} onClick={() => goTab(k)}>
            <svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={d} /></svg>{l}</button>
        ))}
      </nav>

      {editing && (
        <TxSheet s={s} month={month} value={editing} onClose={() => setEditing(null)}
          onSave={(tx, mode) => {
            update((d) => { const i = d.txs.findIndex((t) => t.id === tx.id); if (i >= 0) d.txs[i] = tx; else d.txs.push(tx); },
              mode === 'repeat' ? t('repeated') : undefined);
            setEditing(null);
            haptic(true);
            const k = monthKey(tx.date);
            if (k !== month) {
              setMonthDir(k > month ? 1 : -1);
              setMonth(k);
              if (mode !== 'repeat') notify(t('savedIn', { month: monthInText(k) }));
            } else if (mode === 'edit') notify(t('saved'));
          }}
          onDelete={(id) => {
            update((d) => { d.txs = d.txs.filter((t) => t.id !== id); }, t('txDeleted'));
            setEditing(null);
          }} />
      )}
      {!s.onboarded && (
        <Onboarding style={s.style ?? 'minimal'} lang={s.lang ?? 'ru'} currency={s.currency ?? 'RUB'}
          onLocale={(l, c) => update((d) => { d.lang = l; d.currency = c; relocalize(d, l); })} onStyle={(k) => update((d) => { d.style = k; })} freeze={obFreeze}
          onDone={() => { haptic(true); update((d) => { d.onboarded = true; }); }} />
      )}
      {toast && (
        <div class="toast" key={toast.id} role="status">
          <span>{toast.text}</span>
          {toast.undo && <button class="toast-undo" onClick={undo}>{t('undoBtn')}</button>}
        </div>
      )}
    </div>
  );
}

type M = ReturnType<typeof summarize>;

const dayKinds = () => [['expense', t('kindSpend')], ['income', t('incomes')]] as const;
const opsFilters = () => [['all', t('all')], ['expense', t('expenses')], ['income', t('incomes')]] as const;
const planKinds = () => [['expense', t('expenses')], ['income', t('incomes')]] as const;

function Overview({ s, m, month, onEdit, onBackup, onSnooze }: {
  s: State; m: M; month: string; onEdit: (t: Tx) => void; onBackup: () => void; onSnooze: () => void;
}) {
  const [dayKind, setDayKind] = useState<Kind>('expense');
  const daySwipe = useSwipe((d) => stepOption(dayKinds(), dayKind, d, setDayKind), { short: true });
  const trend = useMemo(() => monthTrend(s, month, 6), [s, month]);
  const slices = m.expenseRows.filter((r) => r.fact > 0 && !r.cat.savings).sort((a, b) => b.fact - a.fact)
    .map((r) => ({ label: r.cat.name, value: r.fact, color: r.cat.color }));
  const today = monthKey(todayISO()) === month ? new Date().getDate() : undefined;
  const pct = m.deltaPct == null ? '' : `${m.deltaPct >= 0 ? '+' : '−'}${num(Math.abs(Math.round(m.deltaPct * 100)))}%`;
  const overPlan = m.spentPlan > 0 && m.spent > m.spentPlan;
  const dayTotal = dayKind === 'income' ? m.income : m.spent;
  const tIncome = trend.reduce((a, p) => a + p.income, 0);
  const tSpent = trend.reduce((a, p) => a + p.spent, 0);
  const active = trend.filter((p) => p.income || p.spent || p.saved).length;
  const keepRate = tIncome > 0 ? Math.round(((tIncome - tSpent) / tIncome) * 100) : null;

  return (
    <>
      {needsBackup(s) && (
        <section class="card notice soft">
          <button class="notice-close" aria-label={t('snoozeLabel')} onClick={onSnooze}>×</button>
          <span>{s.lastBackup ? t('backupOld', { date: longDate(s.lastBackup) }) : t('backupNone')} {t('dataLocal')}</span>
          <button class="link" onClick={onBackup}>{t('makeBackup')}</button>
        </section>
      )}
      <section class="card hero">
        <div class="hero-lbl">{t('heroLbl')}</div>
        <Money class="hero-val" value={m.end} />
        <div class="hero-row">
          <span class="muted">{t('startLbl', { amount: money(m.start) })}{m.startIsAuto && m.start !== 0 ? t('fromPrev') : ''}</span>
          <span class={m.delta >= 0 ? 'chip pos' : 'chip neg'}>{signedMoney(m.delta)}{pct && ` · ${pct}`}</span>
        </div>
      </section>

      <section class="grid2">
        <Stat label={t('incomes')} value={m.income} sub={m.incomePlan ? t('planSub', { amount: money(m.incomePlan) }) : m.tips ? t('tipsSub', { amount: money(m.tips) }) : ''} tone="pos" />
        <Stat label={t('expenses')} value={m.spent} tone="neg"
          sub={m.spentPlan ? `${overPlan ? t('overspend') : ''}${t('planSub', { amount: money(m.spentPlan) })}` : t('noJar')} />
        <Stat label={t('savedLbl')} value={m.saved} sub={t('inTotal', { amount: money(m.stash) })} />
        <Stat label={t('totalSpent')} value={m.expenseTotal} sub={t('withJar')} />
      </section>

      <section class="card">
        <h2>{t('whereMoney')}</h2>
        {slices.length === 0 ? <Empty text={t('noSpendMonth')} /> : (
          <div class="donut-wrap">
            <Donut slices={slices} total={m.spent} caption={t('spentCap')} />
            <ul class="legend">
              {slices.slice(0, 7).map((x) => (
                <li><i style={{ background: x.color }} /><span>{x.label}</span><b>{Math.round((x.value / m.spent) * 100)}%</b></li>
              ))}
              {slices.length > 7 && <li class="muted">{t('moreN', { n: slices.length - 7 })}</li>}
            </ul>
          </div>
        )}
      </section>

      <section class="card" {...daySwipe}>
        <div class="card-head">
          <h2>{t('byDay')}</h2>
          <Seg small value={dayKind} onChange={setDayKind} options={dayKinds()} />
        </div>
        {dayTotal === 0 ? <Empty text={dayKind === 'income' ? t('noIncomeMonth') : t('chartSoon')} /> : (
          <>
            <div key={dayKind} class={dayKind === 'income' ? 'swap next' : 'swap prev'}><DayBars data={m.byDay} today={today} kind={dayKind} /></div>
            <p class="hint">{dayKind === 'income' ? t('peakIncome') : t('peakSpend')}</p>
          </>
        )}
      </section>

      <section class="card">
        <h2>{t('trendTitle')}</h2>
        {active < 2 ? <Empty text={t('trendEmpty')} /> : (
          <>
            <TrendChart points={trend} current={month} />
            <div class="trend-legend">
              <span><i style={{ background: 'var(--pos)' }} />{t('legIncome')}</span>
              <span><i style={{ background: 'var(--bar)' }} />{t('legExpense')}</span>
              <span><i class="line" />{t('legBalance')}</span>
            </div>
            {keepRate != null && (
              <p class={keepRate >= 0 ? 'verdict pos' : 'verdict neg'}>
                {keepRate >= 0 ? t('keepPct', { n: keepRate }) : t('overPct', { n: -keepRate })}
              </p>
            )}
            <p class="hint">{t('trendHint')}</p>
          </>
        )}
      </section>

      <section class="card">
        <h2>{t('recentOps')}</h2>
        {m.txs.length === 0 ? <Empty text={t('addFirst')} /> :
          m.txs.slice(0, 5).map((t, i) => <TxRow s={s} t={t} i={i} onClick={() => onEdit(t)} />)}
      </section>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: 'pos' | 'neg' }) {
  return (
    <div class="card stat">
      <div class="stat-lbl">{label}</div>
      <Money class={`stat-val ${tone ?? ''}`} value={value} />
      {sub && <div class="stat-sub">{sub}</div>}
    </div>
  );
}

const Empty = ({ text }: { text: string }) => <div class="empty">{text}</div>;

const longDate = (d: string) => fmtDate(d, { day: 'numeric', month: 'long', year: 'numeric' });

/** Облачной копии Android нет — без ручной копии потеря телефона означает потерю базы */
function needsBackup(s: State): boolean {
  if (s.txs.length < 20) return false;
  // Дата дальше двух недель — след ушедших вперёд часов: такую отсрочку не учитываем
  const today = todayISO();
  if (s.backupSnooze && today < s.backupSnooze && s.backupSnooze <= shiftDay(today, 14)) return false;
  if (!s.lastBackup) return true;
  return (Date.now() - new Date(s.lastBackup + 'T00:00').getTime()) / 86400000 > 30;
}

const LONG_PRESS = 450;

function TxRow({ s, t: tx, i = 0, onClick, onLongPress, selected }: {
  s: State; t: Tx; i?: number; onClick?: () => void; onLongPress?: () => void; selected?: boolean;
}) {
  const cat = s.categories.find((c) => c.id === tx.categoryId);
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number; fired: boolean } | null>(null);
  const cancel = () => { if (press.current) clearTimeout(press.current.timer); };
  const long = onLongPress && {
    onTouchStart: (e: TouchEvent) => {
      const p = e.touches[0];
      const st = { x: p.clientX, y: p.clientY, fired: false, timer: setTimeout(() => { st.fired = true; haptic(true); onLongPress(); }, LONG_PRESS) };
      press.current = st;
    },
    onTouchMove: (e: TouchEvent) => {
      const p = e.touches[0], st = press.current;
      if (st && Math.hypot(p.clientX - st.x, p.clientY - st.y) > 10) cancel();
    },
    onTouchEnd: cancel,
    onTouchCancel: cancel,
    onContextMenu: (e: Event) => { e.preventDefault(); if (!press.current?.fired) onLongPress(); },
  };
  const click = () => {
    // Палец, удержанный для выбора, отпускается кликом — его не считать вторым нажатием
    if (press.current?.fired) { press.current = null; return; }
    onClick?.();
  };
  return (
    <button class={selected ? 'tx sel' : 'tx'} style={{ '--i': Math.min(i, 12) }} onClick={click} disabled={!onClick}
      aria-pressed={selected === undefined ? undefined : selected} {...long}>
      {selected === undefined
        ? <i class="dot" style={{ background: cat?.color ?? 'var(--muted)' }} />
        : <i class={selected ? 'selmark on' : 'selmark'} aria-hidden="true" />}
      <span class="tx-main">
        <span class="tx-cat">{cat?.name ?? t('noCategory')}</span>
        {tx.desc && <span class="tx-desc">{tx.desc}</span>}
      </span>
      <span class={tx.kind === 'income' ? 'tx-amt pos' : 'tx-amt neg'}>{tx.kind === 'income' ? '+' : '−'}{money(tx.amount)}</span>
    </button>
  );
}

function Ops({ s, m, onEdit, update }: { s: State; m: M; onEdit: (t: Tx) => void; update: Update }) {
  const [filter, setFilter] = useState<'all' | Kind>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState(false);
  const selecting = sel.size > 0;
  useEffect(() => {
    document.body.classList.toggle('selecting', selecting);
    return () => document.body.classList.remove('selecting');
  }, [selecting]);
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const add = (id: string) => setSel((p) => (p.has(id) ? p : new Set(p).add(id)));
  const picked = s.txs.filter((t) => sel.has(t.id));
  const kinds = new Set(picked.map((t) => t.kind));
  const moveKind = kinds.size === 1 ? [...kinds][0] : null;
  const removeSel = () => {
    const n = sel.size;
    update((d) => { d.txs = d.txs.filter((t) => !sel.has(t.id)); }, t('deletedOps', { n }));
    setSel(new Set());
  };
  const moveSel = (catId: string) => {
    const n = sel.size;
    update((d) => { for (const t of d.txs) if (sel.has(t.id)) t.categoryId = catId; }, t('movedOps', { n }));
    setMoving(false);
    setSel(new Set());
  };
  const needle = q.trim().toLowerCase();
  const list = m.txs.filter((t) => (filter === 'all' || t.kind === filter) &&
    (!needle || t.desc.toLowerCase().includes(needle) ||
      (s.categories.find((c) => c.id === t.categoryId)?.name.toLowerCase().includes(needle) ?? false)));
  const groups = new Map<string, Tx[]>();
  for (const t of list) groups.set(t.date, [...(groups.get(t.date) ?? []), t]);
  const fmt = (d: string) => fmtDate(d, { day: 'numeric', month: 'long', weekday: 'short' });
  const total = list.reduce((a, t) => a + (t.kind === 'income' ? t.amount : -t.amount), 0);
  let n = 0;

  return (
    <SwipeArea onSwipe={(d) => stepOption(opsFilters(), filter, d, setFilter)}>
      <Seg value={filter} onChange={setFilter} options={opsFilters()} />
      <div class="search-wrap">
        <input class="search" type="search" placeholder={t('searchPh')} value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        {q && <button class="search-clear" aria-label={t('clearSearch')} onClick={() => setQ('')}>✕</button>}
      </div>
      {needle && list.length > 0 && <p class="hint">{t('found', { n: list.length, total: signedMoney(total) })}</p>}
      {list.length === 0 && <Empty text={needle ? t('nothingFound') : t('noOps')} />}
      {[...groups].map(([date, txs]) => {
        const dayTotal = txs.reduce((a, t) => a + (t.kind === 'income' ? t.amount : -t.amount), 0);
        return (
          <section class="card day">
            <div class="day-head"><span>{fmt(date)}</span><span class={dayTotal >= 0 ? 'pos' : 'neg'}>{signedMoney(dayTotal)}</span></div>
            {txs.map((t) => (
              <TxRow s={s} t={t} i={n++} selected={selecting ? sel.has(t.id) : undefined}
                onClick={() => (selecting ? toggle(t.id) : onEdit(t))} onLongPress={() => add(t.id)} />
            ))}
          </section>
        );
      })}
      {!selecting && list.length > 1 && <p class="hint center">{t('selectHint')}</p>}
      {selecting && (
        <SelectBack onBack={() => setSel(new Set())} />
      )}
      {selecting && (
        <Portal>
          <div class="selbar" role="toolbar" aria-label={t('selectedOps')}>
            <button class="icon-btn" aria-label={t('clearSel')} onClick={() => setSel(new Set())}>✕</button>
            <span class="selbar-count">{sel.size}</span>
            <button class="selbar-btn" onClick={() => setSel(new Set(list.map((t) => t.id)))}>{t('all')}</button>
            <button class="selbar-btn" disabled={!moveKind} onClick={() => setMoving(true)}>{t('move')}</button>
            <button class="selbar-btn danger" onClick={removeSel}>{t('del')}</button>
            {!moveKind && <span class="selbar-hint">{t('moveOnly')}</span>}
          </div>
        </Portal>
      )}
      {moving && moveKind && (
        <Sheet title={t('moveTitle', { n: sel.size })} onClose={() => setMoving(false)}>
          <div class="chips" data-noswipe>
            {s.categories.filter((c) => c.kind === moveKind).map((c) => (
              <button class="chipsel" onClick={() => moveSel(c.id)}><i class="dot" style={{ background: c.color }} />{c.name}</button>
            ))}
          </div>
        </Sheet>
      )}
    </SwipeArea>
  );
}

/** Пока выбраны операции, «назад» снимает выбор, а не уходит со вкладки */
function SelectBack({ onBack }: { onBack: () => void }) {
  useBack(onBack);
  return null;
}

function Plan({ s, m, month, update, notify }: { s: State; m: M; month: string; update: Update; notify: Notify }) {
  const [kind, setKind] = useState<Kind>('expense');
  const [focus, setFocus] = useState<string | null>(null);
  const focusRef = useRef<HTMLInputElement | null>(null);
  const all = kind === 'expense' ? m.expenseRows : m.incomeRows;
  // Копилка — перевод, а не трата: в итоги расходов не входит, перевыполнение её плана — плюс
  const rows = all.filter((r) => !r.cat.savings);
  const jars = all.filter((r) => r.cat.savings);
  const plan = rows.reduce((a, r) => a + r.plan, 0);
  const fact = rows.reduce((a, r) => a + r.fact, 0);
  const diff = kind === 'expense' ? plan - fact : fact - plan;
  // Порядок фиксируется при входе в раздел: иначе строка уезжает из-под пальца, пока правишь соседние планы
  const order = useMemo(() => [...all].sort((a, b) => (b.fact + b.plan) - (a.fact + a.plan)).map((r) => r.cat.id), [kind, month]);
  const rank = (id: string) => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
  const byRank = (a: CatRow, b: CatRow) => rank(a.cat.id) - rank(b.cat.id);

  const setPlan = (cat: Category, el: HTMLInputElement, current: number) => {
    const raw = el.value.trim();
    const v = raw === '' ? 0 : parseSigned(raw);
    if (v == null || v < 0) { el.value = current ? String(current) : ''; notify(t('notAmount')); return; }
    el.value = v ? String(v) : '';
    if (v === current) return;
    update((d) => { const mm = (d.months[month] ??= {}); (mm.plans ??= {})[cat.id] = v; });
  };

  const planRow = (r: CatRow, jar: boolean) => {
    const d = jar ? r.fact - r.plan : r.diff;
    const tone = d > 0 ? 'pos' : d < 0 && kind === 'expense' && !jar ? 'neg' : 'muted';
    const note = d === 0 ? '—' : jar && d < 0 ? t('jarLeft', { amount: money(-d) }) : signedMoney(d);
    return (
      <div class="plan-row" key={r.cat.id}>
        <div class="plan-top">
          <span class="plan-name"><i class="dot" style={{ background: r.cat.color }} />{r.cat.name}</span>
          <span class={tone}>{note}</span>
        </div>
        <Progress value={r.fact} max={r.plan} over={!jar && kind === 'expense' && r.fact > r.plan} goal={jar} />
        <div class="plan-bottom">
          <span>{money(r.fact)}</span>
          <label class="plan-input">
            {/* Кнопки слева от поля: появляясь, они не сдвигают поле из-под пальца */}
            {focus === r.cat.id && <CalcKeys input={focusRef} />}
            {jar ? t('goalLow') : t('planLow')}
            <input key={`${month}:${r.plan}`} inputMode="decimal" enterKeyHint="done" defaultValue={r.plan ? String(r.plan) : ''} placeholder="0"
              onFocus={(e) => { focusRef.current = e.currentTarget; setFocus(r.cat.id); }}
              onBlur={() => setFocus(null)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              onChange={(e) => setPlan(r.cat, e.currentTarget, r.plan)} />
            {currencySign()}
          </label>
        </div>
      </div>
    );
  };

  return (
    <SwipeArea onSwipe={(d) => stepOption(planKinds(), kind, d, setKind)}>
      <Seg value={kind} onChange={setKind} options={planKinds()} />
      <section class="card totals">
        <div><span class="stat-lbl">{t('plan')}</span><Money value={plan} /></div>
        <div><span class="stat-lbl">{t('fact')}</span><Money value={fact} /></div>
        <div><span class="stat-lbl">{t('diff')}</span><b class={diff >= 0 ? 'pos' : 'neg'}>{signedMoney(diff)}</b></div>
      </section>
      <p class="hint">{t('planHint', { month: monthInText(month) })}</p>
      <section class="card">
        {[...rows].sort(byRank).map((r) => planRow(r, false))}
      </section>
      {jars.length > 0 && (
        <section class="card">
          <h2>{t('jar')}</h2>
          <p class="hint">{t('jarHint')}</p>
          {[...jars].sort(byRank).map((r) => planRow(r, true))}
        </section>
      )}
      {s.months[month]?.plans && (
        <button class="link" onClick={() => update((d) => { if (d.months[month]) delete d.months[month].plans; }, t('plansReset'))}>
          {t('resetPlans')}
        </button>
      )}
    </SwipeArea>
  );
}

function More({ s, m, month, readOnly, current, update, replace, notify, takeSpot }: {
  s: State; m: M; month: string; readOnly: boolean; current: () => State; update: Update; replace: Replace; notify: Notify; takeSpot: () => boolean;
}) {
  const backupRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!takeSpot()) return;
    // Ждём конца анимации входа вкладки, иначе прокрутка считает позицию по сдвинутой карточке
    const go = setTimeout(() => {
      backupRef.current?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
      backupRef.current?.classList.add('spot');
    }, 320);
    const off = setTimeout(() => backupRef.current?.classList.remove('spot'), 2900);
    return () => { clearTimeout(go); clearTimeout(off); };
  }, []);
  const [editCat, setEditCat] = useState<Category | 'new-expense' | 'new-income' | null>(null);
  const explicitStart = s.months[month]?.start;
  const [startRaw, setStartRaw] = useState(explicitStart?.toString() ?? '');
  const startRef = useRef<HTMLInputElement>(null);
  const [broken, setBroken] = useState(false);
  const [exported, setExported] = useState(false);
  const [restorable, setRestorable] = useState(false);
  useEffect(() => setStartRaw(explicitStart?.toString() ?? ''), [month, explicitStart]);
  useEffect(() => {
    hasBroken().then(setBroken);
    beforeRestore().then((b) => setRestorable(!!b));
  }, []);

  const commitStart = (raw: string) => {
    const v = raw.trim() === '' ? null : parseSigned(raw);
    if (raw.trim() !== '' && v == null) { setStartRaw(explicitStart?.toString() ?? ''); notify(t('notAmount')); return; }
    if (v != null) setStartRaw(String(v));
    if (v === (explicitStart ?? null)) return;
    update((d) => { const mm = (d.months[month] ??= {}); if (v == null) delete mm.start; else mm.start = v; });
  };
  const doImport = async () => {
    const f = await pickFile('.xlsx,.xls,.ods,.csv');
    if (!f) return;
    try {
      const r = importWorkbook(new Uint8Array(await f.arrayBuffer()), current());
      if (!r.added && !r.newCategories.length) { notify(r.skipped ? t('importAllDone', { n: r.skipped }) : t('noOpsInFile')); return; }
      replace(r.state, `${t('importAdded', { n: r.added })}${r.skipped ? t('importSkipped', { n: r.skipped }) : ''}${r.newCategories.length ? t('importCats', { n: r.newCategories.length }) : ''}`);
    } catch { notify(t('fileReadFail')); }
  };
  const doExport = async () => {
    try { await saveFile(t('exportFile', { month: monthTitle(month) }), exportMonth(s, month), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); }
    catch { notify(t('exportFail')); }
  };
  const doBackup = async () => {
    try {
      if (await saveFile(`monetka-backup-${todayISO()}.json`, JSON.stringify(current()), 'application/json')) {
        update((d) => { d.lastBackup = todayISO(); });
      }
    } catch { notify(t('backupFail')); }
  };
  const doRestore = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    let rep: ReturnType<typeof normalizeReport> = null;
    try { rep = normalizeReport(JSON.parse(await f.text())); } catch { /* не JSON — ниже тот же ответ */ }
    if (!rep) { notify(t('notBackup')); return; }
    const now = current();
    const skipped = rep.dropped ? t('droppedN', { n: rep.dropped }) : '';
    if (!confirm(t('restoreConfirm', { now: t('opsN', { n: now.txs.length }), copy: t('opsN', { n: rep.state.txs.length }), skipped }))) return;
    try { await saveBeforeRestore(now); setRestorable(true); }
    catch { if (!confirm(t('restoreNoSnapshot'))) return; }
    // Копии версии 1.x без языка и валюты не переключают интерфейс: остаются текущие настройки
    replace(keepLocale(rep.state, now), t('restored'));
  };
  const undoRestore = async () => {
    const b = await beforeRestore();
    if (!b) { setRestorable(false); notify(t('noSaved')); return; }
    if (!confirm(t('undoRestoreConfirm', { now: t('opsN', { n: current().txs.length }), was: t('opsN', { n: b.state.txs.length }) }))) return;
    replace(keepLocale(b.state, current()), t('restoredBack'));
    await dropBeforeRestore(b.name);
    setRestorable(!!(await beforeRestore()));
  };
  const doBroken = async () => {
    try { if (await exportBroken()) setExported(true); }
    catch { notify(t('saveFileFail')); }
  };
  const forgetBroken = async () => {
    if (!confirm(t('forgetConfirm'))) return;
    await dropBroken();
    setBroken(false);
  };

  return (
    <>
      <section class="card">
        <h2>{t('startTitle', { month: monthTitle(month) })}</h2>
        <div class="row-input">
          <input ref={startRef} inputMode="decimal" enterKeyHint="done" placeholder={t('autoPh', { n: Math.round(m.start) })} value={startRaw}
            onInput={(e) => setStartRaw(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            onChange={(e) => commitStart(e.currentTarget.value)} />
          <span>{currencySign()}</span>
          <CalcKeys input={startRef} />
        </div>
        <p class="hint">{t('startHint')}</p>
      </section>

      <section class="card">
        <h2>{t('appearance')}</h2>
        <div class="style-pick">
          {([['minimal', t('minimal')], ['glass', t('glass')]] as const).map(([k, l]) => (
            <button class={(s.style ?? 'minimal') === k ? 'style-opt on' : 'style-opt'} aria-pressed={(s.style ?? 'minimal') === k}
              onClick={() => { haptic(); update((d) => { d.style = k as ThemeStyle; }); }}>
              <span class={`style-prev ${k}`} aria-hidden="true"><i /><i /><i /></span>{l}
            </button>
          ))}
        </div>
        <Seg value={s.theme} onChange={(k) => update((d) => { d.theme = k as ThemeMode; })}
          options={[['auto', t('themeAuto')], ['light', t('themeLight')], ['dark', t('themeDark')]]} />
      </section>

      <section class="card locale">
        <h2>{t('localeTitle')}</h2>
        <Seg value={s.lang ?? 'ru'} onChange={(k) => update((d) => { d.lang = k as Lang; relocalize(d, k as Lang); })} options={LANGS} />
        <Seg value={s.currency ?? 'RUB'} onChange={(k) => update((d) => { d.currency = k as Currency; })}
          options={CURRENCIES.map((c) => [c, `${currencySign(c)} ${c}`] as const)} />
        <p class="hint">{t('currencyHint')}</p>
      </section>

      <section class="card">
        <h2>{t('categories')}</h2>
        {(['expense', 'income'] as const).map((k) => (
          <div class="cat-group">
            <div class="cat-head"><span class="stat-lbl">{k === 'expense' ? t('expenses') : t('incomes')}</span>
              <button class="link" onClick={() => setEditCat(k === 'expense' ? 'new-expense' : 'new-income')}>{t('addCat')}</button></div>
            {s.categories.filter((c) => c.kind === k).map((c) => (
              <button class="cat" onClick={() => setEditCat(c)}>
                <i class="dot" style={{ background: c.color }} /><span>{c.name}</span>
                {c.savings && <em class="tag">{t('jarTag')}</em>}{c.tips && <em class="tag">{t('tipsTag')}</em>}
                <span class="muted">{c.plan ? money(c.plan) : ''}</span>
              </button>
            ))}
          </div>
        ))}
      </section>

      <section class="card actions">
        <h2>{t('data')}</h2>
        <button class="btn" onClick={doExport}>{t('exportXlsx')}</button>
        {!readOnly && <button class="btn" onClick={doImport}>{t('importXlsx')}</button>}
        <button ref={backupRef} class="btn ghost" onClick={doBackup}>{t('backup')}</button>
        {!readOnly && <button class="btn ghost" onClick={doRestore}>{t('restore')}</button>}
        {!readOnly && restorable && <button class="btn ghost" onClick={undoRestore}>{t('undoRestoreBtn')}</button>}
        {broken && <button class="btn danger" onClick={doBroken}>{t('exportBrokenBtn')}</button>}
        {!readOnly && broken && exported && <button class="link" onClick={forgetBroken}>{t('forgetBrokenBtn')}</button>}
        {readOnly && <p class="hint neg">{t('readOnlyHint')}</p>}
        {s.lastBackup && <p class="hint">{t('lastBackup', { date: longDate(s.lastBackup) })}</p>}
        <p class="hint">{t('importHelp')}</p>
        <p class="hint">{t('dataLocal')} {t('backupBefore')}</p>
      </section>

      <section class="card gestures">
        <h2>{t('gestures')}</h2>
        <p class="hint">{t('gesturesHint')}</p>
        <button class="link" onClick={() => update((d) => { d.onboarded = false; })}>{t('showIntro')}</button>
      </section>

      {editCat && (
        <CatSheet s={s} month={month} value={editCat} onClose={() => setEditCat(null)}
          onSave={(c) => { update((d) => { const i = d.categories.findIndex((x) => x.id === c.id); if (i >= 0) d.categories[i] = c; else d.categories.push(c); }); setEditCat(null); haptic(true); }}
          onDelete={(id, moveTo) => {
            update((d) => {
              d.categories = d.categories.filter((c) => c.id !== id);
              d.txs = moveTo ? d.txs.map((t) => (t.categoryId === id ? { ...t, categoryId: moveTo } : t)) : d.txs.filter((t) => t.categoryId !== id);
              for (const mm of Object.values(d.months)) if (mm.plans) delete mm.plans[id];
            }, t('catDeleted'));
            setEditCat(null);
          }} />
      )}
    </>
  );
}

/** Последняя по дате операция этого типа — её категория предлагается по умолчанию */
function lastCategory(s: State, kind: Kind): string {
  let best: Tx | undefined;
  for (const t of s.txs) if (t.kind === kind && (!best || t.date >= best.date)) best = t;
  return best?.categoryId ?? '';
}

/** Высота поля по содержимому: field-sizing есть не во всех WebView, поэтому подгоняем вручную */
function grow(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`;
}

function TxSheet({ s, month, value, onClose, onSave, onDelete }: {
  s: State; month: string; value: Tx | 'new-expense' | 'new-income';
  onClose: () => void; onSave: (t: Tx, mode: 'new' | 'edit' | 'repeat') => void; onDelete: (id: string) => void;
}) {
  const isNew = typeof value === 'string';
  const defDate = monthKey(todayISO()) === month ? todayISO() : `${month}-01`;
  const [kind, setKind] = useState<Kind>(isNew ? (value === 'new-income' ? 'income' : 'expense') : value.kind);
  const [amount, setAmount] = useState(isNew ? '' : String(value.amount));
  const amountRef = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(isNew ? defDate : value.date);
  const [desc, setDesc] = useState(isNew ? '' : value.desc);
  const cats = s.categories.filter((c) => c.kind === kind);
  const [catId, setCatId] = useState(isNew ? '' : value.categoryId);
  const validCat = cats.some((c) => c.id === catId) ? catId : (isNew ? cats.find((c) => c.id === lastCategory(s, kind))?.id ?? '' : '');
  const amt = parseExpr(amount);
  const isExpr = /\d\s*[+\-−–]\s*\d/.test(amount);
  const ok = amt != null && !!validCat && /^\d{4}-\d{2}-\d{2}$/.test(date);

  const recent = useMemo(() => {
    const seen = new Map<string, number>();
    for (const t of [...s.txs].sort((a, b) => (a.date < b.date ? 1 : -1))) {
      if (t.categoryId !== validCat || !t.desc || seen.has(t.desc)) continue;
      seen.set(t.desc, t.amount);
      if (seen.size >= 5) break;
    }
    return [...seen];
  }, [s.txs, validCat]);

  const submit = () => {
    if (!ok) return;
    onSave({ id: isNew ? uid() : value.id, kind, amount: amt!, date, desc: desc.trim(), categoryId: validCat }, isNew ? 'new' : 'edit');
  };

  return (
    <Sheet title={isNew ? t('newOp') : t('op')} onClose={onClose}>
      <Seg value={kind} onChange={setKind} options={[['expense', t('expense')], ['income', t('income')]]} />
      <div class="amount-field">
        <input ref={amountRef} autoFocus={isNew} inputMode="decimal" enterKeyHint="done" placeholder="0" value={amount} aria-label={t('amountAria')}
          onInput={(e) => setAmount(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        <span>{currencySign()}</span>
        <CalcKeys input={amountRef} />
      </div>
      {isExpr && <div class={amt != null ? 'calc' : 'calc bad'}>{amt != null ? `= ${money(amt)}` : t('calcFail')}</div>}
      <div class="chips" data-noswipe>
        {cats.map((c) => (
          <button class={validCat === c.id ? 'chipsel on' : 'chipsel'} style={validCat === c.id ? { borderColor: c.color, background: c.color + '22' } : {}}
            onClick={() => { haptic(); setCatId(c.id); }}><i class="dot" style={{ background: c.color }} />{c.name}</button>
        ))}
      </div>
      {recent.length > 0 && (
        <div class="recent">
          {recent.map(([d, a]) => (
            <button class="recent-chip" onClick={() => { setDesc(d); if (!amount) setAmount(String(a)); }}>{d}</button>
          ))}
        </div>
      )}
      <label class="field"><span>{t('description')}</span>
        <textarea rows={1} placeholder={t('descPh')} value={desc} maxLength={1000}
          onInput={(e) => { setDesc(e.currentTarget.value); grow(e.currentTarget); }} ref={(el) => { if (el) grow(el); }} /></label>
      <label class="field"><span>{t('date')}</span>
        <input type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} /></label>
      {!isNew && (
        <button class="link" disabled={!ok}
          onClick={() => onSave({ id: uid(), kind, amount: amt!, date: todayISO(), desc: desc.trim(), categoryId: validCat }, 'repeat')}>
          {t('repeatToday')}{amt != null && amt !== value.amount ? t('repeatNote', { amount: money(amt) }) : ''}
        </button>
      )}
      <div class="sheet-actions">
        {!isNew && <button class="btn danger" onClick={() => onDelete(value.id)}>{t('del')}</button>}
        <button class="btn primary" disabled={!ok} onClick={submit}>{t('save')}</button>
      </div>
    </Sheet>
  );
}

function CatSheet({ s, month, value, onClose, onSave, onDelete }: {
  s: State; month: string; value: Category | 'new-expense' | 'new-income';
  onClose: () => void; onSave: (c: Category) => void; onDelete: (id: string, moveTo: string | null) => void;
}) {
  const isNew = typeof value === 'string';
  const base: Category = isNew
    ? { id: uid(), name: '', kind: value === 'new-income' ? 'income' : 'expense', plan: 0, color: PALETTE[s.categories.length % PALETTE.length] }
    : value;
  const [c, setC] = useState<Category>(base);
  const [planRaw, setPlanRaw] = useState(base.plan ? String(base.plan) : '');
  const used = !isNew && s.txs.filter((t) => t.categoryId === base.id).length;
  const others = s.categories.filter((x) => x.kind === c.kind && x.id !== c.id);
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? '');
  const monthPlan = !isNew ? planFor(s, month, base) : 0;
  const name = c.name.trim();
  const dup = others.some((o) => o.name.trim().toLowerCase() === name.toLowerCase());
  const plan = planRaw.trim() === '' ? 0 : parseExpr(planRaw);
  const ok = !!name && !dup && plan != null;

  return (
    <Sheet title={isNew ? t('newCat') : t('category')} onClose={onClose}>
      <label class="field"><span>{t('name')}</span>
        <input value={c.name} maxLength={40} onInput={(e) => setC({ ...c, name: e.currentTarget.value })} placeholder={t('namePh')} /></label>
      {dup && <p class="hint neg">{t('dup')}</p>}
      <label class="field"><span>{t('planDefault', { cur: currencySign() })}</span>
        <input inputMode="decimal" value={planRaw} placeholder="0" onInput={(e) => setPlanRaw(e.currentTarget.value)} /></label>
      {plan == null && <p class="hint neg">{t('notAmount')}</p>}
      {!isNew && monthPlan !== base.plan && <p class="hint">{t('ownPlan', { amount: money(monthPlan) })}</p>}
      <div class="swatches" data-noswipe>
        {PALETTE.map((p) => <button class={c.color === p ? 'sw on' : 'sw'} style={{ background: p }} aria-label={t('colorAria', { color: p })} aria-pressed={c.color === p} onClick={() => setC({ ...c, color: p })} />)}
      </div>
      {c.kind === 'expense' && (
        <label class="check"><input type="checkbox" checked={!!c.savings} onChange={(e) => setC({ ...c, savings: e.currentTarget.checked })} />
          <span>{t('jar')}<small>{t('jarDesc')}</small></span></label>
      )}
      {c.kind === 'income' && (
        <label class="check"><input type="checkbox" checked={!!c.tips} onChange={(e) => setC({ ...c, tips: e.currentTarget.checked })} />
          <span>{t('tips')}<small>{t('tipsDesc')}</small></span></label>
      )}
      {!isNew && used ? (
        <div class="move">
          <span class="hint">{t('inCat', { n: used })}</span>
          <select value={moveTo} onChange={(e) => setMoveTo(e.currentTarget.value)}>
            {others.map((o) => <option value={o.id}>{o.name}</option>)}
          </select>
        </div>
      ) : null}
      <div class="sheet-actions">
        {!isNew && <button class="btn danger" disabled={!!used && !moveTo}
          onClick={() => { if (confirm(t('delCatConfirm', { name: base.name }))) onDelete(base.id, used ? moveTo : null); }}>{t('del')}</button>}
        <button class="btn primary" disabled={!ok}
          onClick={() => onSave({ ...c, name, plan: plan ?? 0 })}>{t('save')}</button>
      </div>
    </Sheet>
  );
}
