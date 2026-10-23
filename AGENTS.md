# AGENTS.md

Монетка — офлайн-приложение личного бюджета для Android. Vite + Preact + TypeScript, обёртка Capacitor 8.
Данные только на устройстве (файлы в `Directory.Data`), сети нет и быть не должно — это обещание README и PRIVACY.md.

## Команды

```bash
npm test                 # tests/*.test.ts через node --experimental-strip-types
npm run build            # tsc --noEmit + vite build
npm run dev              # браузер; /?demo&tab=&style=&theme= — демо-данные без сохранения
npx cap sync android     # после смены плагинов: обновляет capacitor.settings.gradle и capacitor.build.gradle
```

## Правила

- **Данные пользователя не теряются.** База — два слота `monetka/state-a.json` / `state-b.json` вида `{seq, state}`,
  запись по очереди в слот `(seq+1) % 2`, загрузка берёт самый свежий читаемый (`src/persist.ts`, тесты в
  `tests/storage.test.ts`). Почему не Preferences: на Android он пишет через `apply()` и глотает ошибки записи.
- Всё, что приходит из хранилища или файла, проходит `normalizeReport` (поштучно отбрасывает битое, сирот
  переносит в «Прочее», дни 29–31 сверх месяца прижимает). Сырой текст отброшенного — в `monetka/broken-*.json`.
- `load()` вернул `persist: false` — ничего не писать: слот не читается или исходник не удалось отложить.
- Ключи `budget-state-v1` / `-lastgood` в Preferences — данные версии 1.0, читаются, пока нет ни одного читаемого
  слота. Не удалять. Снимки перед восстановлением — `monetka/before-restore-*.json`, последние пять.
- **Разрушительные действия — с отменой:** `update(fn, 'текст')` / `replace(state, 'текст')` показывают тост
  «Отменить». Новые удаления делать так же.
- **Шторки** — только через `Sheet` из `ui.tsx`: портал в body, регистрация в стеке «Назад», свайп вниз.
- **Анимации** уважают `prefers-reduced-motion`: CSS глушит их глобально, JS проверяет `reducedMotion()`.
- **Тесты на синтетике.** В репозиторий не попадают реальные операции, суммы, имена. Публичный репозиторий.
- **Ключ подписи** — только в GitHub Secrets (`ANDROID_KEYSTORE_*`), `*.keystore`/`*.jks` в `.gitignore`.
  Смена ключа ломает обновление поверх у всех пользователей.
- Новые сетевые запросы, аналитика, SDK с телеметрией — нельзя без пересмотра PRIVACY.md и анкеты Play.
  `INTERNET` снят в манифесте через `tools:node="remove"` (проверено на эмуляторе: WebView Capacitor грузит
  локальные файлы без него) — не возвращать.

## Релиз

Push в `main` → CI: тесты, сборка, подписанные `Monetka-N.apk` и `Monetka-N.aab` в GitHub Release.
Публикация в Play — `docs/PLAY_STORE.md`; тексты и картинки карточки — `fastlane/metadata/android/`.
