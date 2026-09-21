import { describe, expect, it } from 'vitest'
import { extractIconNames, FALLBACK_ICON, fixIconNames, ICON_NAME_FIXES } from '@/utils/iconNames'

const html = `<h2 data-icon="fluent-emoji-flat:direct-hit">Подходит</h2>
<li data-icon="fluent-emoji-flat:gem">Светится</li>
<li data-icon="fluent-emoji-flat:gem-stone">Уже правильная</li>
<li data-icon="fluent-emoji-flat:unicorn-that-does-not-exist">Выдуманная</li>`

describe('extractIconNames', () => {
  it('достаёт все имена из data-icon, без повторов', () => {
    expect(extractIconNames(html + html)).toEqual([
      'fluent-emoji-flat:direct-hit',
      'fluent-emoji-flat:gem',
      'fluent-emoji-flat:gem-stone',
      'fluent-emoji-flat:unicorn-that-does-not-exist',
    ])
  })

  it('пустой и null — пустой список', () => {
    expect(extractIconNames('')).toEqual([])
    expect(extractIconNames(null)).toEqual([])
  })
})

describe('fixIconNames', () => {
  it('известные ошибки заменяет на существующие имена', () => {
    // Эти пять жили в описаниях 102 карточек из 178 — 21 сентября 2026.
    const { html: out, fixed } = fixIconNames(html, () => true)
    expect(out).toContain('data-icon="fluent-emoji-flat:bullseye"')
    expect(out).toContain('data-icon="fluent-emoji-flat:gem-stone">Светится')
    expect(fixed).toEqual([
      { from: 'fluent-emoji-flat:direct-hit', to: 'fluent-emoji-flat:bullseye' },
      { from: 'fluent-emoji-flat:gem', to: 'fluent-emoji-flat:gem-stone' },
    ])
  })

  it('не трогает правильное имя, которое начинается как ошибочное', () => {
    // «gem» и «gem-stone»: без точного сравнения правильное тоже задело бы.
    const { html: out } = fixIconNames('<li data-icon="fluent-emoji-flat:gem-stone">x</li>', () => true)
    expect(out).toBe('<li data-icon="fluent-emoji-flat:gem-stone">x</li>')
  })

  it('несуществующее имя заменяет на запасную иконку и сообщает об этом', () => {
    const exists = (name: string) => !name.endsWith('unicorn-that-does-not-exist')
    const { html: out, unknown } = fixIconNames(html, exists)
    expect(out).toContain(`data-icon="${FALLBACK_ICON}">Выдуманная`)
    expect(unknown).toEqual(['fluent-emoji-flat:unicorn-that-does-not-exist'])
  })

  it('без проверки существования правит только известные ошибки', () => {
    // Сервер иконок не ответил — выдуманное имя остаётся как есть, а не
    // превращается в запасное: без проверки мы не знаем, что оно битое.
    const { html: out, unknown } = fixIconNames(html, null)
    expect(out).toContain('fluent-emoji-flat:unicorn-that-does-not-exist')
    expect(unknown).toEqual([])
  })

  it('на тексте без иконок ничего не меняет', () => {
    const plain = '<p>Просто текст</p>'
    expect(fixIconNames(plain, () => false)).toEqual({ html: plain, fixed: [], unknown: [] })
  })

  it('все замены в справочнике ведут на существующие имена fluent-emoji-flat', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const { globSync } = await import('node:fs')
    const [file] = globSync('node_modules/.pnpm/@iconify-json+fluent-emoji-flat@*/node_modules/@iconify-json/fluent-emoji-flat/icons.json', { cwd: resolve(__dirname, '../..') })
    const json = JSON.parse(readFileSync(resolve(__dirname, '../..', file), 'utf8'))
    const has = (n: string) => n in json.icons || n in (json.aliases ?? {})
    for (const to of [...Object.values(ICON_NAME_FIXES), FALLBACK_ICON])
      expect(has(to.replace('fluent-emoji-flat:', '')), to).toBe(true)
    for (const from of Object.keys(ICON_NAME_FIXES))
      expect(has(from.replace('fluent-emoji-flat:', '')), `${from} должно быть битым`).toBe(false)
  })
})
