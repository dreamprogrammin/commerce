/**
 * Подготовка текста для мета-тегов и Schema.org.
 *
 * Заведено после аудита 20 августа 2026, где нашлись две ошибки одного рода.
 *
 * ПЕРВАЯ. `/brand/hstar` отдавал в `<meta name="description">` две тысячи
 * знаков сырого HTML: описание бренда бралось из `seo_description`, а там
 * лежит вёрстка целиком — `<h2 data-icon="…">`, списки, абзацы. В выдаче по
 * такому описанию показывать нечего. Поле заполнено HTML только у одного
 * бренда из 32, поэтому дефект и дожил незамеченным.
 *
 * ВТОРАЯ. Описание товара в разметке `Product` резалось ровно по 500-му
 * знаку, посреди слова: «…доставим по вс». Google берёт это описание в
 * сниппет как есть.
 *
 * Отсюда две функции, и обе — про то, чтобы из текста для человека получить
 * текст для робота: без разметки и обрезанный по границе слова.
 */

/** Убирает теги и схлопывает пробелы. HTML-сущности не раскрывает. */
export function toPlainText(html: string | null | undefined): string {
  if (!html)
    return ''

  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Обрезает по границе слова, а не по счётчику символов.
 *
 * Если ближайший пробел оказался слишком далеко от края (меньше 70% лимита),
 * режем всё-таки по лимиту: одно длинное слово не должно съедать пол-описания.
 * Многоточие не добавляется — в мета-описаниях оно только тратит знаки.
 */
export function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength)
    return text

  const cut = text.slice(0, maxLength)
  const lastSpace = cut.lastIndexOf(' ')

  const result = lastSpace > maxLength * 0.7 ? cut.slice(0, lastSpace) : cut

  // Хвостовые знаки препинания после обрыва фразы читаются как опечатка.
  return result.replace(/[\s,;:—–-]+$/, '')
}

/** Готовая выжимка из HTML: без разметки и по границе слова. */
export function plainExcerpt(
  html: string | null | undefined,
  maxLength: number,
): string {
  return truncateAtWord(toPlainText(html), maxLength)
}
