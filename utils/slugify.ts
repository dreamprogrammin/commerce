// utils/slugify.ts
import { slugify as translitSlugify } from 'transliteration'

// Кастомные замены для казахских букв
const kazakhReplacements: [string, string][] = [
  ['ә', 'a'],
  ['Ә', 'A'],
  ['ғ', 'g'],
  ['Ғ', 'G'],
  ['қ', 'q'],
  ['Қ', 'Q'],
  ['ң', 'n'],
  ['Ң', 'N'],
  ['ө', 'o'],
  ['Ө', 'O'],
  ['ұ', 'u'],
  ['Ұ', 'U'],
  ['ү', 'u'],
  ['Ү', 'U'],
  ['һ', 'h'],
  ['Һ', 'H'],
  ['і', 'i'],
  ['І', 'I'],
]

export function slugify(text: string): string {
  if (!text) return ''

  // Сначала заменяем казахские буквы
  let processed = text
  for (const [from, to] of kazakhReplacements) {
    processed = processed.replaceAll(from, to)
  }

  // Используем библиотеку transliteration для остальной транслитерации
  return translitSlugify(processed, {
    lowercase: true,
    separator: '-',
    replace: [
      ['.', ''], // Убираем точки
      ['&', '-and-'], // & заменяем на and
    ],
  })
}
