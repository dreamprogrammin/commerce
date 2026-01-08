/**
 * Композабл для real-time обновления остатков товаров
 *
 * Подписывается на изменения заказов в Supabase и автоматически
 * инвалидирует кеш товаров при подтверждении заказа
 */
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useProductCacheInvalidation } from './useProductCacheInvalidation'

export function useOrderRealtime() {
  const supabase = useSupabaseClient()
  const { refetchAllProducts } = useProductCacheInvalidation()

  let ordersChannel: RealtimeChannel | null = null
  let guestCheckoutsChannel: RealtimeChannel | null = null
  let lastProcessedOrderId: string | null = null

  /**
   * Подписаться на изменения заказов
   */
  function subscribeToOrders() {
    if (ordersChannel) {
      console.warn('⚠️ Already subscribed to orders channel')
      return
    }

    console.log('🔔 Subscribing to orders realtime updates...')

    ordersChannel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: 'status=eq.confirmed', // Только подтверждённые заказы
        },
        (payload) => {
          const orderId = payload.new.id

          // 🔥 Защита от дублирования: проверяем, не обработали ли уже это событие
          if (lastProcessedOrderId === orderId) {
            console.log('⚠️ Duplicate event ignored:', orderId)
            return
          }

          lastProcessedOrderId = orderId
          console.log('🔔 Order confirmed (realtime):', orderId)

          // 🔥 ПРИНУДИТЕЛЬНО перезагружаем данные (не просто инвалидируем!)
          refetchAllProducts()

          // Показываем уведомление (опционально)
          if (import.meta.client) {
            console.log('✅ Product stocks updated (order confirmed)')
          }

          // Сбрасываем защиту от дублирования через 5 секунд
          setTimeout(() => {
            if (lastProcessedOrderId === orderId) {
              lastProcessedOrderId = null
            }
          }, 5000)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to orders channel')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to orders channel')
        }
      })
  }

  /**
   * Подписаться на изменения гостевых заказов
   */
  function subscribeToGuestCheckouts() {
    if (guestCheckoutsChannel) {
      console.warn('⚠️ Already subscribed to guest checkouts channel')
      return
    }

    console.log('🔔 Subscribing to guest checkouts realtime updates...')

    guestCheckoutsChannel = supabase
      .channel('guest-checkouts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'guest_checkouts',
          filter: 'status=eq.confirmed',
        },
        (payload) => {
          const checkoutId = payload.new.id

          // 🔥 Защита от дублирования
          if (lastProcessedOrderId === checkoutId) {
            console.log('⚠️ Duplicate event ignored:', checkoutId)
            return
          }

          lastProcessedOrderId = checkoutId
          console.log('🔔 Guest checkout confirmed (realtime):', checkoutId)

          // 🔥 ПРИНУДИТЕЛЬНО перезагружаем данные
          refetchAllProducts()

          if (import.meta.client) {
            console.log('✅ Product stocks updated (guest checkout confirmed)')
          }

          // Сбрасываем защиту от дублирования через 5 секунд
          setTimeout(() => {
            if (lastProcessedOrderId === checkoutId) {
              lastProcessedOrderId = null
            }
          }, 5000)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to guest checkouts channel')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to guest checkouts channel')
        }
      })
  }

  /**
   * Подписаться на изменения продуктов (опционально)
   * Для случаев, когда администратор меняет цены/остатки напрямую
   */
  function subscribeToProducts() {
    console.log('🔔 Subscribing to products realtime updates...')

    const productsChannel = supabase
      .channel('products-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'products',
        },
        (payload) => {
          console.log('🔔 Product updated (realtime):', payload.new.id)

          // 🔥 ПРИНУДИТЕЛЬНО перезагружаем данные
          refetchAllProducts()
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to products channel')
        }
      })

    return productsChannel
  }

  /**
   * Отписаться от всех каналов
   */
  function unsubscribe() {
    console.log('🔕 Unsubscribing from realtime channels...')

    if (ordersChannel) {
      supabase.removeChannel(ordersChannel)
      ordersChannel = null
    }

    if (guestCheckoutsChannel) {
      supabase.removeChannel(guestCheckoutsChannel)
      guestCheckoutsChannel = null
    }
  }

  /**
   * Подписаться на все необходимые каналы
   */
  function subscribeAll() {
    subscribeToOrders()
    subscribeToGuestCheckouts()
    // Опционально: подписка на изменения продуктов
    // subscribeToProducts()
  }

  return {
    subscribeToOrders,
    subscribeToGuestCheckouts,
    subscribeToProducts,
    subscribeAll,
    unsubscribe,
  }
}
