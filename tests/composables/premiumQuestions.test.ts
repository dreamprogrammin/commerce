import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBrandQuestions } from '@/composables/useBrandQuestions'
import { useCategoryQuestions } from '@/composables/useCategoryQuestions'
import { useProductQuestions } from '@/composables/useProductQuestions'

/*
 * AI-вопросы зовут generate-premium-questions через functions.invoke — с
 * токеном ТЕКУЩЕГО пользователя (20 октября 2026). Раньше был голый fetch с
 * публичным анонимным ключом из разметки сайта: функцию мог позвать кто угодно,
 * а она пишет ответ модели в публичные вопросы-ответы. Теперь функция пускает
 * только администратора, и с анонимным ключом админка получала бы отказ.
 */
const invoke = vi.fn()
const rpc = vi.fn()
const fetchSpy = vi.fn()

beforeEach(() => {
  invoke.mockReset().mockResolvedValue({ data: { questions_count: 3 }, error: null })
  rpc.mockReset()
  fetchSpy.mockReset()
  vi.stubGlobal('useSupabaseClient', () => ({
    rpc,
    functions: { invoke },
    supabaseUrl: 'https://proj.supabase.co',
    supabaseKey: 'anon-key',
  }))
  vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => vi.unstubAllGlobals())

const cases = [
  {
    name: 'товар',
    run: () => useProductQuestions().generateQuestionsForProduct('p1'),
    rpcData: { needs_ai: true, product_id: 'p1', name: 'LEGO Technic', price: 60000 },
    body: { product_id: 'p1', name: 'LEGO Technic', price: 60000 },
  },
  {
    name: 'бренд',
    run: () => useBrandQuestions().generateQuestionsForBrand('b1'),
    rpcData: { needs_ai: true, brand_id: 'b1', name: 'LEGO' },
    body: { entity_type: 'brand', brand_id: 'b1', name: 'LEGO' },
  },
  {
    name: 'категория',
    run: () => useCategoryQuestions().generateQuestionsForCategory('c1'),
    rpcData: { needs_ai: true, category_id: 'c1', name: 'Конструкторы' },
    body: { entity_type: 'category', category_id: 'c1', name: 'Конструкторы' },
  },
]

describe('генерация AI-вопросов — с токеном пользователя, не с анонимным ключом', () => {
  it.each(cases)('$name: functions.invoke, голого fetch нет', async ({ run, rpcData, body }) => {
    rpc.mockResolvedValue({ data: rpcData, error: null })
    expect(await run()).toBe(true)
    expect(invoke).toHaveBeenCalledWith('generate-premium-questions', { body: expect.objectContaining(body) })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('отказ функции не ломает базовые вопросы — они уже созданы', async () => {
    rpc.mockResolvedValue({ data: cases[0].rpcData, error: null })
    invoke.mockResolvedValue({ data: null, error: new Error('Доступно только администратору') })
    expect(await useProductQuestions().generateQuestionsForProduct('p1')).toBe(true)
  })

  it('без needs_ai функцию не зовём', async () => {
    rpc.mockResolvedValue({ data: { needs_ai: false, product_id: 'p1' }, error: null })
    expect(await useProductQuestions().generateQuestionsForProduct('p1')).toBe(true)
    expect(invoke).not.toHaveBeenCalled()
  })
})
