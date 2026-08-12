# Настройка Claude Code для этого проекта

Плагины и маркетплейсы Claude Code хранятся в профиле пользователя (`~/.claude/plugins/`), а не в репозитории — их нужно один раз установить на каждой машине вручную.

## Маркетплейсы

```
/plugin marketplace add anthropics/claude-plugins-official
/plugin marketplace add https://github.com/AgriciDaniel/claude-seo
/plugin marketplace add https://github.com/secondsky/claude-skills
```

## Плагины

```
/plugin install claude-seo@agricidaniel-claude-seo
/plugin install shadcn-vue@claude-skills
```

После установки: `/reload-plugins`.

`claude-plugins-official` добавлен как маркетплейс про запас — плагины из него пока не устанавливались.

## claude-seo: рантайм после установки плагина

Установка плагина кладёт только файлы. Чтобы команды `/seo` заработали, нужно один раз собрать изолированное окружение — оно ставит Python-зависимости и свой Chromium (~770 МБ в `~/.local/share/claude-seo` на Linux, `~/Library/Application Support/claude-seo` на macOS):

```
/seo setup
```

Проверка состояния, без изменений в системе: `/seo doctor`.

### На macOS

Должно пройти без подготовки: системный `python3` (из Xcode Command Line Tools или Homebrew) умеет создавать venv, а Chromium от Playwright запускается без плясок с библиотеками. Обе проблемы ниже — линуксовые.

### На Ubuntu/Debian: два подводных камня

**1. `/seo setup` падает на создании venv.** У системного python3 вырезан `ensurepip` — это штатное разделение Debian: `python3 -m venv` не работает, пока не поставлен отдельный пакет.

```
sudo apt install -y python3.12-venv
```

Обойти переменными окружения нельзя: `venv/__init__.py` проверяет наличие `ensurepip/__main__.py` **файлом** в stdlib, а `PYTHONPATH` у дочернего процесса вычищает. Только пакетом.

**2. Chromium скачивается, но не запускается.** В системе нет `libnspr4`, `libnss3`, `libasound2t64`. Симптом: `error while loading shared libraries: libnspr4.so`.

Коварство в том, что **`/seo doctor` при этом рапортует `browser_ready: true`** — флаг ставится по факту скачивания, а не запуска. Проверять только запуском.

Лечится без root:

```
mkdir -p ~/pw-libs && cd ~/pw-libs
apt-get download libnspr4 libnss3 libasound2t64
for f in *.deb; do dpkg -x "$f" .; done
```

Дальше все команды с браузером запускать с `LD_LIBRARY_PATH=~/pw-libs/usr/lib/x86_64-linux-gnu`, либо прописать переменную в `env` в `.claude/settings.local.json`.

> Осторожно: в этом репозитории `.claude/settings.local.json` вопреки названию **отслеживается git'ом**. Если закоммитить туда линуксовый путь, он уедет и на macOS, где не нужен и только путает. Держите такую настройку незакоммиченной либо кладите в `~/.claude/settings.json` профиля.

> Этот же приём нужен и для Playwright из `node_modules` — библиотеки общие.

### Ключ Google API (PageSpeed и CrUX)

Без ключа `/seo` упирается в общий анонимный лимит PSI, а полевых данных CrUX не получить вообще. Ключ бесплатный, биллинг не нужен.

1. <https://console.cloud.google.com> → создать проект.
2. Включить две API в этом проекте: [PageSpeed Insights](https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com) и [Chrome UX Report](https://console.cloud.google.com/apis/library/chromeuxreport.googleapis.com).
3. Credentials → Create credentials → API key.
4. Ограничить ключ этими двумя API. Если CrUX не появился в списке — он включается в списке с задержкой; **не** ограничивайте пока только PageSpeed, иначе запросы к CrUX начнут отдавать 403.

Положить **своим редактором**, не через агента и не вставляя в чат:

```
mkdir -p ~/.config/claude-seo
$EDITOR ~/.config/claude-seo/google-api.json
chmod 600 ~/.config/claude-seo/google-api.json
```

```json
{ "api_key": "AIza..." }
```

Путь одинаковый на macOS и Linux. Проверка — `claude-seo run google_auth.py --check`, печатает только статус, без значения ключа.

**Ключ в репозиторий не кладём.** `.env` и `.env.local` в gitignore, а вот `.env.dev` и `.env.example` git отслеживает — туда ключи вписывать нельзя.

Search Console, Indexing API и GA4 требуют сервисного аккаунта (файл + выдача доступа в GSC) — это отдельная история, для PageSpeed не нужна. Интерактивный OAuth (`google_auth.py --auth`) агенту недоступен: он открывает браузер.

## Скиллы проекта (ничего делать не нужно)

В отличие от плагинов, эти скиллы лежат прямо в репозитории и появляются автоматически после `git pull`:

- `.claude/skills/shadcn-component-review` — ревью shadcn-компонентов (источник: `mattbx/shadcn-skills`, зафиксирован в `skills-lock.json`)
- `.agents/skills/shadcn-vue` — справочник по shadcn-vue (источник: `unovue/shadcn-vue`, зафиксирован в `skills-lock.json`)

Не путать: `shadcn-vue@claude-skills` (плагин выше) и `shadcn-vue` в `.agents/skills` — это два разных источника с похожим названием.
