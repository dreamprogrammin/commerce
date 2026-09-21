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
