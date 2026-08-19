/**
 * Композабл для real-time обновления остатков товаров
 *
 * Подписывается на изменения заказов в Supabase и автоматически
 * инвалидирует кеш товаров при подтверждении заказа
 */
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useProfileStore } from '@/stores/core/profileStore'
import { useProductCacheInvalidation } from './useProductCacheInvalidation'

// ✅ Глобальные переменные на уровне модуля
// Это гарантирует что подписки сохраняются между вызовами composable
let ordersChannel: RealtimeChannel | null = null
let guestCheckoutsChannel: RealtimeChannel | null = null
let lastProcessedOrderId: string | null = null

export function useOrderRealtime() {
  const supabase = useSupabaseClient()
  const { refetchAllProducts } = useProductCacheInvalidation()
  const config = useRuntimeConfig()

  // 🔥 Отключаем realtime для локальной разработки (избегаем ошибок WebSocket)
  const isLocal = config.public.supabase.url.includes('127.0.0.1')
    || config.public.supabase.url.includes('localhost')

  // 🔥 Проверяем переменную окружения для отключения Realtime
  const isRealtimeDisabled = process.env.NUXT_PUBLIC_DISABLE_REALTIME === 'true'

  /**
   * Подписаться на изменения заказов
   */
  function subscribeToOrders() {
    if (isLocal) {
      console.log('⚠️ Realtime disabled for local development')
      return
    }

    if (isRealtimeDisabled) {
      console.log('⚠️ Realtime disabled via environment variable')
      return
    }

    if (ordersChannel) {
      console.warn('⚠️ Already subscribed to orders channel')
      return
    }

    console.log('🔔 Subscribing to orders realtime updates...')

    ordersChannel = supabase
      .channel('orders-realtime', {
        config: {
          broadcast: { self: false },
          presence: { key: '' },
        },
      })
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
        },
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to orders channel')
        }
        else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to orders channel:', err)
          // Graceful degradation - приложение продолжит работать без realtime
        }
        else if (status === 'TIMED_OUT') {
          console.warn('⚠️ Realtime connection timed out')
        }
        else if (status === 'CLOSED') {
          console.warn('⚠️ Realtime channel closed')
        }
      })
  }

  /**
   * Подписаться на изменения гостевых заказов
   */
  function subscribeToGuestCheckouts() {
    if (isLocal) {
      console.log('⚠️ Realtime disabled for local development')
      return
    }

    if (isRealtimeDisabled) {
      console.log('⚠️ Realtime disabled via environment variable')
      return
    }

    if (guestCheckoutsChannel) {
      console.warn('⚠️ Already subscribed to guest checkouts channel')
      return
    }

    console.log('🔔 Subscribing to guest checkouts realtime updates...')

    guestCheckoutsChannel = supabase
      .channel('guest-checkouts-realtime', {
        config: {
          broadcast: { self: false },
          presence: { key: '' },
        },
      })
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
        },
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to guest checkouts channel')
        }
        else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to guest checkouts channel:', err)
          // Graceful degradation - приложение продолжит работать без realtime
        }
        else if (status === 'TIMED_OUT') {
          console.warn('⚠️ Realtime connection timed out')
        }
        else if (status === 'CLOSED') {
          console.warn('⚠️ Realtime channel closed')
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
        },
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
   * Подписаться на все необходимые каналы.
   *
   * Только администратору. Раньше вызывалось безусловно, и WebSocket с двумя
   * подписками открывался у каждого гостя на каждой странице.
   *
   * Гостю эти каналы не дают ничего: RLS у `orders` и `guest_checkouts` не
   * отдаёт анониму ни одной строки (REST на обе таблицы отвечает пустым
   * массивом), а `postgres_changes` применяет ту же RLS к каждому подписчику.
   * То есть соединение висит, а событие не придёт никогда.
   *
   * Подписка при этом не падала — канал отвечает `status: ok`, в консоли
   * `✅ Subscribed to orders channel`. Так что чинится здесь не ошибка,
   * а бесполезная работа: одно постоянное WSS-соединение на посетителя
   * и подписчик на стороне Supabase.
   */
  function subscribeAll() {
    if (!useProfileStore().isAdmin)
      return

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
