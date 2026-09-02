import type { UserOrder } from '@/composables/orders/useUserOrders'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockChannel, mockQueryBuilder, mockRouter, mockSupabaseClient } from '../setup'

const mockOrder: UserOrder = {
  id: 'order-123',
  created_at: '2025-12-29T10:00:00Z',
  status: 'new',
  final_amount: 5000,
  delivery_method: 'delivery',
  payment_method: 'cash',
  delivery_address: { city: 'Алматы', street: 'Абая', building: '10' },
  bonuses_spent: 0,
  bonuses_awarded: 50,
  order_items: [
    {
      id: 'item-1',
      quantity: 2,
      product: {
        id: 'prod-1',
        name: 'Тестовый товар',
        price: 2500,
        product_images: [
          {
            image_url: 'https://example.com/image.jpg',
            blur_placeholder: 'data:image/jpeg;base64,test',
          },
        ],
      },
    },
  ],
}

describe('useUserOrders', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())

    // ✅ Очищаем и пересоздаем моки с дефолтным поведением
    mockQueryBuilder.select.mockClear().mockReturnThis()
    mockQueryBuilder.eq.mockClear().mockReturnThis()
    mockQueryBuilder.order.mockClear().mockResolvedValue({ data: [], error: null })
    mockQueryBuilder.single.mockClear().mockResolvedValue({ data: null, error: null })

    mockSupabaseClient.from.mockClear()
    mockSupabaseClient.channel.mockClear()
    mockSupabaseClient.rpc.mockClear()

    mockChannel.on.mockClear()
    mockChannel.subscribe.mockClear()
    mockChannel.unsubscribe.mockClear()

    mockRouter.push.mockClear()

    // ✅ Устанавливаем пользователя по умолчанию
    globalThis.useSupabaseUser = vi.fn(() => ({
      value: { id: 'user-123', email: 'test@example.com' },
    }))
  })

  describe('fetchOrders', () => {
    it('должен загрузить заказы пользователя', async () => {
      const { useUserOrders } = await import('@/composables/orders/useUserOrders')
      const { fetchOrders, orders, isLoading } = useUserOrders()

      mockQueryBuilder.select.mockReturnThis()
      mockQueryBuilder.eq.mockReturnThis()
      mockQueryBuilder.order.mockResolvedValueOnce({
        data: [mockOrder],
        error: null,
      })

      await fetchOrders()

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('orders')
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('user_id', 'user-123')
      expect(mockQueryBuilder.order).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(orders.value).toHaveLength(1)
      expect(orders.value[0].id).toBe('order-123')
      expect(isLoading.value).toBe(false)
    })

    it('должен обработать ошибку при загрузке', async () => {
      const { useUserOrders } = await import('@/composables/orders/useUserOrders')
      const { fetchOrders, error, isLoading } = useUserOrders()

      mockQueryBuilder.order.mockResolvedValueOnce({
        data: null,
        error: new Error('Database error'),
      })

      await fetchOrders()

      expect(error.value).toBeTruthy()
      expect(isLoading.value).toBe(false)
    })

    it('не должен загружать для неавторизованного пользователя', async () => {
      // ✅ Устанавливаем неавторизованного пользователя
      globalThis.useSupabaseUser = vi.fn(() => ({ value: null }))

      const { useUserOrders } = await import('@/composables/orders/useUserOrders')
      const { fetchOrders, orders } = useUserOrders()

      await fetchOrders()

      expect(mockSupabaseClient.from).not.toHaveBeenCalled()
      expect(orders.value).toHaveLength(0)
    })
  })

  describe('subscribeToOrderUpdates', () => {
    it('должен создать подписку на обновления', async () => {
      const { useUserOrders } = await import('@/composables/orders/useUserOrders')
      const { subscribeToOrderUpdates } = useUserOrders()

      const channel = subscribeToOrderUpdates()

      expect(mockSupabaseClient.channel).toHaveBeenCalledWith('user-orders:user-123')
      expect(mockChannel.on).toHaveBeenCalled()
      expect(mockChannel.subscribe).toHaveBeenCalled()
      expect(channel).toBeTruthy()
    })

    it('не должен создавать подписку для неавторизованного пользователя', async () => {
      // ✅ Устанавливаем неавторизованного пользователя
      globalThis.useSupabaseUser = vi.fn(() => ({ value: null }))

      const { useUserOrders } = await import('@/composables/orders/useUserOrders')
      const { subscribeToOrderUpdates } = useUserOrders()

      const channel = subscribeToOrderUpdates()

      expect(channel).toBeNull()
      expect(mockSupabaseClient.channel).not.toHaveBeenCalled()
    })
  })

  describe('getStatusLabel', () => {
    it('должен вернуть правильные метки статусов', async () => {
      const { useUserOrders } = await import('@/composables/orders/useUserOrders')
      const { getStatusLabel } = useUserOrders()

      // Подписи берутся из общей таблицы utils/orderStatus.ts — раньше здесь
      // был второй, разошедшийся с ней список.
      expect(getStatusLabel('pending')).toBe('В обработке')
      expect(getStatusLabel('new')).toBe('В обработке')
      expect(getStatusLabel('processing')).toBe('В обработке')
      expect(getStatusLabel('confirmed')).toBe('Подтверждён')
      expect(getStatusLabel('delivered')).toBe('Выполнен')
      expect(getStatusLabel('shipped')).toBe('Доставляется')
      expect(getStatusLabel('cancelled')).toBe('Отменён')
    })

    /*
     * `completed` — самый частый статус на проде (11 заказов из 43 на
     * 2 сентября 2026), и в прежнем списке его просто не было: фолбэк отдавал
     * сам ключ, и покупатель видел в кабинете английское «completed».
     */
    it('completed переведён, а не показан ключом', async () => {
      const { useUserOrders } = await import('@/composables/orders/useUserOrders')
      const { getStatusLabel } = useUserOrders()

      expect(getStatusLabel('completed')).toBe('Выполнен')
      expect(getStatusLabel('completed')).not.toBe('completed')
    })

    it('неизвестный статус не показывает ключ покупателю', async () => {
      const { useUserOrders } = await import('@/composables/orders/useUserOrders')
      const { getStatusLabel } = useUserOrders()

      expect(getStatusLabel('unknown')).toBe('В обработке')
    })
  })

  describe('getStatusColor', () => {
    it('должен вернуть правильные цвета статусов', async () => {
      const { useUserOrders } = await import('@/composables/orders/useUserOrders')
      const { getStatusColor } = useUserOrders()

      // Цвет идёт по тону из общей таблицы: обработка, доставка, выполнен,
      // отменён — четыре тона, а не семь несогласованных наборов классов.
      expect(getStatusColor('pending')).toBe('bg-blue-100 text-blue-800')
      expect(getStatusColor('new')).toBe('bg-blue-100 text-blue-800')
      expect(getStatusColor('processing')).toBe('bg-blue-100 text-blue-800')
      expect(getStatusColor('confirmed')).toBe('bg-blue-100 text-blue-800')
      expect(getStatusColor('delivered')).toBe('bg-green-100 text-green-800')
      expect(getStatusColor('completed')).toBe('bg-green-100 text-green-800')
      expect(getStatusColor('shipped')).toBe('bg-indigo-100 text-indigo-800')
      expect(getStatusColor('cancelled')).toBe('bg-red-100 text-red-800')
    })

    it('неизвестный статус получает тон обработки', async () => {
      const { useUserOrders } = await import('@/composables/orders/useUserOrders')
      const { getStatusColor } = useUserOrders()

      expect(getStatusColor('unknown')).toBe('bg-blue-100 text-blue-800')
    })
  })

  describe('activeOrder', () => {
    it('должен вернуть активный заказ (не завершённый)', async () => {
      const { useUserOrders } = await import('@/composables/orders/useUserOrders')
      const { orders, activeOrder } = useUserOrders()

      orders.value = [
        { ...mockOrder, status: 'delivered' },
        { ...mockOrder, id: 'order-456', status: 'processing' },
        { ...mockOrder, id: 'order-789', status: 'cancelled' },
      ]

      expect(activeOrder.value?.id).toBe('order-456')
      expect(activeOrder.value?.status).toBe('processing')
    })

    it('должен вернуть undefined если нет активных заказов', async () => {
      const { useUserOrders } = await import('@/composables/orders/useUserOrders')
      const { orders, activeOrder } = useUserOrders()

      orders.value = [
        { ...mockOrder, status: 'delivered' },
        { ...mockOrder, id: 'order-456', status: 'cancelled' },
      ]

      expect(activeOrder.value).toBeUndefined()
    })
  })

  describe('latestOrder', () => {
    it('должен вернуть последний заказ', async () => {
      const { useUserOrders } = await import('@/composables/orders/useUserOrders')
      const { orders, latestOrder } = useUserOrders()

      orders.value = [
        { ...mockOrder, id: 'order-latest' },
        { ...mockOrder, id: 'order-old' },
      ]

      expect(latestOrder.value?.id).toBe('order-latest')
    })

    it('должен вернуть null если нет заказов', async () => {
      const { useUserOrders } = await import('@/composables/orders/useUserOrders')
      const { latestOrder } = useUserOrders()

      expect(latestOrder.value).toBeNull()
    })
  })
})
