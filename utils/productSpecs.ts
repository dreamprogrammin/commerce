/**
 * Характеристики товара из его названия и описания.
 *
 * Зачем (23 сентября 2026). Владелец попросил характеристики, как на
 * карточках «Детского мира» (питание, световые и звуковые эффекты, тип,
 * цвет), со ссылками — и чтобы при добавлении товара они заполнялись сами.
 * Структурных характеристик в базе почти не было: «Цвет» не заполнен ни у
 * одного товара. Зато сведения есть в описаниях — у машинок на пульте
 * батарейки упомянуты у 25 из 47, свет у 25, звук у 24.
 *
 * Здесь только правила: по названию и описанию — предложение значений.
 * Решает админ: форма подставляет их в пустые поля, он проверяет и
 * сохраняет. Ключ — `slug` атрибута в базе, значение — текст варианта
 * (`attribute_options.value`); номер варианта форма находит сама.
 *
 * Правила писались по всем 178 товарам на бою, на тех фразах, которые там
 * встречаются. Тонкие места — в тестах `tests/utils/productSpecs.test.ts`:
 *  • «батарейки не нужны» и «никаких расходов на батарейки» пишут у товаров
 *    С АККУМУЛЯТОРОМ — поэтому аккумулятор проверяется первым;
 *  • «никаких батареек» у механической каталки — это «Без батареек»;
 *  • у техники с аккумулятором пульт часто на батарейках АА — питание
 *    указывается по самой игрушке, то есть аккумулятор;
 *  • «звуковое восприятие» и «цветовое восприятие» — про развитие ребёнка,
 *    а не про эффекты игрушки; «переливается при свете» — тоже не подсветка.
 *
 * Границы слов — через `\p{L}` с флагом `u`, а не `\b`: в JavaScript `\b`
 * знает только латиницу, и `\bсиний\b` на русском тексте не совпадёт никогда.
 */

export type SpecValues = Record<string, string>

/** Значение и фрагмент текста, на котором сработало правило, — чтобы было видно, откуда оно. */
export type SpecExplained = Record<string, { value: string, evidence: string }>

/** Атрибуты, которые умеют заполнять правила, — `slug` в базе → название. */
export const SPEC_ATTRIBUTES = {
  'pitanie': 'Питание',
  'svetovye-effekty': 'Световые эффекты',
  'zvukovye-effekty': 'Звуковые эффекты',
  'chastota-upravleniya': 'Частота управления',
  'masshtab': 'Масштаб',
  'vid-tehniki': 'Вид техники',
  'color': 'Цвет',
  'kolichestvo-detaley': 'Количество деталей',
  'tip-katalki': 'Тип каталки',
  'tip-nabora': 'Тип набора',
  'tip-igrushki': 'Тип игрушки',
  'tip-kukly': 'Тип куклы',
} as const

function plain(html: string | null | undefined): string {
  return (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type Found = { value: string, evidence: string } | null

/** Фрагмент вокруг совпадения — ради проверки глазами, не ради логики. */
function first(text: string, re: RegExp, value: string): Found {
  const m = re.exec(text)
  if (!m)
    return null
  const from = Math.max(0, m.index - 30)
  const to = Math.min(text.length, m.index + m[0].length + 30)
  return { value, evidence: `${from > 0 ? '…' : ''}${text.slice(from, to).trim()}${to < text.length ? '…' : ''}` }
}

// ── Питание: первым аккумулятор, потом «без батареек», потом батарейки ─────
// «Игрушечный аккумулятор» у LEGO 60430 — деталь набора, а не питание
const ACCUMULATOR = /(?<!игрушечн\p{L}{0,3}\s)аккумулятор|USB[\s-]*заряд|заряжа\p{L}*\s+(?:по|через)\s+USB|зарядк\p{L}*\s+(?:по|через)\s+USB/iu
// «механическ» целиком не годится: у клавиатуры «механические клавиши» и подсветка
const NO_BATTERIES = /без батареек|никаких батареек|батарейки не (?:нужны|требуются)|механическая игрушка|полностью механическ/iu
const BATTERIES = /батаре(?:йк|ек|ях|ями)/iu
// «В комплекте батарейки, пульт и USB кабель» (MOKA 2075): кабель намекает на
// аккумулятор в самой машине, батарейки могут быть для пульта — не угадываем
const USB_CABLE = /USB[\s-]*кабел/iu

function power(text: string): Found {
  const found = first(text, ACCUMULATOR, 'Аккумулятор')
    ?? first(text, NO_BATTERIES, 'Без батареек')
    ?? first(text, BATTERIES, 'Батарейки')
  if (found?.value === 'Батарейки' && USB_CABLE.test(text))
    return null
  return found
}

// ── Эффекты ────────────────────────────────────────────────────────────────
const LIGHT = /светов(?:ые|ыми|ых|ой|ым)|подсвет|светящ|светит|светят|светодиод|(?<!\p{L})LED(?!\p{L})|мига[ею]т|(?<!\p{L})фар(?:[аыу]|ами)?(?!\p{L})|маячк|(?<!\p{L})огни(?!\p{L})|(?<!при )(?<!\p{L})свет(?:ом)?(?!\p{L})/iu
// «звуковые / звуковыми» — да («со звуковыми и световыми эффектами» у
// толокаров), «звуковое восприятие» — нет. «сирен» и «голос» — целыми
// словами: «в сиреневом жакете» у куклы и «выбудешь голосованием» у
// настольной игры — не звук
const SOUND = /звуков(?:ые|ыми|ых|ой|ым)(?!\p{L})|(?<!\p{L})звук(?:[иа]|ом|ов|ами)?(?!\p{L})|мелоди|музык|озвуч|(?<!\p{L})голос(?:[ауе]|ом|ов|ами|овые|овыми|овых|овой)?(?!\p{L})|говорящ|(?<!\p{L})по[её]т(?!\p{L})|(?<!\p{L})песн|(?<!\p{L})сирен(?:[аыуе]|ой|ами)?(?!\p{L})/iu

// ── Радиоуправление: частота, масштаб ──────────────────────────────────────
function frequency(text: string): Found {
  const ghz = first(text, /2[.,]4\s*(?:G(?:Hz)?(?![a-z])|ГГц)/i, '2,4 ГГц')
  if (ghz)
    return ghz
  const mhz = text.match(/\b(27|40|49)\s*(?:МГц|MHz)/i)
  return mhz ? first(text, /\b(?:27|40|49)\s*(?:МГц|MHz)/i, `${mhz[1]} МГц`) : null
}

function scale(text: string): Found {
  const m = text.match(/\b1\s*:\s*(\d{1,3})\b/)
  return m ? first(text, /\b1\s*:\s*\d{1,3}\b/, `1:${m[1]}`) : null
}

// ── Число деталей — у конструкторов оно в названии или описании почти всегда ─
function pieces(text: string): Found {
  const m = text.match(/(?<![\p{L}\d])(\d{2,5})\s*детал/iu)
  return m ? first(text, /(?<![\p{L}\d])\d{2,5}\s*детал\p{L}*/iu, m[1]!) : null
}

// ── Вид техники — по названию: оно у техники точное, описание шумит ────────
const VEHICLE: [RegExp, string][] = [
  [/квадрокоптер|(?<!\p{L})дрон/iu, 'Квадрокоптер'],
  [/вертол[её]т/iu, 'Вертолёт'],
  [/самол[её]т|истребител/iu, 'Самолёт'],
  [/(?<!\p{L})танк/iu, 'Танк'],
  // «кран» — отдельным словом: иначе совпадёт «экран»
  [/(?<!\p{L})кран(?!\p{L})|экскаватор|бульдозер|трактор|пожарн|самосвал|погрузчик|бетономешалк|эвакуатор/iu, 'Спецтехника'],
  [/перев[её]ртыш|трюков/iu, 'Машина-перевёртыш'],
  [/внедорожник|джип|(?<!\p{L})нива(?!\p{L})|краулер|монстр/iu, 'Внедорожник'],
  [/машин|такси|спорткар|автомобил/iu, 'Легковая машина'],
]

function vehicle(name: string): Found {
  for (const [re, value] of VEHICLE) {
    const found = first(name, re, value)
    if (found)
      return found
  }
  return null
}

// ── Тип — у каждого семейства разделов свой ────────────────────────────────
/*
 * Отдельный атрибут на семейство, а не один «Тип игрушки» на весь каталог:
 * в форме админки выпадающий список показывает все варианты атрибута, и
 * «Пирамидка» рядом с «Танком» только мешала бы. Варианты — только те, под
 * которые на 23 сентября 2026 есть хотя бы два товара: ссылка из
 * характеристики «Тип» на подборку из одного этого же товара бессмысленна.
 * Тип — по названию: у этих товаров он там всегда.
 */
const TYPES: Record<string, [RegExp, string][]> = {
  'tip-katalki': [
    [/толокар/iu, 'Толокар'],
    [/твистер|бибикар/iu, 'Каталка-твистер'],
  ],
  'tip-nabora': [
    // Магазин — раньше кухни: «Игровой магазин мороженого», «Супермаркет — касса»
    [/доктор|врач|медицинск/iu, 'Доктор'],
    [/трюмо|салон красоты|парикмахер/iu, 'Трюмо'],
    [/магазин|супермаркет|(?<!\p{L})касс/iu, 'Магазин'],
    [/кухн|посуд|(?<!\p{L})плит[аыу](?!\p{L})|фастфуд/iu, 'Кухня'],
  ],
  'tip-igrushki': [
    [/говорящ\p{L}*\s+(?:развивающ\p{L}*\s+)?книг|обучающ\p{L}*\s+говорящ\p{L}*\s+книг/iu, 'Говорящая книга'],
    [/ноутбук/iu, 'Детский ноутбук'],
    [/планшет/iu, 'Обучающий планшет'],
    [/(?<!\p{L})столик/iu, 'Развивающий столик'],
    [/бизиборд|бизикуб/iu, 'Бизиборд'],
  ],
  'tip-kukly': [
    [/русалк|mermaid/iu, 'Кукла-русалка'],
    [/шарнирн/iu, 'Шарнирная кукла'],
  ],
}

function typeOf(slug: string, name: string): Found {
  for (const [re, value] of TYPES[slug] ?? []) {
    const found = first(name, re, value)
    if (found)
      return found
  }
  return null
}

// ── Цвет — только по названию: у цветовых вариантов он там всегда ──────────
const COLORS: [string, string][] = [
  ['ж[её]лт', 'Жёлтый'],
  ['голуб', 'Голубой'],
  ['син', 'Синий'],
  ['красн', 'Красный'],
  ['зел[её]н', 'Зелёный'],
  ['розов', 'Розовый'],
  ['бежев', 'Бежевый'],
  ['коричнев', 'Коричневый'],
  ['сер', 'Серый'],
  ['ч[её]рн', 'Чёрный'],
  ['бел', 'Белый'],
  ['оранжев', 'Оранжевый'],
  ['фиолетов', 'Фиолетовый'],
]
// Основа + окончание прилагательного, отдельным словом: «синяя», «серый»,
// «с розовым», но не «серия» и не «белок»
const COLOR_RES = COLORS.map(([stem, value]) =>
  [new RegExp(`(?<!\\p{L})${stem}(?:ый|ий|ая|яя|ое|ее|ого|его|ой|ей|ые|ие|ым|им|ую|юю)(?!\\p{L})`, 'iu'), value] as const)
// «красно-синий», «бело-розовая» — два цвета сразу
const TWO_COLORS = /(?<!\p{L})(?:красно|сине|бело|ч[её]рно|ж[её]лто|зел[её]но|розово|серо|голубо|оранжево|фиолетово)-\p{L}+/iu

function color(name: string): Found {
  if (TWO_COLORS.test(name))
    return null
  const found = COLOR_RES.map(([re, value]) => first(name, re, value)).filter(Boolean)
  // Два цвета в названии («красно-синий», «белый с розовым») — не угадываем
  return found.length === 1 ? found[0]! : null
}

/**
 * Предложение характеристик по названию и описанию — с фрагментом текста,
 * на котором сработало правило. Возвращает только то,
 * что нашлось; чего нет — того нет в ответе (а не «Нет»: отсутствие слова
 * в описании не доказывает, что у игрушки нет звука).
 */
export function explainSpecs(name: string, descriptionHtml?: string | null): SpecExplained {
  const text = `${name} ${plain(descriptionHtml)}`
  const out: SpecExplained = {}
  const put = (slug: keyof typeof SPEC_ATTRIBUTES, found: Found) => {
    if (found)
      out[slug] = found
  }
  put('pitanie', power(text))
  put('svetovye-effekty', first(text, LIGHT, 'Есть'))
  put('zvukovye-effekty', first(text, SOUND, 'Есть'))
  put('chastota-upravleniya', frequency(text))
  put('masshtab', scale(text))
  put('vid-tehniki', vehicle(name))
  put('color', color(name))
  put('kolichestvo-detaley', pieces(text))
  for (const slug of Object.keys(TYPES) as (keyof typeof SPEC_ATTRIBUTES)[])
    put(slug, typeOf(slug, name))
  return out
}

export function extractSpecs(name: string, descriptionHtml?: string | null): SpecValues {
  return Object.fromEntries(
    Object.entries(explainSpecs(name, descriptionHtml)).map(([slug, found]) => [slug, found.value]),
  )
}

/**
 * То же, но только по атрибутам раздела и с номерами вариантов — для формы
 * админки. Значение, которого нет среди вариантов атрибута, пропускается.
 */
export function matchSpecsToOptions(
  specs: SpecValues,
  attributes: readonly { id: number, slug: string, attribute_options?: readonly { id: number, value: string }[] | null }[],
): Record<number, number> {
  const out: Record<number, number> = {}
  for (const attr of attributes) {
    const value = specs[attr.slug]
    if (!value)
      continue
    const option = attr.attribute_options?.find(o => o.value.toLowerCase() === value.toLowerCase())
    if (option)
      out[attr.id] = option.id
  }
  return out
}
