import { describe, expect, it } from 'vitest'
import { escapeMarkdown } from '@/supabase/functions/_shared/telegramUtils'

/**
 * Бот отправляет сообщения с `parse_mode: 'Markdown'` — это ПЕРВАЯ версия
 * разметки. В ней значение имеют только `_`, `*`, `[` и обратная кавычка;
 * слеш перед любым другим символом печатается как есть.
 *
 * До 3 сентября 2026 здесь стоял набор для MarkdownV2, и менеджеры видели в
 * чате «\+77771234567» и «Айгуль \(@aigul\_m\)».
 */
describe('escapeMarkdown', () => {
  it('телефон остаётся телефоном', () => {
    expect(escapeMarkdown('+7 777 123-45-67')).toBe('+7 777 123-45-67')
    expect(escapeMarkdown('+7 (701) 000-00-00')).toBe('+7 (701) 000-00-00')
  })

  it('адрес не обрастает слешами', () => {
    expect(escapeMarkdown('Алматы, ул. Абая 10, кв. 5')).toBe('Алматы, ул. Абая 10, кв. 5')
  })

  it('ник экранируется — подчёркивание в Markdown значимо', () => {
    expect(escapeMarkdown('aigul_m')).toBe('aigul\\_m')
  })

  /* Иначе чужой текст мог бы сломать разметку всего сообщения. */
  it('символы разметки обезврежены', () => {
    expect(escapeMarkdown('*жирный*')).toBe('\\*жирный\\*')
    expect(escapeMarkdown('[ссылка](http://evil)')).toBe('\\[ссылка](http://evil)')
    expect(escapeMarkdown('`код`')).toBe('\\`код\\`')
    expect(escapeMarkdown('обратный \\ слеш')).toBe('обратный \\\\ слеш')
  })

  it('пустое остаётся пустым', () => {
    expect(escapeMarkdown(null)).toBe('')
    expect(escapeMarkdown(undefined)).toBe('')
    expect(escapeMarkdown('')).toBe('')
  })

  it('не строку не роняет', () => {
    expect(escapeMarkdown(12345 as any)).toBe('12345')
  })
})
