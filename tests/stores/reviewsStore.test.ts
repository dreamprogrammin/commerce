import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useReviewsStore } from '@/stores/publicStore/reviewsStore'
import { mockSupabaseClient } from '../setup'

const mockAuthStore = {
  isLoggedIn: false,
  user: null as { id: string } | null,
}

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => mockAuthStore,
}))

function rpcRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'review-1',
    product_id: 'product-1',
    user_id: 'user-1',
    order_id: null,
    rating: 5,
    text: 'Отличная игрушка',
    is_published: true,
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-01T10:00:00Z',
    profiles: { first_name: 'Айгуль', last_name: 'Смирнова', avatar_url: null },
    review_images: [],
    ...overrides,
  }
}

describe('reviewsStore.fetchReviews', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // mockReset, а не mockClear: последний оставляет очередь
    // mockResolvedValueOnce, и непотреблённое значение утекает в соседний тест.
    mockSupabaseClient.rpc.mockReset().mockResolvedValue({ data: [], error: null })
    mockSupabaseClient.from.mockReset()
    mockAuthStore.isLoggedIn = false
    mockAuthStore.user = null
  })

  /*
   * Главный смысл теста. Публичный список отзывов читался напрямую из
   * product_reviews с вложением profiles!product_reviews_profile_id_fkey.
   * У profiles нет политики чтения для анонимов, поэтому вложение у гостя
   * всегда приходило пустым и под каждым отзывом стояло «Покупатель».
   * Открывать таблицу политикой нельзя: в строке лежат телефон и бонусный
   * баланс, а RLS открывает строку целиком. Возврат к .from() здесь — это
   * возврат бага, поэтому проверяем не только результат, но и способ.
   */
  it('читает отзывы через RPC, а не напрямую из таблицы', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: [rpcRow()], error: null })

    const store = useReviewsStore()
    await store.fetchReviews('product-1')

    expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_product_reviews', {
      p_product_id: 'product-1',
    })
    expect(mockSupabaseClient.from).not.toHaveBeenCalled()
  })

  it('имя автора доходит до компонента', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: [rpcRow()], error: null })

    const store = useReviewsStore()
    const reviews = await store.fetchReviews('product-1')

    expect(reviews[0].profiles).toEqual({
      first_name: 'Айгуль',
      last_name: 'Смирнова',
      avatar_url: null,
    })
  })

  /*
   * Функция отдаёт profiles = NULL, если профиля нет (удалённый пользователь),
   * и пустой массив вместо null для фото. ReviewCard рассчитывает ровно на это:
   * при null подставляет «Покупатель», а фото перебирает без проверки на null.
   */
  it('переживает отзыв без профиля и без фото', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({
      data: [rpcRow({ profiles: null, review_images: [] })],
      error: null,
    })

    const store = useReviewsStore()
    const reviews = await store.fetchReviews('product-1')

    expect(reviews[0].profiles).toBeNull()
    expect(reviews[0].review_images).toEqual([])
  })

  it('пустой ответ — пустой список, а не null', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: null, error: null })

    const store = useReviewsStore()
    const reviews = await store.fetchReviews('product-1')

    expect(reviews).toEqual([])
    expect(store.reviews).toEqual([])
  })

  it('ошибку пробрасывает наверх, чтобы её увидел useQuery', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    })

    const store = useReviewsStore()
    await expect(store.fetchReviews('product-1')).rejects.toMatchObject({
      message: 'boom',
    })
  })
})
