#!/usr/bin/env python3
"""
Оборачивает содержимое <style scoped> в @layer components.

Зачем — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md. Коротко: scoped-стиль
компилируется вне слоёв и бьёт утилиты Tailwind независимо от специфичности,
из-за чего свой класс молча отменяет утилиту на том же элементе.

ПЕРЕД запуском обязательно проверить файл на конфликты:

    python3 scripts/audit-scoped-style-layers.py pages/some.vue

Обёртка меняет каскад для всего файла: то, что раньше побеждало утилиту,
после неё проигрывает. Скрипт этого не проверяет — он только переставляет
скобки.

Запуск:
    python3 scripts/wrap-scoped-styles-in-layer.py pages/some.vue [ещё.vue ...]
"""
import re
import sys
import pathlib

NOTE = """/* Стили ниже намеренно лежат в @layer components.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты
   Tailwind живут в @layer utilities. Беслойное правило бьёт слой независимо
   от специфичности, поэтому свой класс молча отменял бы утилиту на том же
   элементе (так на проекте умирали `hidden`, `lg:flex` и `gap-[...]`).

   Внутри слоя порядок нормальный: components объявлен раньше utilities, и
   утилита всегда перебивает класс. Значит раскладку можно править классом
   в разметке, не трогая этот блок.

   Подробности и порядок слоёв: docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
"""


def wrap(path: str) -> bool:
    p = pathlib.Path(path)
    text = p.read_text(encoding='utf-8')
    m = re.search(r'(<style[^>]*\bscoped\b[^>]*>\n)(.*?)(\n</style>)', text, re.S)
    if not m:
        print(f'  пропуск (нет scoped-блока): {path}')
        return False
    open_tag, body, close_tag = m.groups()
    if '@layer' in body:
        print(f'  пропуск (уже в слое): {path}')
        return False

    indented = '\n'.join(('  ' + ln if ln.strip() else ln)
                         for ln in body.split('\n'))
    new = f'{open_tag}{NOTE}\n@layer components {{\n{indented}\n}}{close_tag}'
    p.write_text(text[:m.start()] + new + text[m.end():], encoding='utf-8')
    print(f'  обёрнут: {path}')
    return True


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    changed = sum(wrap(a) for a in argv)
    print(f'\nОбёрнуто файлов: {changed} из {len(argv)}')
    print('Дальше: corepack pnpm build, затем сверить ESLint с базовым уровнем.')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
