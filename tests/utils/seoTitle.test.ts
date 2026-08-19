import { describe, expect, it } from 'vitest'
import { buildProductTitle, PRODUCT_TITLE_SUFFIX, truncateWords } from '@/utils/seoTitle'

// Реальные названия из каталога — по ним и выводилось правило
const REAL_NAMES = [
  'Говорящий планшет 66-2RUS — 112 карточек, 224 слова, 12 тем, русский и английский язык, 18×4×10 см для детей',
  'LEGO City 60355 Водная полиция',
  'Конструктор LEGO City 60415 Погоня за полицейской машиной и мускул-каром — полиция против грабителей',
  'Аккордеон детский HiH02 пластик — звуковые эффекты, яркий дизайн',
  'Толокар-машинка Sport 5566Y жёлтый, со звуковыми эффектами',
  'Синтезатор MQ-200A 37 клавиш, 8 тембров',
]

describe('truncateWords', () => {
  it('строку короче лимита не трогает', () => {
    expect(truncateWords('LEGO City 60355', 48)).toBe('LEGO City 60355')
  })

  it('режет по границе слова, а не посреди', () => {
    const out = truncateWords('Конструктор LEGO City 60411 Полицейский участок и вертолёт', 40)
    expect(out.length).toBeLessThanOrEqual(40)
    expect(out.endsWith('Полицейский')).toBe(true)
  })

  it('не оставляет висящий предлог на конце', () => {
    // «…60415 Погоня за» — обрывок без смысла
    const out = truncateWords('Конструктор LEGO City 60415 Погоня за полицейской машиной', 38)
    expect(out.endsWith(' за')).toBe(false)
    expect(out.endsWith('Погоня')).toBe(true)
  })

  it('снимает хвостовую пунктуацию и тире', () => {
    expect(truncateWords('Толокар Sport 5566Y жёлтый, со звуком', 27)).toBe('Толокар Sport 5566Y жёлтый')
    expect(truncateWords('Планшет 66-2RUS — 112 карточек', 18)).toBe('Планшет 66-2RUS')
  })

  it('не съедает единственное слово целиком', () => {
    expect(truncateWords('Синтезатор', 3)).toBe('Синтезатор')
  })

  it('переживает пустое и мусорное', () => {
    expect(truncateWords('', 48)).toBe('')
    expect(truncateWords('   ', 48)).toBe('')
  })
})

describe('buildProductTitle', () => {
  it('добавляет бренд', () => {
    expect(buildProductTitle('LEGO City 60355 Водная полиция'))
      .toBe(`LEGO City 60355 Водная полиция${PRODUCT_TITLE_SUFFIX}`)
  })

  it('на пустом названии не отдаёт голый суффикс', () => {
    expect(buildProductTitle('')).toBe(`Товар${PRODUCT_TITLE_SUFFIX}`)
    expect(buildProductTitle(null)).toBe(`Товар${PRODUCT_TITLE_SUFFIX}`)
  })

  /*
   * Ради этого всё и затевалось: до правки ни один из 172 товаров не влезал
   * в 60 знаков — средняя длина была 125, максимум 162. Тест падает на старом
   * шаблоне «[название] [материал] — от [цена] ₸ — Uhti.kz».
   */
  it('любое реальное название укладывается в 60 знаков', () => {
    for (const name of REAL_NAMES)
      expect(buildProductTitle(name).length).toBeLessThanOrEqual(60)
  })

  it('не обрывает слово и не оставляет предлог', () => {
    for (const name of REAL_NAMES) {
      const title = buildProductTitle(name).replace(PRODUCT_TITLE_SUFFIX, '')
      expect(title).not.toMatch(/\s([ивс]|на|для|из|по|от|за|до)$/)
      expect(title).not.toMatch(/[,;:—–-]$/)
    }
  })

  it('материал больше не приклеивается вторым разом', () => {
    // «Аккордеон детский HiH02 пластик» — материал уже есть в самом названии
    const title = buildProductTitle('Аккордеон детский HiH02 пластик — звуковые эффекты')
    expect(title.toLowerCase().split('пластик').length - 1).toBe(1)
  })

  it('цены в заголовке нет — она устаревает и берётся из разметки Product', () => {
    expect(buildProductTitle(REAL_NAMES[0])).not.toMatch(/₸|\d\s?\d{3}/)
  })

  /*
   * Названия устроены как «[модель] — [описание]». Когда обрезка приходится на
   * описание, от него оставался огрызок: «…кран 8063E — 128», «…71115 — яйцо».
   * Задевало 26 названий из 172.
   */
  it('не оставляет огрызок описания после тире', () => {
    expect(buildProductTitle('Радиоуправляемый башенный кран 8063E — 128 деталей, высота 1,8 м'))
      .toBe(`Радиоуправляемый башенный кран 8063E${PRODUCT_TITLE_SUFFIX}`)
    expect(buildProductTitle(REAL_NAMES[0])).not.toMatch(/—\s*\S+$/)
  })

  it('но полноценный хвост после тире сохраняет', () => {
    // три слова и больше — это уже осмысленная часть, а не обрывок
    const title = buildProductTitle('Кран 8063E — большая стрела и пульт')
    expect(title).toContain('—')
    expect(title).toContain('большая стрела и пульт')
  })
})
