#!/usr/bin/env python3
"""
Безопасно ли обернуть scoped-стили файла в @layer components.

Сейчас scoped-правила беслойные и бьют утилиты Tailwind всегда. После
обёртки порядок перевернётся: утилиты станут главными. Значит сломается
всё, что СЕЙЧАС полагается на победу scoped-правила над утилитой.

Скрипт ищет ровно это: элемент, у которого есть и свой класс, и утилита,
спорящие за одно свойство. Учитываются :class-привязки и псевдосостояния
(:hover, :disabled, :focus). Селекторы с потомками и псевдоэлементами
(`.card h3`, `.x::-webkit-scrollbar`) автоматически не сверить — они
выводятся отдельным списком под ручной просмотр.

Запуск:
    python3 scripts/audit-scoped-style-layers.py pages/some.vue
    python3 scripts/audit-scoped-style-layers.py --all

Код возврата: 1 если найдены конфликты, иначе 0.
Подробности: docs/SCOPED_STYLES_TAILWIND_LAYERS.md
"""
import re
import sys
import pathlib
import collections

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCAN_DIRS = ('pages', 'components', 'layouts')

# Утилита -> CSS-свойство. Только то, что реально сталкивается.
EXACT = {
    'hidden': 'display', 'block': 'display', 'inline-block': 'display',
    'flex': 'display', 'inline-flex': 'display', 'grid': 'display',
    'inline-grid': 'display', 'contents': 'display', 'table': 'display',
    'static': 'position', 'fixed': 'position', 'absolute': 'position',
    'relative': 'position', 'sticky': 'position',
    'italic': 'font-style', 'uppercase': 'text-transform',
    'lowercase': 'text-transform', 'capitalize': 'text-transform',
    'underline': 'text-decoration-line',
    'border': 'border-width', 'rounded': 'border-radius',
    'truncate': 'overflow', 'antialiased': '-webkit-font-smoothing',
}
PREFIX = [
    ('gap-x-', 'column-gap'), ('gap-y-', 'row-gap'), ('gap-', 'gap'),
    ('rounded-', 'border-radius'), ('bg-', 'background'),
    ('shadow-', 'box-shadow'), ('opacity-', 'opacity'),
    ('font-', 'font-weight'), ('leading-', 'line-height'),
    ('tracking-', 'letter-spacing'), ('items-', 'align-items'),
    ('justify-', 'justify-content'), ('self-', 'align-self'),
    ('shrink-', 'flex-shrink'), ('grow-', 'flex-grow'),
    ('basis-', 'flex-basis'), ('overflow-', 'overflow'),
    ('w-', 'width'), ('h-', 'height'),
    ('min-w-', 'min-width'), ('min-h-', 'min-height'),
    ('max-w-', 'max-width'), ('max-h-', 'max-height'),
    ('px-', 'padding'), ('py-', 'padding'), ('pt-', 'padding'),
    ('pb-', 'padding'), ('pl-', 'padding'), ('pr-', 'padding'), ('p-', 'padding'),
    ('mx-', 'margin'), ('my-', 'margin'), ('mt-', 'margin'),
    ('mb-', 'margin'), ('ml-', 'margin'), ('mr-', 'margin'), ('m-', 'margin'),
    ('border-', 'border'), ('outline-', 'outline'), ('cursor-', 'cursor'),
    ('transition', 'transition'), ('text-', 'TEXT'),  # TEXT: цвет или размер
]
STATE_VARIANTS = ('hover:', 'focus:', 'active:', 'disabled:', 'focus-within:',
                  'focus-visible:', 'group-hover:')
BP_VARIANTS = ('sm:', 'md:', 'lg:', 'xl:', '2xl:')

# Раскрытие ТОЛЬКО вниз: шорткат из CSS -> длинные свойства, которые он
# задаёт. Раскрывать обе стороны нельзя — тогда border-width и border-color
# «пересекутся» через общий токен border, хотя это разные свойства и
# конфликта между ними нет.
FAMILY = {
    'gap': {'gap', 'column-gap', 'row-gap'},
    'background': {'background', 'background-color', 'background-image'},
    'border': {'border', 'border-width', 'border-color', 'border-style'},
    'flex': {'flex', 'flex-shrink', 'flex-grow', 'flex-basis'},
    'transition': {'transition', 'transition-property'},
    'font': {'font', 'font-size', 'font-weight', 'font-family', 'line-height'},
}


def expand(prop):
    """Свойство из CSS -> что оно фактически задаёт."""
    return FAMILY.get(prop, {prop})


def util_prop(u):
    """Утилита -> (свойство, состояние). Состояние None у базовой утилиты."""
    base, state = u, None
    for v in BP_VARIANTS:
        if base.startswith(v):
            base = base[len(v):]
    for v in STATE_VARIANTS:
        if base.startswith(v):
            state = v.rstrip(':')
            base = base[len(v):]
    base = base.lstrip('!')
    if base in EXACT:
        return EXACT[base], state
    # border-* — это либо толщина (border-2, border-x-[3px]), либо цвет
    # (border-blue-200). Свойства разные, и мешать их нельзя: класс с
    # border-width не конфликтует с утилитой цвета рамки.
    bm = re.fullmatch(r'border(?:-[xytrbles])?-(.+)', base)
    if bm:
        rest = bm.group(1)
        is_width = re.fullmatch(r'\d+', rest) or re.fullmatch(r'\[[\d.]+[a-z%]*\]', rest)
        return ('border-width' if is_width else 'border-color'), state
    # text-* — тоже два разных свойства: размер (text-sm, text-[17px]) и
    # цвет (text-destructive, text-blue-500).
    tm = re.fullmatch(r'text-(.+)', base)
    if tm:
        rest = tm.group(1)
        if rest in ('left', 'center', 'right', 'justify', 'start', 'end'):
            return 'text-align', state
        if rest in ('wrap', 'nowrap', 'balance', 'pretty'):
            return 'text-wrap', state
        if rest in ('ellipsis', 'clip'):
            return 'text-overflow', state
        is_size = (rest in ('xs', 'sm', 'base', 'lg', 'xl')
                   or re.fullmatch(r'\d?xl', rest)
                   or re.fullmatch(r'\[[\d.]+[a-z%]*\]', rest))
        return ('font-size' if is_size else 'color'), state
    for pref, prop in PREFIX:
        if base.startswith(pref):
            return prop, state
    return None, state


def third_party_hazards(text):
    """
    Классы, которые перебивают БЕСЛОЙНЫЙ сторонний CSS — после обёртки они
    проиграют, потому что беслойное правило бьёт любой слой.

    Живой случай: Nuxt Icon отдаёт `:where(.i-lucide\\:x){width:1em;height:1em}`
    вне слоёв. Нулевая специфичность у :where() сделана как раз чтобы правило
    легко перебивали — и scoped-класс с width его перебивал, пока сам был
    беслойным. После обёртки иконки поехали с 19px на 16px.

    Ловим статически самый частый вид: свой класс на <Icon>, задающий размер.
    """
    tmpl = text.split('<style')[0]
    m = re.search(r'<style[^>]*\bscoped\b[^>]*>(.*?)</style>', text, re.S)
    if not m:
        return []
    css = re.sub(r'/\*.*?\*/', '', m.group(1), flags=re.S)
    sized = set()
    for sel, body in re.findall(r'([^{}]+)\{([^{}]*)\}', css):
        if sel.strip().startswith('@'):
            continue
        props = {d.split(':')[0].strip().lower() for d in body.split(';') if ':' in d}
        if props & {'width', 'height', 'font-size'}:
            for c in re.findall(r'\.([a-zA-Z][\w-]*)', sel):
                sized.add(c)
    hits = set()
    for tag in re.findall(r'<Icon[^>]*>', tmpl, re.S):
        for attr in re.findall(r'class="([^"]*)"', tag):
            for c in attr.split():
                if c in sized:
                    hits.add(c)
    return sorted(hits)


def analyse(path):
    """-> (конфликты, сложные селекторы, число своих классов, число элементов)"""
    text = pathlib.Path(path).read_text(encoding='utf-8')
    m = re.search(r'<style[^>]*\bscoped\b[^>]*>(.*?)</style>', text, re.S)
    if not m:
        return None
    css = re.sub(r'/\*.*?\*/', '', m.group(1), flags=re.S)
    tmpl = text.split('<style')[0]

    # класс -> {состояние -> набор свойств}; состояние None = базовое правило
    rules = collections.defaultdict(lambda: collections.defaultdict(set))
    descendant = collections.defaultdict(set)
    complex_sel = []
    for sel, body in re.findall(r'([^{}]+)\{([^{}]*)\}', css):
        sel = sel.strip()
        if sel.startswith('@') or not sel:
            continue
        props = {d.split(':')[0].strip().lower()
                 for d in body.split(';') if ':' in d}
        props = {p for p in props if p and not p.startswith('--')}
        for part in [s.strip() for s in sel.split(',')]:
            classes = re.findall(r'\.([a-zA-Z][\w-]*)', part)
            if not classes:
                continue
            if re.search(r'[\s>+~]', part) or '::' in part or ':deep' in part:
                complex_sel.append((part, sorted(props)))
                # Правило вида `.card:hover .icon` применяется к ЭЛЕМЕНТУ .icon,
                # просто при условии на предке. Значит утилита на самом .icon с
                # тем же свойством после обёртки его перебьёт — и, в отличие от
                # обычного случая, перебьёт во всех состояниях сразу.
                # Псевдоэлементы (::-webkit-scrollbar) сюда не годятся: утилита
                # в них не попадает, и :deep()/:global тоже пропускаем — там
                # цель вне разметки этого файла.
                if '::' not in part and ':deep' not in part and ':global' not in part:
                    tail = re.split(r'[\s>+~]+', part.strip())[-1]
                    for c in re.findall(r'\.([a-zA-Z][\w-]*)', tail):
                        descendant[c] |= props
                continue
            state = None
            sm = re.search(r':(hover|focus|disabled|focus-within|active)', part)
            if sm:
                state = sm.group(1)
            for c in classes:
                rules[c][state] |= props

    # элементы шаблона: все токены классов, включая литералы из :class
    elements = []
    for tag in re.findall(r'<[a-zA-Z][^>]*>', tmpl, re.S):
        toks = []
        for a in re.findall(r'\bclass="([^"]*)"', tag):
            toks += a.split()
        for a in re.findall(r':class="((?:[^"\\]|\\.)*)"', tag, re.S):
            for lit in re.findall(r"'([^']*)'", a):
                toks += lit.split()
        if toks:
            elements.append(toks)

    conflicts = set()
    for toks in elements:
        # правила «через предка»
        for o in [t for t in toks if t in descendant]:
            css_props = {q for p in descendant[o] for q in expand(p)}
            for t in toks:
                if t in descendant or t in rules:
                    continue
                prop, _ = util_prop(t)
                if prop and prop in css_props:
                    conflicts.add((f'.{o} (через правило на предке)', None, t, (prop,)))
        own = [t for t in toks if t in rules]
        if not own:
            continue
        for t in toks:
            if t in rules:
                continue
            prop, ustate = util_prop(t)
            if not prop:
                continue
            for o in own:
                for rstate, props in rules[o].items():
                    # базовое scoped-правило перебивает утилиту в любом
                    # состоянии; правило с состоянием — только в своём
                    if rstate is not None and rstate != ustate:
                        continue
                    css_props = {q for p in props for q in expand(p)}
                    if prop in css_props:
                        conflicts.add((o, rstate, t, (prop,)))

    used = sum(1 for e in elements if any(t in rules for t in e))
    return conflicts, complex_sel, len(rules), used


def report_one(path):
    res = analyse(path)
    if res is None:
        print(f'{path}: scoped-блока нет')
        return 0
    conflicts, complex_sel, n_cls, n_el = res
    haz = third_party_hazards(pathlib.Path(path).read_text(encoding='utf-8'))
    print(f'=== {path}')
    print(f'своих классов: {n_cls}, элементов с ними: {n_el}')
    if haz:
        print('\n!!! ПЕРЕБИВАЕТ СТОРОННИЙ БЕСЛОЙНЫЙ CSS — после обёртки сломается:')
        for h in haz:
            print(f'   .{h} задаёт размер <Icon>; Nuxt Icon отдаёт width/height вне слоёв и выиграет')
    if complex_sel:
        print(f'\nСелекторы с потомками/псевдоэлементами — проверить руками ({len(complex_sel)}):')
        for s, p in complex_sel:
            print(f'   {s}  ->  {", ".join(p)}')
    if conflicts:
        print(f'\n!!! КОНФЛИКТЫ ({len(conflicts)}) — обёртка изменит вид:')
        for o, rstate, t, hit in sorted(conflicts, key=lambda c: (c[0], c[2])):
            label = o if o.startswith('.') else f'.{o}{f":{rstate}" if rstate else ""}'
            print(f'   {label} спорит с {t} за {", ".join(hit)}')
    if conflicts or haz:
        return 1
    print('\nЯвных конфликтов не видно — но это НЕ гарантия. Проверка статическая\n'
          'и не видит весь сторонний беслойный CSS, который после обёртки начнёт\n'
          'выигрывать. Обязательно сверить скриншоты до и после:\n'
          '  node scripts/shot-pages.mjs before  →  обернуть  →  after  →  diff-shots')
    return 0


def report_all():
    files = []
    for d in SCAN_DIRS:
        files += [p for p in (ROOT / d).rglob('*.vue')
                  if '<style scoped' in p.read_text(encoding='utf-8', errors='ignore')]
    buckets = {'конфликт': [], 'руками': [], 'чисто': [], 'в слое': []}
    for p in sorted(files):
        rel = str(p.relative_to(ROOT))
        text = p.read_text(encoding='utf-8', errors='ignore')
        if re.search(r'<style[^>]*scoped[^>]*>\s*(?:/\*.*?\*/\s*)?@layer', text, re.S):
            buckets['в слое'].append(rel)
            continue
        res = analyse(p)
        if res is None:
            continue
        conflicts, complex_sel, _, _ = res
        if third_party_hazards(text):
            buckets['конфликт'].append(f'{rel}  (перебивает сторонний CSS)')
            continue
        if conflicts:
            buckets['конфликт'].append(f'{rel}  ({len(conflicts)})')
        elif complex_sel:
            buckets['руками'].append(f'{rel}  ({len(complex_sel)})')
        else:
            buckets['чисто'].append(rel)

    order = [
        ('конфликт', 'КОНФЛИКТЫ — обёртка изменит вид, сначала расшить'),
        ('руками', 'Нужен ручной просмотр вложенных селекторов'),
        ('чисто', 'Чисто — можно оборачивать'),
        ('в слое', 'Уже в @layer'),
    ]
    for key, title in order:
        items = buckets[key]
        print(f'\n{title}: {len(items)}')
        for i in items:
            print(f'   {i}')
    total = sum(len(v) for v in buckets.values())
    print(f'\nВсего файлов со scoped-блоками: {total}')
    return 1 if buckets['конфликт'] else 0


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    if argv[0] == '--all':
        return report_all()
    return max(report_one(a) for a in argv)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
