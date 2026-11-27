import { describe, expect, it } from 'vitest'
import { demandBlock, demandPhrases, writerDemand, writerTopic } from '../../utils/writerDemand'

const vol = (o: Record<string, number | null>) => new Map(Object.entries(o))
const topic = (id: string, keywords: string[], match_terms: string[] = [], is_active = true) => ({ topic_id: id, name: `Тема ${id}`, keywords, match_terms, is_active })

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
    const topics = [topic('a', ['машинка'], ['машинк'], false)]
    expect(writerTopic(topics, 'a', 'машинка', vol({}))).toBeNull()
    expect(writerTopic(topics, 'zzz', 'кукла', vol({}))).toBeNull()
  })
})

describe('writerDemand', () => {
  it('фразы — с поисками, от частых к редким, без повторов и без нулей', () => {
    const d = writerDemand(
      ['Кукла  Барби', 'кукла барби', 'кукла ветеринар', 'кукла нет данных', 'кукла ноль'],
      { name: 'Куклы', keywords: ['кукла', 'кукла барби', 'куклы купить'] },
      vol({ 'кукла барби': 1200, 'кукла ветеринар': 40, 'кукла нет данных': null, 'кукла ноль': 0, 'кукла': 13500, 'куклы купить': 900 }),
    )
    expect(d).toEqual({
      own: [{ phrase: 'кукла барби', volume: 1200 }, { phrase: 'кукла ветеринар', volume: 40 }],
      topic: { name: 'Куклы', phrases: [{ phrase: 'кукла', volume: 13500 }, { phrase: 'куклы купить', volume: 900 }] },
    })
    expect(demandPhrases(d).map(p => p.phrase)).toEqual(['кукла барби', 'кукла ветеринар', 'кукла', 'куклы купить'])
  })
  it('спроса нет — null и пустой блок', () => {
    const d = writerDemand(['кукла'], { name: 'Куклы', keywords: ['куклы'] }, vol({ кукла: null }))
    expect(d).toBeNull()
    expect(demandBlock(d)).toBe('')
    expect(demandPhrases(d)).toEqual([])
  })
  it('блок для модели — с числами и темой', () => {
    const block = demandBlock(writerDemand(['кукла барби'], { name: 'Куклы', keywords: ['кукла'] }, vol({ 'кукла барби': 1200, 'кукла': 13500 })))
    expect(block).toBe('СПРОС (что покупатели ищут в Google по Казахстану, запросов в месяц):\nЗапросы про этот товар:\n- кукла барби — 1 200\nЧастые запросы темы «Куклы»:\n- кукла — 13 500')
  })
})
