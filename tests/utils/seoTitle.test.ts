import { describe, expect, it } from 'vitest'
import { buildProductTitle, modelCodes, PRODUCT_TITLE_SUFFIX, truncateWords } from '@/utils/seoTitle'

// Реальные названия из каталога — по ним и выводилось правило
/*
 * Названия, на которых аудит 24 сентября 2026 поймал обрезку посреди модели и
 * потерю кода. Старое правило (по слову до 48 знаков) на них падает.
 */
const AUDIT_NAMES = [
  'Конструктор LEGO City 60401 Строительный паровой каток с водителем',
  'Конструктор LEGO City 60410 Пожарно-спасательный мотоцикл с огнетушителем и женщиной-пожарной',
  'Парковка с рулём «Город» URBAN RAIL TRANSIT T904A — автотрек с эскалатором, 4 машинками и игровым полем 52×38 см для детей от 3 лет',
  'Развивающая башня-горка с шариками HUANGER HE0205 Обезьянка — 5 уровней, 3 шарика-погремушки, съёмные детали для малышей',
  'Конструктор Sluban Girls Dream M38-B1174 Охота за сокровищами 404 детали',
  'Толокар-машинка Sport 5566B голубой, со звуковыми и световыми эффектами, 60х28х37 см',
]

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

  it('не оставляет висящий ДЛИННЫЙ предлог', () => {
    /*
     * Настоящий заголовок с прода 11 сентября 2026: «Конструктор LEGO Marvel
     * 76290 Мстители против | Ухтышка». Короткие предлоги отсекались, а
     * «против» — нет, потому что оно длиннее двух знаков.
     */
    const out = truncateWords(
      'Конструктор LEGO Marvel 76290 Мстители против Левиафана Халк, Локи и Капитан Америка',
      45,
    )
    expect(out.endsWith(' против')).toBe(false)
    expect(out.endsWith('Мстители')).toBe(true)
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
   *
   * С 24 сентября 2026 предел — 70, а « | Ухтышка» ставится, только когда
   * влезает: при пределе 60 с суффиксом название резалось посреди модели
   * («…60401 Строительный паровой» без «каток»), а имя сайта Google и так
   * показывает отдельной строкой.
   */
  it('любое реальное название — не длиннее 70 знаков, суффикс только если влезает', () => {
    for (const name of [...REAL_NAMES, ...AUDIT_NAMES]) {
      const title = buildProductTitle(name)
      expect(title.length).toBeLessThanOrEqual(70)
      if (!title.endsWith(PRODUCT_TITLE_SUFFIX))
        expect(title.length).toBeGreaterThan(60)
    }
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

describe('buildProductTitle — модель целиком (аудит 24 сентября 2026)', () => {
  it('не режет модель посреди словосочетания', () => {
    expect(buildProductTitle(AUDIT_NAMES[0])).toBe('Конструктор LEGO City 60401 Строительный паровой каток с водителем')
    expect(buildProductTitle(AUDIT_NAMES[1])).toBe(`Конструктор LEGO City 60410 Пожарно-спасательный мотоцикл${PRODUCT_TITLE_SUFFIX}`)
  })

  it('сохраняет код модели', () => {
    expect(buildProductTitle(AUDIT_NAMES[2])).toBe(`Парковка с рулём «Город» URBAN RAIL TRANSIT T904A${PRODUCT_TITLE_SUFFIX}`)
    expect(buildProductTitle(AUDIT_NAMES[3])).toContain('HUANGER HE0205 Обезьянка')
  })

  it('режет перед числом деталей, а не посреди названия набора', () => {
    expect(buildProductTitle(AUDIT_NAMES[4])).toBe('Конструктор Sluban Girls Dream M38-B1174 Охота за сокровищами')
  })

  it('не оставляет на конце оборот без существительного', () => {
    const title = buildProductTitle(AUDIT_NAMES[5])
    expect(title).toBe(`Толокар-машинка Sport 5566B голубой${PRODUCT_TITLE_SUFFIX}`)
    expect(title).not.toMatch(/со звуковыми/)
  })
})

describe('modelCodes', () => {
  it('находит коды моделей', () => {
    expect(modelCodes('Конструктор LEGO City 60401 Строительный каток')).toEqual(['60401'])
    expect(modelCodes('Бизикуб Hola Toys 806 Маленькая вселенная')).toEqual(['806'])
    expect(modelCodes('Фотоаппарат Принцесса M12-M/U, поворотный экран')).toEqual(['M12-M/U'])
    expect(modelCodes('Гараж Скорая помощь CLM-557')).toEqual(['CLM-557'])
  })

  it('размеры, масштабы, частоты и счёт деталей — не коды', () => {
    expect(modelCodes('Толокар 60х28х37 см')).toEqual([])
    expect(modelCodes('Книга 25×24 см, 1:16')).toEqual([])
    expect(modelCodes('Машинка на радиоуправлении 2.4GHz')).toEqual([])
    expect(modelCodes('Конструктор 417 деталей')).toEqual([])
    expect(modelCodes('Чемодан 3в1')).toEqual([])
  })
})
