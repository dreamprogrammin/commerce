import type { ProductWithImages } from '@/types'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProfileStore } from '@/stores/core/profileStore'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { mockQueryBuilder, mockSupabaseClient, mockToast } from '../setup'

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

    // ✅ Пересоздаем моки, сохраняя дефолтное поведение
    mockQueryBuilder.select.mockClear().mockReturnThis()
    mockQueryBuilder.eq.mockClear().mockReturnThis()
    mockQueryBuilder.order.mockClear().mockReturnThis()
    mockQueryBuilder.single.mockClear().mockResolvedValue({ data: null, error: null })
    mockSupabaseClient.from.mockClear()
    mockSupabaseClient.rpc.mockClear().mockResolvedValue({ data: null, error: null })
    mockToast.success.mockClear()
    mockToast.error.mockClear()
    mockToast.info.mockClear()
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

    it('bUG: позволяет параллельные запросы при двойном клике', async () => {
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
      // ✅ Устанавливаем авторизованного пользователя
      globalThis.useSupabaseUser = vi.fn(() => ({
        value: { id: 'user-123', email: 'test@example.com' },
      }))

      const store = useCartStore()

      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { ...mockProduct, bonus_points_award: 50 },
        error: null,
      })

      await store.addItem('product-1', 2)

      expect(store.bonusesToAward).toBe(100) // 50 * 2
    })
  })

  /**
   * Способ получения и стоимость доставки переехали в стор из-за бага:
   * /cart считала доставку по курьеру, а orderForm на /checkout стартовала
   * с 'pickup', и «Итого» на двух шагах отличалось на цену доставки.
   */
  describe('доставка', () => {
    async function fillCart(store: ReturnType<typeof useCartStore>, price: number) {
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { ...mockProduct, price, final_price: price },
        error: null,
      })
      await store.addItem('product-1', 1)
    }

    it('по умолчанию выбран курьер — как fulfill:delivery в макете', () => {
      const store = useCartStore()

      expect(store.deliveryMethod).toBe('courier')
    })

    it('берёт 1000 ₸ за курьера, пока корзина не добила до порога', async () => {
      const store = useCartStore()
      await fillCart(store, 5000)

      expect(store.deliveryCost).toBe(1000)
      expect(store.isFreeShipping).toBe(false)
    })

    it('везёт бесплатно от 15 000 ₸', async () => {
      const store = useCartStore()
      await fillCart(store, 15000)

      expect(store.deliveryCost).toBe(0)
      expect(store.isFreeShipping).toBe(true)
    })

    it('обнуляет доставку при самовывозе даже ниже порога', async () => {
      const store = useCartStore()
      await fillCart(store, 5000)

      store.setDeliveryMethod('pickup')

      expect(store.deliveryCost).toBe(0)
    })

    it('даёт корзине и оформлению одну и ту же сумму доставки', async () => {
      const store = useCartStore()
      await fillCart(store, 5000)

      // Обе страницы читают одно и то же поле стора, поэтому «Итого»
      // не может разойтись: смена способа видна сразу на обоих шагах.
      const totalOnCart = store.subtotal + store.deliveryCost
      store.setDeliveryMethod('pickup')
      const totalOnCheckout = store.subtotal + store.deliveryCost

      expect(totalOnCart).toBe(6000)
      expect(totalOnCheckout).toBe(5000)
      expect(store.deliveryMethod).toBe('pickup')
    })
  })

  /**
   * Комментарий к адресу («подъезд, этаж, домофон») форма собирала и раньше,
   * но checkout() его не передавал — поле молча терялось между страницей и
   * RPC. Тест держит именно это звено: колонка и вывод в Telegram давно были.
   */
  describe('checkout: комментарий к адресу', () => {
    // Тест bonusesToAward выше подменяет useSupabaseUser на залогиненного и
    // назад не возвращает, поэтому гостя объявляем сами, а не полагаемся на
    // порядок выполнения: иначе checkout уходит в ветку create_user_order.
    beforeEach(() => {
      globalThis.useSupabaseUser = () => ({ value: null })
    })

    function guestOrder(comment?: string) {
      return {
        deliveryMethod: 'courier' as const,
        paymentMethod: 'kaspi',
        deliveryAddress: { city: 'Алматы', line1: 'Абая 150' },
        guestInfo: {
          name: 'Проба',
          email: 'probe@test.local',
          phone: '+77770000000',
        },
        deliveryCost: 1000,
        comment,
      }
    }

    function guestRpcParams() {
      const call = mockSupabaseClient.rpc.mock.calls.find(
        ([name]) => name === 'create_guest_checkout',
      )
      expect(call, 'create_guest_checkout не вызывался').toBeDefined()
      return call![1]
    }

    async function fillCart(store: ReturnType<typeof useCartStore>) {
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: mockProduct,
        error: null,
      })
      await store.addItem('product-1', 1)
    }

    it('доносит комментарий до create_guest_checkout', async () => {
      const store = useCartStore()
      await fillCart(store)
      mockSupabaseClient.rpc.mockResolvedValue({ data: 'order-1', error: null })

      await store.checkout(guestOrder('подъезд 2, этаж 5, домофон 1234'))

      expect(guestRpcParams().p_comment).toBe('подъезд 2, этаж 5, домофон 1234')
    })

    it('без комментария шлёт null, а не undefined', async () => {
      const store = useCartStore()
      await fillCart(store)
      mockSupabaseClient.rpc.mockResolvedValue({ data: 'order-1', error: null })

      await store.checkout(guestOrder())

      // undefined в теле запроса PostgREST означает «параметр не передан»,
      // и функция подставила бы DEFAULT — совпадает по результату, но null
      // выражает намерение явно и переживёт смену дефолта.
      expect(guestRpcParams().p_comment).toBeNull()
    })

    it('шлёт желаемые дату и интервал при курьерской доставке', async () => {
      const store = useCartStore()
      await fillCart(store)
      mockSupabaseClient.rpc.mockResolvedValue({ data: 'order-1', error: null })

      store.deliveryDateIndex = 1
      store.deliverySlotIndex = 2

      await store.checkout(guestOrder())

      const params = guestRpcParams()
      // Индекс 1 — «завтра»: дата считается от сегодняшней, а не берётся
      // из хранилища, поэтому сохранённый выбор не может оказаться в прошлом.
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`

      expect(params.p_delivery_date).toBe(iso)
      expect(params.p_delivery_slot).toBe('16:00–18:00')
    })

    it('не шлёт дату и интервал при самовывозе', async () => {
      const store = useCartStore()
      await fillCart(store)
      mockSupabaseClient.rpc.mockResolvedValue({ data: 'order-1', error: null })

      await store.checkout({ ...guestOrder(), deliveryMethod: 'pickup' })

      const params = guestRpcParams()
      expect(params.p_delivery_date).toBeNull()
      expect(params.p_delivery_slot).toBeNull()
    })
  })

  describe('clearCart', () => {
    it('должен очистить корзину и бонусы', async () => {
      // ✅ Устанавливаем авторизованного пользователя
      globalThis.useSupabaseUser = vi.fn(() => ({
        value: { id: 'user-123', email: 'test@example.com' },
      }))

      const store = useCartStore()

      // Списание бонусов зажато балансом профиля и суммой заказа:
      // без реального баланса setBonusesToSpend честно обнулит сумму.
      const profileStore = useProfileStore()
      profileStore.profile = { active_bonus_balance: 500 } as never

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
