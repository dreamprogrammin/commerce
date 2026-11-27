import { describe, expect, it } from 'vitest'
import { demandBlock, demandPhrases, OWN_PHRASES, writerDemand, writerTopic, writerTopics } from '../../utils/writerDemand'

const vol = (o: Record<string, number | null>) => new Map(Object.entries(o))
function topic(id: string, keywords: string[], match_terms: string[] = [], kind: 'type' | 'franchise' = 'type', is_active = true) {
  return { topic_id: id, name: `Тема ${id}`, kind, keywords, match_terms, is_active }
}

describe('writerTopic', () => {
  it('тема разбора ИИ — важнее признаков', () => {
    const topics = [topic('a', ['машинка'], ['машинк']), topic('b', ['кукла'], ['кукл'])]
    expect(writerTopic(topics, 'b', 'машинка на пульте', vol({}))?.topic_id).toBe('b')
  })
  it('без разбора — по признакам, из нескольких — с бо́льшим спросом', () => {
    const topics = [topic('a', ['машинка'], ['машинк']), topic('b', ['машинка на пульте'], ['пульт'])]
    expect(writerTopic(topics, null, 'машинка на пульте', vol({ 'машинка': 900, 'машинка на пульте': 300 }))?.topic_id).toBe('a')
  })
  it('выключенная тема и чужая тема разбора — мимо', () => {
    const topics = [topic('a', ['машинка'], ['машинк'], 'type', false)]
    expect(writerTopic(topics, 'a', 'машинка', vol({}))).toBeNull()
    expect(writerTopic(topics, 'zzz', 'кукла', vol({}))).toBeNull()
  })
})

describe('writerTopics — тема и персонаж', () => {
  const doll = topic('doll', ['кукла'], ['кукл'])
  const barbie = topic('barbie', ['барби', 'кукла барби'], ['барби', 'barbie'], 'franchise')
  const lol = topic('lol', ['куклы лол'], ['lol'], 'franchise')
  const v = vol({ 'кукла': 9900, 'барби': 8100, 'кукла барби': 1000, 'куклы лол': 2400 })

  it('разбор ИИ выбрал вид вещи — персонаж из названия идёт второй темой', () => {
    const got = writerTopics([doll, barbie, lol], 'doll', 'кукла alisa barbie с гардеробом', 'кукла alisa barbie с гардеробом', v)
    expect(got.map(t => t.topic_id)).toEqual(['doll', 'barbie'])
  })
  it('персонаж только в подписи поста (у соседнего товара) — не берётся', () => {
    const got = writerTopics([doll, barbie, lol], 'doll', 'кукла пупс подпись: ещё куклы barbie и lol', 'кукла пупс', v)
    expect(got.map(t => t.topic_id)).toEqual(['doll'])
  })
  it('разбор ИИ уже выбрал персонажа — второй раз не повторяется', () => {
    const got = writerTopics([doll, barbie], 'barbie', 'спальня для барби', 'спальня для барби', v)
    expect(got.map(t => t.topic_id)).toEqual(['barbie'])
  })
  it('из двух персонажей в названии — с бо́льшим спросом', () => {
    const got = writerTopics([doll, barbie, lol], 'doll', 'кукла barbie lol', 'кукла barbie lol', v)
    expect(got.map(t => t.topic_id)).toEqual(['doll', 'barbie'])
  })
})

describe('writerDemand', () => {
  it('фразы — с поисками, от частых к редким, без повторов и без нулей', () => {
    const d = writerDemand(
      ['Кукла  Барби', 'кукла барби', 'кукла ветеринар', 'кукла нет данных', 'кукла ноль'],
      [{ name: 'Куклы', keywords: ['кукла', 'кукла барби', 'куклы купить'] }],
      vol({ 'кукла барби': 1200, 'кукла ветеринар': 40, 'кукла нет данных': null, 'кукла ноль': 0, 'кукла': 13500, 'куклы купить': 900 }),
    )
    expect(d).toEqual({
      own: [{ phrase: 'кукла барби', volume: 1200 }, { phrase: 'кукла ветеринар', volume: 40 }],
      topics: [{ name: 'Куклы', phrases: [{ phrase: 'кукла', volume: 13500 }, { phrase: 'куклы купить', volume: 900 }] }],
    })
    expect(demandPhrases(d).map(p => p.phrase)).toEqual(['кукла барби', 'кукла ветеринар', 'кукла', 'куклы купить'])
  })
  it('фраза — один раз: у товара, иначе у первой темы; тема без фраз с поисками не идёт', () => {
    const d = writerDemand(
      ['кукла барби'],
      [{ name: 'Кукла', keywords: ['кукла', 'барби'] }, { name: 'Барби', keywords: ['барби', 'кукла барби'] }, { name: 'Пусто', keywords: ['нет такого'] }],
      vol({ 'кукла барби': 1000, 'кукла': 9900, 'барби': 8100 }),
    )
    expect(d?.topics).toEqual([{ name: 'Кукла', phrases: [{ phrase: 'кукла', volume: 9900 }, { phrase: 'барби', volume: 8100 }] }])
  })
  it('фраза, отрезанная лимитом у товара, может уйти в тему', () => {
    const own = Array.from({ length: OWN_PHRASES + 1 }, (_, i) => `фраза ${i}`)
    const volumes = vol(Object.fromEntries(own.map((p, i) => [p, 1000 - i])))
    const d = writerDemand(own, [{ name: 'Тема', keywords: [own.at(-1)!] }], volumes)
    expect(d?.own).toHaveLength(OWN_PHRASES)
    expect(d?.topics).toEqual([{ name: 'Тема', phrases: [{ phrase: own.at(-1), volume: 1000 - OWN_PHRASES }] }])
  })
  it('спроса нет — null и пустой блок', () => {
    const d = writerDemand(['кукла'], [{ name: 'Куклы', keywords: ['куклы'] }], vol({ кукла: null }))
    expect(d).toBeNull()
    expect(demandBlock(d)).toBe('')
    expect(demandPhrases(d)).toEqual([])
  })
  it('блок для модели — с числами, темой и персонажем', () => {
    const block = demandBlock(writerDemand(
      ['кукла alisa'],
      [{ name: 'Кукла', keywords: ['кукла'] }, { name: 'Барби', keywords: ['барби'] }],
      vol({ 'кукла alisa': 10, 'кукла': 13500, 'барби': 8100 }),
    ))
    expect(block).toBe([
      'СПРОС (что покупатели ищут в Google по Казахстану, запросов в месяц):',
      'Запросы про этот товар:',
      '- кукла alisa — 10',
      'Частые запросы темы «Кукла»:',
      '- кукла — 13 500',
      'Частые запросы темы «Барби»:',
      '- барби — 8 100',
    ].join('\n'))
  })
})
