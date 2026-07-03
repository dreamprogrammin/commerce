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

## Скиллы проекта (ничего делать не нужно)

В отличие от плагинов, эти скиллы лежат прямо в репозитории и появляются автоматически после `git pull`:

- `.claude/skills/shadcn-component-review` — ревью shadcn-компонентов (источник: `mattbx/shadcn-skills`, зафиксирован в `skills-lock.json`)
- `.agents/skills/shadcn-vue` — справочник по shadcn-vue (источник: `unovue/shadcn-vue`, зафиксирован в `skills-lock.json`)

Не путать: `shadcn-vue@claude-skills` (плагин выше) и `shadcn-vue` в `.agents/skills` — это два разных источника с похожим названием.
