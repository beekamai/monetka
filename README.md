# Монетка

[![Release](https://img.shields.io/github/v/release/beekamai/monetka?logo=android&color=3ddc84&label=APK)](https://github.com/beekamai/monetka/releases/latest)
[![Build APK](https://github.com/beekamai/monetka/actions/workflows/android.yml/badge.svg)](https://github.com/beekamai/monetka/actions/workflows/android.yml)
![Android](https://img.shields.io/badge/Android-7.0%2B-3ddc84?logo=android&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178c6?logo=typescript&logoColor=white)
![Preact](https://img.shields.io/badge/Preact-11-673ab8?logo=preact&logoColor=white)
![Capacitor](https://img.shields.io/badge/Capacitor-8-119eff?logo=capacitor&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-3da639)

🇬🇧 [English](#english) · 🇷🇺 [Русский](#русский)

---

## English

**Monetka** is an offline personal budget app for Android. It mirrors the Google Sheets *Monthly budget*
template: a starting balance, expenses and income by category, planned vs actual vs difference, a savings jar
and tips, the end-of-month balance and how much your savings grew. On top of the spreadsheet it adds charts,
search, Excel export and import of your existing sheets.

> 🔒 Your data never leaves the phone. The app makes no network requests, has no accounts, no analytics and
> no ads. Backups are files you save and share yourself.

### Features

- 📊 **Overview** — balance, starting amount, savings growth, income / expenses / set aside, a pie chart by category and spending by day.
- 🧾 **Transactions** — grouped by day, with filter, search, edit and delete.
- 🎯 **Plan** — planned / actual / difference for every category; plans can be overridden for a single month.
- 🐷 **Savings jar and tips** — money moved to the jar counts as set aside, not spent; tips are tracked separately, as in the sheet.
- 🔁 **Rolling balance** — the end balance of a month becomes the next month's starting amount, unless you set one by hand.
- 📥 **Import from Google Sheets** — download your *Monthly budget* sheet as `.xlsx` and pick the file: transactions, the starting amount and plans are imported. Importing the same file again adds no duplicates.
- 📤 **Export** — any month to an `.xlsx` with the same *Summary* and *Transactions* sheets.
- 💾 **Backup** — the whole database to a JSON file and back.
- 🌗 **Themes** — light, dark or follow the system.

### Install

1. Open the [latest release](https://github.com/beekamai/monetka/releases/latest) on your phone.
2. Download `Monetka-N.apk` and open it. Android asks once to allow installs from your browser.

Every release is signed with the same key, so a new version installs over the old one and keeps your data.

### Tabs

| Tab | What's there |
| --- | --- |
| Overview | Balance, starting amount, savings growth, income / expenses / set aside, pie chart, spending by day |
| Transactions | List by day, filter, search, edit and delete |
| Plan | Planned / actual / difference per category, per-month plan overrides |
| More | Starting amount, categories (colour, plan, savings jar, tips), import / export, backup, theme |

### Build from source

```bash
npm install
npm run dev      # in the browser
npm test         # calculations, import and export
npm run build && npx cap sync android   # then open android/ in Android Studio
```

Without a signing key the release build is signed with the Android SDK debug key: fine for trying it out,
but it will not install over an APK from the Releases page.

### CI and signing

[`android.yml`](.github/workflows/android.yml) runs on every push and pull request: tests, web build,
`cap sync`, Gradle. The APK is uploaded as a workflow artifact. A push to `main` also publishes a release
signed with the key from repository secrets; the build fails instead of publishing an APK signed with any
other key.

To publish signed builds from a fork, create your own key and add four secrets
(**Settings → Secrets and variables → Actions**):

```bash
keytool -genkeypair -v -keystore monetka.keystore -alias monetka -keyalg RSA -keysize 4096 -validity 10000
```

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 monetka.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias (`monetka` above) |
| `ANDROID_KEY_PASSWORD` | key password |

Keep the keystore out of git (`*.keystore` and `*.jks` are ignored) and back it up: lose it, and the next
release can only be installed after uninstalling the app.

<details>
<summary>Project layout</summary>

```
src/
  App.tsx         screens and tabs
  model.ts        data model, default categories, formatting
  calc.ts         monthly summary: plan / actual, balance chain, savings, tips
  xlsxio.ts       .xlsx import and export (SheetJS)
  storage.ts      persistence (Capacitor Preferences) and backup files
  charts.tsx      pie and bar charts
tests/            calc.test.ts — import, totals, export round trip
android/          Capacitor Android project
.github/workflows android.yml — tests, APK build, release
```
</details>

### License

MIT.

---

## Русский

**Монетка** — офлайн-приложение для личного бюджета на Android. Повторяет шаблон Google Таблиц
«Месячный бюджет»: начальная сумма, расходы и доходы по категориям, план, факт и разница, копилка и чаевые,
остаток на конец месяца и рост сбережений. Сверх таблицы — графики, поиск, экспорт в Excel и импорт ваших
таблиц.

> 🔒 Данные не покидают телефон. Приложение не ходит в сеть, в нём нет аккаунтов, аналитики и рекламы.
> Резервные копии — это файлы, которые вы сохраняете и пересылаете сами.

### Возможности

- 📊 **Обзор** — остаток, начальная сумма, рост сбережений, доходы / расходы / отложено, круговая диаграмма по категориям и траты по дням.
- 🧾 **Операции** — по дням, с фильтром, поиском, правкой и удалением.
- 🎯 **План** — план / факт / разница по каждой категории; план можно поменять для отдельного месяца.
- 🐷 **Копилка и чаевые** — деньги в копилке считаются отложенными, а не потраченными; чаевые учитываются отдельно, как в таблице.
- 🔁 **Сквозной остаток** — остаток месяца становится начальной суммой следующего, если не задать её вручную.
- 📥 **Импорт из Google Таблиц** — скачайте таблицу «Месячный бюджет» как `.xlsx` и выберите файл: подтянутся операции, начальная сумма и планы. Повторный импорт того же файла не дублирует операции.
- 📤 **Экспорт** — любой месяц в `.xlsx` с теми же листами «Сводка» и «Транзакции».
- 💾 **Резервная копия** — вся база в JSON-файл и обратно.
- 🌗 **Темы** — светлая, тёмная или как в системе.

### Установка

1. Откройте [последний релиз](https://github.com/beekamai/monetka/releases/latest) с телефона.
2. Скачайте `Monetka-N.apk` и откройте его. Android один раз попросит разрешить установку из браузера.

Все релизы подписаны одним ключом: новая версия ставится поверх старой, данные сохраняются.

### Вкладки

| Вкладка | Что там |
| --- | --- |
| Обзор | Остаток, начальная сумма, рост сбережений, доходы / расходы / отложено, круговая диаграмма, траты по дням |
| Операции | Список по дням, фильтр, поиск, редактирование и удаление |
| План | План / факт / разница по каждой категории, план на конкретный месяц |
| Ещё | Начальная сумма, категории (цвет, план, копилка, чаевые), импорт / экспорт, резервная копия, тема |

### Сборка из исходников

```bash
npm install
npm run dev      # в браузере
npm test         # расчёты, импорт и экспорт
npm run build && npx cap sync android   # затем открыть android/ в Android Studio
```

Без ключа подписи релизная сборка подписывается отладочным ключом Android SDK: попробовать хватит, но поверх
APK со страницы Releases она не встанет.

### CI и подпись

[`android.yml`](.github/workflows/android.yml) запускается на каждый push и pull request: тесты, сборка
веба, `cap sync`, Gradle. APK кладётся в артефакты прогона. Push в `main` вдобавок публикует релиз,
подписанный ключом из секретов репозитория; без ключа сборка падает, а не выпускает APK с чужой подписью.

Чтобы публиковать подписанные сборки из форка, создайте свой ключ и добавьте четыре секрета
(**Settings → Secrets and variables → Actions**):

```bash
keytool -genkeypair -v -keystore monetka.keystore -alias monetka -keyalg RSA -keysize 4096 -validity 10000
```

| Секрет | Значение |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 monetka.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | пароль хранилища |
| `ANDROID_KEY_ALIAS` | имя ключа (`monetka` в примере) |
| `ANDROID_KEY_PASSWORD` | пароль ключа |

Хранилище ключа в git не кладите (`*.keystore` и `*.jks` в `.gitignore`) и сохраните копию: потеряете его —
следующий релиз встанет только после удаления приложения.

<details>
<summary>Структура проекта</summary>

```
src/
  App.tsx         экраны и вкладки
  model.ts        модель данных, категории по умолчанию, форматирование
  calc.ts         сводка месяца: план / факт, цепочка остатков, копилка, чаевые
  xlsxio.ts       импорт и экспорт .xlsx (SheetJS)
  storage.ts      хранение (Capacitor Preferences) и файлы резервных копий
  charts.tsx      круговая и столбчатая диаграммы
tests/            calc.test.ts — импорт, итоги, экспорт туда-обратно
android/          Android-проект Capacitor
.github/workflows android.yml — тесты, сборка APK, релиз
```
</details>

### Лицензия

MIT.
