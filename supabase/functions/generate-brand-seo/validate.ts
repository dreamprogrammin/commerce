/**
 * Проверка того, что вернула модель.
 *
 * Файл намеренно БЕЗ ЗАВИСИМОСТЕЙ: `index.ts` тянет Deno-импорты с esm.sh,
 * которые обычному тест-раннеру не разрешить, а проверять эту логику надо
 * именно тестами — она стоит между ответом модели и разметкой сайта.
 * Тесты лежат в `tests/utils/brandSeoValidate.test.ts`.
 */

export interface GeneratedBrandSeo {
  brand_id: string
  meta_title: string
  seo_h1: string
  seo_description: string
  description: string
}

/**
 * Теги, которые разрешено вернуть в тексте «О бренде». Всё остальное
 * вырезается вместе с атрибутами.
 */
const ALLOWED_TAGS = new Set(['h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'br'])

/**
 * Разметка из ответа модели проверяется, а не берётся на веру.
 *
 * Это поле уезжает в базу и оттуда на страницу бренда через `v-html`, то есть
 * ответ модели попадает в разметку сайта как есть. Обещания в промпте («верни
 * такой HTML») здесь не защита: сгенерированный текст — это данные, а данным
 * доверять нельзя, даже когда их источник свой. Оставляем только согласованные
 * теги и единственный атрибут `data-icon` с известным набором имён; всё
 * прочее — обработчики событий, ссылки, картинки, стили — вырезается вместе с
 * тегом, а человеку показывается предупреждение.
 */
export function sanitizeBrandHtml(html: string): { html: string, warnings: string[] } {
  if (!html.trim())
    return { html: '', warnings: [] }

  const removed = new Set<string>()

  /*
   * `<script>` и `<style>` вырезаются ВМЕСТЕ С СОДЕРЖИМЫМ, а не только
   * тегами: снятие тегов оставило бы их текст на странице («alert(1)»
   * посреди рассказа о бренде). Безопасно и без этого, но выглядит как мусор.
   */
  const withoutBlocks = html.replace(
    /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    (_full, tag: string) => {
      removed.add(tag.toLowerCase())
      return ''
    },
  )

  const cleaned = withoutBlocks.replace(
    /<\/?([a-z0-9-]+)((?:"[^"]*"|'[^']*'|[^'">])*)>/gi,
    (full, rawTag: string, rawAttrs: string) => {
      const tag = rawTag.toLowerCase()

      if (!ALLOWED_TAGS.has(tag)) {
        removed.add(tag)
        return ''
      }

      if (full.startsWith('</'))
        return `</${tag}>`

      const icon = /data-icon\s*=\s*["'](fluent-emoji-flat:[a-z0-9-]+)["']/i.exec(rawAttrs)
      return icon ? `<${tag} data-icon="${icon[1]}">` : `<${tag}>`
    },
  )

  const warnings = removed.size > 0
    ? [`Из текста вырезаны неразрешённые теги: ${[...removed].join(', ')}`]
    : []

  return { html: cleaned, warnings }
}

/**
 * Длины проверяем у себя, а не надеемся на промпт: модель просят уложиться
 * в 60 знаков, но обещание — не гарантия, а обрезанный заголовок в выдаче
 * читается как брак. Админка показывает эти предупреждения человеку.
 */
export function checkLengths(item: GeneratedBrandSeo): string[] {
  const warnings: string[] = []

  if (item.meta_title.length > 60)
    warnings.push(`Заголовок ${item.meta_title.length} знаков — Google обрежет после 60`)
  if (!item.meta_title.includes('Ухтышка'))
    warnings.push('В заголовке нет названия магазина')
  if (item.seo_h1.length > 60)
    warnings.push(`H1 длинноват: ${item.seo_h1.length} знаков`)
  if (item.seo_description.length > 165)
    warnings.push(`Описание ${item.seo_description.length} знаков — Google покажет около 160`)
  if (item.seo_description.length < 90)
    warnings.push(`Описание короткое: ${item.seo_description.length} знаков`)
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(`${item.meta_title}${item.seo_h1}${item.seo_description}`))
    warnings.push('В тексте остались эмодзи')

  return warnings
}
