import { describe, expect, it } from 'vitest'
import { parseHTMLToBlocks } from '@/utils/parseSEOContent'

/*
 * Почему этот файл появился. 21 сентября 2026 текст связки «раздел + бренд»
 * на сервере показывал «7 490 ₸», а в браузере после гидратации —
 * «7&nbsp;490 ₸», буквально, и Vue ругался на расхождение гидратации.
 *
 * На сервере sanitizeHtml отдаёт HTML как есть (неразрывный пробел — символом),
 * в браузере его пропускает DOMPurify и сериализует тот же пробел сущностью.
 * Разбор срезал теги, но сущности не раскрывал.
 */
describe('parseHTMLToBlocks — сущности', () => {
  it('&nbsp; и сам символ дают одинаковый текст — как на сервере и в браузере', () => {
    const fromBrowser = parseHTMLToBlocks('<p>от 7&nbsp;490 ₸</p>')
    const fromServer = parseHTMLToBlocks('<p>от 7 490 ₸</p>')
    expect(fromBrowser).toEqual(fromServer)
    expect(fromBrowser[0].text).toBe('от 7 490 ₸')
  })

  it('раскрывает сущности в заголовках и пунктах списка', () => {
    const blocks = parseHTMLToBlocks('<h2 data-icon="fluent-emoji-flat:star">Tom &amp; Jerry</h2><ul><li>Кубик &quot;3&times;3&quot; &#8212; 1&#xA0;990 ₸</li></ul>')
    expect(blocks[0]).toEqual({ type: 'h2', text: 'Tom & Jerry', icon: 'fluent-emoji-flat:star' })
    // &times; не из списка — остаётся как есть, а не ломает соседние.
    expect(blocks[1].items?.[0].text).toBe('Кубик "3&times;3" — 1 990 ₸')
  })

  it('раскрывает за один проход: &amp;lt; — это текст «&lt;», а не «<»', () => {
    expect(parseHTMLToBlocks('<p>a &amp;lt; b</p>')[0].text).toBe('a &lt; b')
  })

  it('теги внутри по-прежнему срезаются', () => {
    expect(parseHTMLToBlocks('<p>Смотрите <a href="/x">раздел</a> и <b>бренд</b></p>')[0].text).toBe('Смотрите раздел и бренд')
  })
})

/*
 * Внутренние ссылки в текстах из базы (23 сентября 2026): раньше `<a>`
 * срезался вместе с остальными тегами, и текст раздела не мог сослаться ни
 * на бренд, ни на подраздел.
 */
describe('parseHTMLToBlocks — внутренние ссылки', () => {
  it('ссылка на страницу сайта — куском, текст вокруг с пробелами', () => {
    const [p] = parseHTMLToBlocks('<p>Основа раздела — <a href="/brand/lego">LEGO</a>: City, Marvel и DC.</p>')
    expect(p!.text).toBe('Основа раздела — LEGO: City, Marvel и DC.')
    expect(p!.parts).toEqual([
      { text: 'Основа раздела — ' },
      { text: 'LEGO', href: '/brand/lego' },
      { text: ': City, Marvel и DC.' },
    ])
  })

  it('в пунктах списка — тоже', () => {
    const [ul] = parseHTMLToBlocks('<ul><li data-icon="x"><a href="/brand/sluban">Sluban</a> — техника</li><li>Без ссылки</li></ul>')
    expect(ul!.items![0]!.parts).toEqual([{ text: 'Sluban', href: '/brand/sluban' }, { text: ' — техника' }])
    expect(ul!.items![1]!.parts).toBeUndefined()
  })

  it('чужие адреса и схемы — текстом, без ссылки', () => {
    for (const href of ['https://evil.example/x', '//evil.example', 'javascript:alert(1)', '/a"onmouseover="x', 'mailto:a@b.c']) {
      const [p] = parseHTMLToBlocks(`<p>Смотрите <a href='${href}'>здесь</a> подробнее.</p>`)
      expect(p!.parts).toBeUndefined()
      expect(p!.text).toBe('Смотрите здесь подробнее.')
    }
  })

  it('сущности в тексте ссылки и вокруг раскрываются, переносы строк — пробелом', () => {
    const [p] = parseHTMLToBlocks('<p>Наборы&nbsp;LEGO —\n<a href="/brand/lego/lego-city">LEGO&nbsp;City</a>\nи другие</p>')
    expect(p!.parts).toEqual([
      { text: 'Наборы LEGO — ' },
      { text: 'LEGO City', href: '/brand/lego/lego-city' },
      { text: ' и другие' },
    ])
  })

  it('абзац без ссылок — как раньше, без кусков', () => {
    const [p] = parseHTMLToBlocks('<p>Просто текст</p>')
    expect(p).toEqual({ type: 'p', text: 'Просто текст' })
  })
})

describe('parseHTMLToBlocks — перенос строки внутри тега', () => {
  it('абзац и пункт с переносом не выпадают', () => {
    const blocks = parseHTMLToBlocks('<h2>Как\nвыбрать</h2><p>Первая строка\nвторая строка</p><ul><li>пункт\nс переносом</li></ul>')
    expect(blocks.map(b => b.type)).toEqual(['h2', 'p', 'ul'])
    expect(blocks[1]!.text).toBe('Первая строка\nвторая строка')
  })
})
