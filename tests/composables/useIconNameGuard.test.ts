import { describe, expect, it, vi } from 'vitest'
import { sanitizeIconRow, sanitizeIconRows } from '@/composables/admin/useIconNameGuard'

vi.mock('vue-sonner', () => ({ toast: { warning: vi.fn() } }))

/** Поддельный сервер иконок: знает только перечисленные имена. */
const serverKnows = (...known: string[]) => vi.fn(async (_prefix: string, names: string[]) => new Set(names.filter(n => known.includes(n))))

describe('sanitizeIconRow', () => {
  it('правит известные ошибки и ставит ✨ на несуществующие', async () => {
    const row = {
      name: 'Кукла',
      description: '<h2 data-icon="fluent-emoji-flat:direct-hit">A</h2><li data-icon="fluent-emoji-flat:made-up">B</li><li data-icon="fluent-emoji-flat:rocket">C</li>',
      price: 100,
    }
    const { row: out, report } = await sanitizeIconRow(row, serverKnows('rocket', 'bullseye'))
    expect(out.description).toBe('<h2 data-icon="fluent-emoji-flat:bullseye">A</h2><li data-icon="fluent-emoji-flat:sparkles">B</li><li data-icon="fluent-emoji-flat:rocket">C</li>')
    expect(report.fixed).toEqual([{ from: 'fluent-emoji-flat:direct-hit', to: 'fluent-emoji-flat:bullseye' }])
    expect(report.unknown).toEqual(['fluent-emoji-flat:made-up'])
    expect(out.price).toBe(100)
    expect(row.description).toContain('direct-hit') // исходник не тронут
  })

  it('проверяет все поля с иконками, а не только description', async () => {
    const { row: out } = await sanitizeIconRow(
      { description: '<p>без иконок</p>', seo_text: '<h2 data-icon="fluent-emoji-flat:gem">x</h2>' },
      serverKnows('gem-stone'),
    )
    expect(out.seo_text).toBe('<h2 data-icon="fluent-emoji-flat:gem-stone">x</h2>')
  })

  it('сервер иконок не ответил — правит только известное, незнакомое не трогает', async () => {
    const failing = vi.fn(async () => {
      throw new Error('network')
    })
    const { row: out, report } = await sanitizeIconRow(
      { description: '<li data-icon="fluent-emoji-flat:gem">a</li><li data-icon="fluent-emoji-flat:made-up">b</li>' },
      failing,
    )
    expect(out.description).toBe('<li data-icon="fluent-emoji-flat:gem-stone">a</li><li data-icon="fluent-emoji-flat:made-up">b</li>')
    expect(report.checkFailed).toBe(true)
    expect(report.unknown).toEqual([])
  })

  it('без иконок в записи сервер не спрашивает вовсе', async () => {
    const fetcher = serverKnows()
    const row = { name: 'x', description: '<p>текст</p>' }
    const { row: out } = await sanitizeIconRow(row, fetcher)
    expect(fetcher).not.toHaveBeenCalled()
    expect(out).toBe(row)
  })
})

describe('sanitizeIconRows', () => {
  it('на пачку записей — один запрос на коллекцию', async () => {
    const fetcher = serverKnows('rocket')
    const rows = [
      { id: 1, seo_text: '<h2 data-icon="fluent-emoji-flat:rocket">a</h2>' },
      { id: 2, seo_text: '<h2 data-icon="fluent-emoji-flat:made-up">b</h2>' },
    ]
    const { rows: out, report } = await sanitizeIconRows(rows, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(out[1].seo_text).toContain('fluent-emoji-flat:sparkles')
    expect(report.unknown).toEqual(['fluent-emoji-flat:made-up'])
  })
})
