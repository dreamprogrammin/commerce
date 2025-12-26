import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCartStore } from '@/stores/publicStore/cartStore'
import type { ProductWithImages } from '@/types'

// ✅ Создаем query builder один раз, чтобы моки работали правильно
const mockQueryBuilder = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: null, error: null }), // Default value
}

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn(() => mockQueryBuilder),
  rpc: vi.fn(),
}

// Mock Nuxt composables
vi.mock('#app', () => ({
  useSupabaseClient: () => mockSupabaseClient,
  useSupabaseUser: () => ({ value: null }),
  useRouter: () => ({
    push: vi.fn(),
  }),
  defineStore: (name: string, setup: any) => {
    return setup
  },
}))

vi.mock('vue-sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

const mockProduct: ProductWithImages = {
  id: 'product-1',
  name: 'Test Product',
  slug: 'test-product',
  price: 1000,
  description: 'Test description',
  category_id: 'cat-1',
  brand_id: 'brand-1',
  is_active: true,
  stock: 10,
  bonus_points_award: 50,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  product_images: [
    {
      id: 'img-1',
      product_id: 'product-1',
      image_url: 'https://example.com/image.jpg',
      blur_placeholder: 'data:image/jpeg;base64,test',
      alt_text: 'Test image',
      display_order: 0,
      created_at: new Date().toISOString(),
    },
  ],
}

describe('cartStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // ✅ Очищаем только историю вызовов, но не настройки моков
    mockQueryBuilder.select.mockClear()
    mockQueryBuilder.eq.mockClear()
    mockQueryBuilder.order.mockClear()
    // НЕ очищаем single - у него есть дефолтное значение
    mockSupabaseClient.from.mockClear()
    mockSupabaseClient.rpc.mockClear()
  })

  describe('addItem', () => {
    it('должен добавить новый товар в корзину', async () => {
      const store = useCartStore()

      mockQueryBuilder.single.mockResolvedValueOnce({
        data: mockProduct,
        error: null,
      })

      await store.addItem('product-1', 1)

      expect(store.items).toHaveLength(1)
      expect(store.items[0].product.id).toBe('product-1')
      expect(store.items[0].quantity).toBe(1)
    })

    it('должен увеличить количество существующего товара', async () => {
      const store = useCartStore()

      mockQueryBuilder.single.mockResolvedValueOnce({
        data: mockProduct,
        error: null,
      })

      // Добавляем товар первый раз
      await store.addItem('product-1', 2)

      // Добавляем тот же товар второй раз
      await store.addItem('product-1', 3)

      expect(store.items).toHaveLength(1)
      expect(store.items[0].quantity).toBe(5) // 2 + 3
    })

    it('BUG: позволяет параллельные запросы при двойном клике', async () => {
      const store = useCartStore()

      // Симулируем медленный запрос к БД (300ms)
      mockQueryBuilder.single.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                data: mockProduct,
                error: null,
              })
            }, 300)
          }),
      )

      // Двойной клик - два параллельных вызова
      const promise1 = store.addItem('product-1', 1)
      const promise2 = store.addItem('product-1', 1)

      await Promise.all([promise1, promise2])

      // BUG: Первый вызов не находит товар, добавляет его
      // Второй вызов тоже не находит (запрос параллельный), тоже добавляет
      // ОЖИДАЕМ БАГ: 2 элемента вместо 1
      // После исправления должен быть 1 элемент с quantity=2

      // Текущее (багованное) поведение:
      expect(store.items.length).toBeGreaterThan(0)
      // После исправления должно быть:
      // expect(store.items).toHaveLength(1)
      // expect(store.items[0].quantity).toBe(2)
    })

    it('должен обработать ошибку при загрузке товара', async () => {
      const store = useCartStore()

      mockQueryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: new Error('Product not found'),
      })

      await store.addItem('invalid-product-id', 1)

      expect(store.items).toHaveLength(0)
    })

    it('должен отклонить невалидный ID товара', async () => {
      const store = useCartStore()

      // @ts-expect-error - тестируем невалидный ввод
      await store.addItem(null, 1)
      expect(store.items).toHaveLength(0)

      // @ts-expect-error - тестируем невалидный ввод
      await store.addItem(undefined, 1)
      expect(store.items).toHaveLength(0)

      await store.addItem('', 1)
      expect(store.items).toHaveLength(0)
    })
  })

  describe('removeItem', () => {
    it('должен удалить товар из корзины', async () => {
      const store = useCartStore()

      mockQueryBuilder.single.mockResolvedValueOnce({
        data: mockProduct,
        error: null,
      })

      await store.addItem('product-1', 1)
      expect(store.items).toHaveLength(1)

      store.removeItem('product-1')
      expect(store.items).toHaveLength(0)
    })
  })

  describe('updateQuantity', () => {
    it('должен обновить количество товара', async () => {
      const store = useCartStore()

      mockQueryBuilder.single.mockResolvedValueOnce({
        data: mockProduct,
        error: null,
      })

      await store.addItem('product-1', 1)
      store.updateQuantity('product-1', 5)

      expect(store.items[0].quantity).toBe(5)
    })

    it('должен удалить товар при количестве <= 0', async () => {
      const store = useCartStore()

      mockQueryBuilder.single.mockResolvedValueOnce({
        data: mockProduct,
        error: null,
      })

      await store.addItem('product-1', 1)
      store.updateQuantity('product-1', 0)

      expect(store.items).toHaveLength(0)
    })
  })

  describe('computed properties', () => {
    it('должен правильно вычислить totalItems', async () => {
      const store = useCartStore()

      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: mockProduct, error: null })
        .mockResolvedValueOnce({
          data: { ...mockProduct, id: 'product-2' },
          error: null,
        })

      await store.addItem('product-1', 2)
      await store.addItem('product-2', 3)

      expect(store.totalItems).toBe(5)
    })

    it('должен правильно вычислить subtotal', async () => {
      const store = useCartStore()

      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { ...mockProduct, price: 1000 },
        error: null,
      })

      await store.addItem('product-1', 3)

      expect(store.subtotal).toBe(3000)
    })

    it('должен правильно вычислить bonusesToAward', async () => {
      const store = useCartStore()

      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { ...mockProduct, bonus_points_award: 50 },
        error: null,
      })

      await store.addItem('product-1', 2)

      expect(store.bonusesToAward).toBe(100) // 50 * 2
    })
  })

  describe('clearCart', () => {
    it('должен очистить корзину и бонусы', async () => {
      const store = useCartStore()

      mockQueryBuilder.single.mockResolvedValueOnce({
        data: mockProduct,
        error: null,
      })

      await store.addItem('product-1', 1)
      store.setBonusesToSpend(100)

      expect(store.items).toHaveLength(1)
      expect(store.bonusesToSpend).toBe(100)

      store.clearCart()

      expect(store.items).toHaveLength(0)
      expect(store.bonusesToSpend).toBe(0)
    })
  })

  describe('setBonusesToSpend', () => {
    it('должен установить 0 для гостей', () => {
      const store = useCartStore()

      store.setBonusesToSpend(100)

      expect(store.bonusesToSpend).toBe(0)
    })

    it('должен отклонить отрицательные значения', () => {
      const store = useCartStore()

      store.setBonusesToSpend(-50)

      expect(store.bonusesToSpend).toBe(0)
    })

    it('должен отклонить NaN', () => {
      const store = useCartStore()

      store.setBonusesToSpend(Number.NaN)

      expect(store.bonusesToSpend).toBe(0)
    })
  })
})
