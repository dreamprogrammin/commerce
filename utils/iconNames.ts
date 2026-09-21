/**
 * Имена иконок в HTML-текстах из базы: `data-icon="fluent-emoji-flat:<имя>"`.
 *
 * Зачем. 21 сентября 2026 выяснилось, что пустые иконки стоят на 102
 * карточках товаров из 178, а ещё в текстах разделов, брендов и линеек.
 * Причина одна: имя иконки, которого в коллекции нет, — `direct-hit`, `gem`,
 * `superhero`… Похоже, их придумывали по английскому названию эмодзи в
 * Юникоде, а в Fluent Emoji у той же картинки своё имя (🎯 — `bullseye`).
 * Браузер на таком имени рисует пустое место, сервер иконок отвечает
 * пустотой, и никто ничего не замечает.
 *
 * Проверить существование имени здесь нельзя — список коллекции весит под
 * сотню килобайт. Поэтому функция принимает проверку снаружи: админка
 * спрашивает собственный сервер иконок сайта (см. useIconNameGuard), а
 * тесты подставляют свою.
 */

/** Атрибут с иконкой в тексте. Кавычка в конце — часть шаблона: иначе «gem» задело бы «gem-stone». */
const ICON_ATTR = /data-icon="([a-z0-9-]+:[a-z0-9-]+)"/g

/**
 * Известные ошибки → существующие имена. Все пары взяты из базы 21 сентября
 * 2026, а тест сверяет справочник с установленной коллекцией: слева имена,
 * которых нет, справа — которые есть.
 */
export const ICON_NAME_FIXES: Readonly<Record<string, string>> = {
  'fluent-emoji-flat:direct-hit': 'fluent-emoji-flat:bullseye',
  'fluent-emoji-flat:gem': 'fluent-emoji-flat:gem-stone',
  'fluent-emoji-flat:superhero': 'fluent-emoji-flat:person-superhero',
  'fluent-emoji-flat:dinosaur': 'fluent-emoji-flat:sauropod',
  'fluent-emoji-flat:treasure-chest': 'fluent-emoji-flat:gem-stone',
  'fluent-emoji-flat:doll': 'fluent-emoji-flat:princess',
  'fluent-emoji-flat:bulldozer': 'fluent-emoji-flat:building-construction',
  'fluent-emoji-flat:squeeze-bottle': 'fluent-emoji-flat:relieved-face',
  'fluent-emoji-flat:mermaid': 'fluent-emoji-flat:spiral-shell',
}

/**
 * Чем заменить имя, которого нет в коллекции и нет в справочнике. Пустая
 * иконка хуже любой: ✨ хотя бы не выглядит поломкой.
 */
export const FALLBACK_ICON = 'fluent-emoji-flat:sparkles'

/** Все имена иконок в тексте, по порядку первого появления, без повторов. */
export function extractIconNames(html: string | null | undefined): string[] {
  if (!html)
    return []
  return [...new Set([...html.matchAll(ICON_ATTR)].map(m => m[1]))]
}

export interface IconFixResult {
  html: string
  /** Известные ошибки, исправленные по справочнику. */
  fixed: { from: string, to: string }[]
  /** Имена, которых нет нигде, — заменены на FALLBACK_ICON. */
  unknown: string[]
}

/**
 * Исправить имена иконок в тексте.
 *
 * `exists` — проверка существования имени. `null` значит «проверить не
 * удалось» (например, сервер иконок не ответил): тогда правятся только
 * известные ошибки из справочника, а незнакомые имена остаются как есть —
 * без проверки мы не знаем, что они битые, и портить правильные нельзя.
 */
export function fixIconNames(
  html: string,
  exists: ((name: string) => boolean) | null,
): IconFixResult {
  const fixed: IconFixResult['fixed'] = []
  const unknown: string[] = []

  const out = html.replace(ICON_ATTR, (_, name: string) => {
    const known = ICON_NAME_FIXES[name]
    if (known) {
      if (!fixed.some(f => f.from === name))
        fixed.push({ from: name, to: known })
      return `data-icon="${known}"`
    }
    if (exists && !exists(name)) {
      if (!unknown.includes(name))
        unknown.push(name)
      return `data-icon="${FALLBACK_ICON}"`
    }
    return `data-icon="${name}"`
  })

  return { html: out, fixed, unknown }
}
