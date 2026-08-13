import { describe, expect, it } from 'vitest'
import {
  CATEGORY_LEAD_LIMIT,
  clampDescription,
  composeCategoryLead,
  META_DESCRIPTION_LIMIT,
} from '@/utils/seoDescription'

/**
 * Тексты взяты из прод-базы: ровно на них аудит 12 августа и поймал обрезку
 * посреди слова. Ожидаемые «до» — то, что реально отдавал сайт.
 */
const REAL = {
  boys: 'Машинки, роботы, супергерои, оружие и транспорт для мальчиков любого возраста. Широкий выбор, безопасные материалы. Быстрая доставка по всему Казахстану!',
  constructors:
    'Конструкторы для детей в Казахстане — широкий выбор, быстрая доставка в Алматы, Астану и другие города. Заказывайте в Ухтышка!',
  kiddy:
    'Игрушки для малышей — первые друзья и помощники в познании мира! 👶✨ Погремушки, прорезыватели, мобили, развивающие коврики и мягкие игрушки — всё создано специально для самых маленьких.',
}

const BRANDS = ['Hasbro', 'LEGO', 'Mattel']

/** Как выглядела прежняя сборка — для наглядности, что именно чинится. */
function legacyLead(text: string, brands: string[]): string {
  let out = text
  const sentenceEnd = out.search(/[.!?]\s/)
  if (sentenceEnd > 0 && sentenceEnd < 60)
    out = `${out.slice(0, sentenceEnd + 1)} (${brands.join(', ')})${out.slice(sentenceEnd + 1)}`
  else out = `${out.substring(0, 50)} (${brands.join(', ')})`

  if (out.length > 80) {
    const cut = out.lastIndexOf(' ', 80)
    out = cut > 50 ? out.substring(0, cut) : out.substring(0, 80)
  }
  return out
}

/** Слово считаем разорванным, если строка кончается на середине слова. */
function endsMidWord(result: string, source: string): boolean {
  const tail = result.replace(/\W+$/, '').split(/\s+/).pop() ?? ''
  if (!tail)
    return false
  // Обрывок — это когда такого слова в исходнике нет, а есть слово, которое
  // с него начинается.
  const words = source.split(/\s+/).map(w => w.replace(/[.,!?;:()]/g, ''))
  return !words.includes(tail) && words.some(w => w.startsWith(tail) && w !== tail)
}

describe('прежнее поведение действительно ломало текст', () => {
  // То, что реально отдавал dev.uhti.kz 13 августа:
  //   /catalog/boys              «…оружие и транспорт дл (Hstar, Mattel, MokaToys)»
  //   /catalog/constructors-root «…широкий выбо (CaDA, Feelo, Gudi)»
  //   /catalog/kiddy             «…помощники в  (Hola Toys, Huanger, Joy Toy)»
  it.each([
    ['boys', REAL.boys, 'транспорт дл'],
    ['constructors', REAL.constructors, 'широкий выбо'],
    ['kiddy', REAL.kiddy, 'помощники в '],
  ])('%s: обрывало слово', (_name, text, broken) => {
    expect(legacyLead(text, BRANDS)).toContain(broken)
  })

  it('новая сборка тех же обрывков не даёт', () => {
    expect(composeCategoryLead(REAL.boys, BRANDS)).not.toContain('транспорт дл ')
    expect(composeCategoryLead(REAL.constructors, BRANDS)).not.toContain('широкий выбо ')
  })
})

describe('composeCategoryLead', () => {
  it('не обрывает слово ни на одном из трёх пострадавших описаний', () => {
    for (const [name, text] of Object.entries(REAL)) {
      const lead = composeCategoryLead(text, BRANDS)
      expect(endsMidWord(lead, text), `${name}: «${lead}»`).toBe(false)
    }
  })

  it('список брендов попадает целиком или не попадает вовсе', () => {
    for (const text of Object.values(REAL)) {
      const lead = composeCategoryLead(text, BRANDS)
      if (lead.includes('('))
        expect(lead).toContain(`(${BRANDS.join(', ')})`)
    }
  })

  it('на описании «boys» отдаёт целые слова и полный список', () => {
    const lead = composeCategoryLead(REAL.boys, BRANDS)
    expect(lead).not.toContain('транспорт дл ')
    expect(lead).toContain('(Hasbro, LEGO, Mattel)')
  })

  it('короткий текст возвращает как есть', () => {
    expect(composeCategoryLead('Куклы и аксессуары', [])).toBe('Куклы и аксессуары')
  })

  it('не приклеивает бренды, если один из них уже упомянут', () => {
    const text = 'Конструкторы LEGO и другие наборы для детей'
    expect(composeCategoryLead(text, BRANDS)).toBe(text)
  })

  it('снимает html-теги', () => {
    expect(composeCategoryLead('<p>Мягкие игрушки</p>', [])).toBe('Мягкие игрушки')
  })

  it('пустой вход не роняет', () => {
    expect(composeCategoryLead(null, BRANDS)).toBe('')
    expect(composeCategoryLead('   ', BRANDS)).toBe('')
  })

  it('опускает бренды, когда на текст не остаётся места', () => {
    const huge = ['Очень Длинное Название Бренда', 'И Ещё Одно Такое Же', 'И Третье']
    const lead = composeCategoryLead(REAL.boys, huge)
    expect(lead).not.toContain('(')
    expect(lead.length).toBeLessThanOrEqual(CATEGORY_LEAD_LIMIT + 8)
  })
})

describe('clampDescription', () => {
  it('короткое описание не трогает', () => {
    const short = 'Игрушки в Алматы. Доставка за день.'
    expect(clampDescription(short)).toBe(short)
  })

  it('длинное обрезает по границе слова и ставит многоточие', () => {
    const long = `${'Конструкторы и наборы для детей всех возрастов. '.repeat(6)}Конец`
    const out = clampDescription(long)

    expect(out.endsWith('...')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(META_DESCRIPTION_LIMIT + 3)
    expect(endsMidWord(out.slice(0, -3), long)).toBe(false)
  })

  it('пустой вход не роняет', () => {
    expect(clampDescription(null)).toBe('')
  })
})
