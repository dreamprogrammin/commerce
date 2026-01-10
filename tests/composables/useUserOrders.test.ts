import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { UserOrder } from '@/composables/orders/useUserOrders'
import { mockSupabaseClient, mockQueryBuilder, mockChannel, mockRouter } from '../setup'

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
    global.useSupabaseUser = vi.fn(() => ({
      value: { id: 'user-123', email: 'test@example.com' }
    }))
  })

  describe('fetchOrders', () => {
    it('должен загрузить заказы пользователя', async () => {
      const { useUserOrders } = await import("@/composables/orders/useUserOrders")
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
      const { useUserOrders } = await import("@/composables/orders/useUserOrders")
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
      global.useSupabaseUser = vi.fn(() => ({ value: null }))

      const { useUserOrders } = await import("@/composables/orders/useUserOrders")
      const { fetchOrders, orders } = useUserOrders()

      await fetchOrders()

      expect(mockSupabaseClient.from).not.toHaveBeenCalled()
      expect(orders.value).toHaveLength(0)
    })
  })

  describe('subscribeToOrderUpdates', () => {
    it('должен создать подписку на обновления', async () => {
      const { useUserOrders } = await import("@/composables/orders/useUserOrders")
      const { subscribeToOrderUpdates } = useUserOrders()

      const channel = subscribeToOrderUpdates()

      expect(mockSupabaseClient.channel).toHaveBeenCalledWith('user-orders:user-123')
      expect(mockChannel.on).toHaveBeenCalled()
      expect(mockChannel.subscribe).toHaveBeenCalled()
      expect(channel).toBeTruthy()
    })

    it('не должен создавать подписку для неавторизованного пользователя', async () => {
      // ✅ Устанавливаем неавторизованного пользователя
      global.useSupabaseUser = vi.fn(() => ({ value: null }))

      const { useUserOrders } = await import("@/composables/orders/useUserOrders")
      const { subscribeToOrderUpdates } = useUserOrders()

      const channel = subscribeToOrderUpdates()

      expect(channel).toBeNull()
      expect(mockSupabaseClient.channel).not.toHaveBeenCalled()
    })
  })

  describe('getStatusLabel', () => {
    it('должен вернуть правильные метки статусов', async () => {
      
      const { useUserOrders } = await import("@/composables/orders/useUserOrders")
      const { getStatusLabel } = useUserOrders()

      expect(getStatusLabel('pending')).toBe('Ожидает обработки')
      expect(getStatusLabel('new')).toBe('Новый заказ')
      expect(getStatusLabel('processing')).toBe('В обработке')
      expect(getStatusLabel('confirmed')).toBe('Подтверждён')
      expect(getStatusLabel('delivered')).toBe('Доставлен')
      expect(getStatusLabel('shipped')).toBe('Отправлен')
      expect(getStatusLabel('cancelled')).toBe('Отменён')
    })

    it('должен вернуть исходный статус для неизвестного', async () => {
      
      const { useUserOrders } = await import("@/composables/orders/useUserOrders")
      const { getStatusLabel } = useUserOrders()

      expect(getStatusLabel('unknown')).toBe('unknown')
    })
  })

  describe('getStatusColor', () => {
    it('должен вернуть правильные цвета статусов', async () => {
      
      const { useUserOrders } = await import("@/composables/orders/useUserOrders")
      const { getStatusColor } = useUserOrders()

      expect(getStatusColor('pending')).toBe('bg-gray-100 text-gray-800')
      expect(getStatusColor('new')).toBe('bg-blue-100 text-blue-800')
      expect(getStatusColor('processing')).toBe('bg-yellow-100 text-yellow-800')
      expect(getStatusColor('confirmed')).toBe('bg-green-100 text-green-800')
      expect(getStatusColor('delivered')).toBe('bg-purple-100 text-purple-800')
      expect(getStatusColor('shipped')).toBe('bg-indigo-100 text-indigo-800')
      expect(getStatusColor('cancelled')).toBe('bg-red-100 text-red-800')
    })

    it('должен вернуть цвет по умолчанию для неизвестного статуса', async () => {
      
      const { useUserOrders } = await import("@/composables/orders/useUserOrders")
      const { getStatusColor } = useUserOrders()

      expect(getStatusColor('unknown')).toBe('bg-gray-100 text-gray-800')
    })
  })

  describe('activeOrder', () => {
    it('должен вернуть активный заказ (не завершённый)', async () => {
      
      const { useUserOrders } = await import("@/composables/orders/useUserOrders")
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
      
      const { useUserOrders } = await import("@/composables/orders/useUserOrders")
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
      
      const { useUserOrders } = await import("@/composables/orders/useUserOrders")
      const { orders, latestOrder } = useUserOrders()

      orders.value = [
        { ...mockOrder, id: 'order-latest' },
        { ...mockOrder, id: 'order-old' },
      ]

      expect(latestOrder.value?.id).toBe('order-latest')
    })

    it('должен вернуть null если нет заказов', async () => {
      
      const { useUserOrders } = await import("@/composables/orders/useUserOrders")
      const { latestOrder } = useUserOrders()

      expect(latestOrder.value).toBeNull()
    })
  })
})
