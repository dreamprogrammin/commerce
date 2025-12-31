import { toast } from 'vue-sonner'

export interface OrderItem {
  id: string
  quantity: number
  product: {
    id: string
    name: string
    price: number
    product_images: Array<{
      image_url: string
      blur_placeholder: string | null
    }>
  }
}

export interface UserOrder {
  id: string
  created_at: string
  status: string
  final_amount: number
  delivery_method: string
  payment_method: string | null
  delivery_address: any
  bonuses_spent: number
  bonuses_awarded: number
  order_items: OrderItem[]
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает обработки',
  new: 'Новый заказ',
  processing: 'В обработке',
  confirmed: 'Подтверждён',
  delivered: 'Доставлен',
  shipped: 'Отправлен',
  cancelled: 'Отменён',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-800',
  new: 'bg-blue-100 text-blue-800',
  processing: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-green-100 text-green-800',
  delivered: 'bg-purple-100 text-purple-800',
  shipped: 'bg-indigo-100 text-indigo-800',
  cancelled: 'bg-red-100 text-red-800',
}

export const useUserOrders = () => {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const router = useRouter()

  const orders = ref<UserOrder[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Загрузка заказов пользователя
  const fetchOrders = async () => {
    if (!user.value) {
      console.log('Пользователь не авторизован')
      return
    }

    isLoading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('orders')
        .select(`
          id,
          created_at,
          status,
          final_amount,
          delivery_method,
          payment_method,
          delivery_address,
          bonuses_spent,
          bonuses_awarded,
          order_items(
            id,
            quantity,
            product:products(
              id,
              name,
              price,
              product_images(
                image_url,
                blur_placeholder
              )
            )
          )
        `)
        .eq('user_id', user.value.id)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      orders.value = data as UserOrder[]
    } catch (err: any) {
      console.error('Ошибка загрузки заказов:', err)
      error.value = err.message
    } finally {
      isLoading.value = false
    }
  }

  // Подписка на real-time обновления заказов
  const subscribeToOrderUpdates = () => {
    if (!user.value) {
      console.warn('⚠️ Нет пользователя для подписки на заказы')
      return null
    }

    console.log('🔔 Подписываемся на обновления заказов для пользователя:', user.value.id)

    const channel = supabase
      .channel(`user-orders:${user.value.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `user_id=eq.${user.value.id}`,
        },
        (payload) => {
          console.log('📦 Получено realtime событие обновления заказа:', payload)
          console.log('📦 Старый статус:', payload.old.status)
          console.log('📦 Новый статус:', payload.new.status)

          const updatedOrder = payload.new as UserOrder
          const oldOrder = payload.old as UserOrder

          // Обновляем заказ в списке
          const index = orders.value.findIndex((o) => o.id === updatedOrder.id)
          console.log('📦 Индекс заказа в списке:', index)

          if (index !== -1) {
            // Сохраняем детали заказа (order_items) из старых данных
            const orderDetails = orders.value[index]
            orders.value[index] = {
              ...updatedOrder,
              order_items: orderDetails.order_items,
            }

            console.log('✅ Заказ обновлен в списке:', orders.value[index])

            // Показываем toast только если изменился статус
            if (oldOrder.status !== updatedOrder.status) {
              console.log('📢 Показываем toast уведомление')
              showStatusChangeToast(updatedOrder)
            }
          } else {
            // Новый заказ - перезагружаем список
            console.log('🔄 Заказ не найден в списке, перезагружаем')
            fetchOrders()
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Успешно подписались на обновления заказов')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Ошибка канала realtime:', err)
        } else if (status === 'TIMED_OUT') {
          console.error('⏱️ Timeout при подписке на realtime')
        } else {
          console.log('📡 Статус канала realtime:', status)
        }
      })

    return channel
  }

  // Toast уведомление при изменении статуса
  const showStatusChangeToast = (order: UserOrder) => {
    const statusLabel = STATUS_LABELS[order.status] || order.status
    const orderNumber = order.id.slice(-6)

    toast(`Статус заказа №${orderNumber} изменён`, {
      description: `Новый статус: ${statusLabel}`,
      action: {
        label: 'Посмотреть',
        onClick: () => {
          router.push(`/profile/order/${order.id}`)
        },
      },
      duration: 10000,
    })
  }

  // Получить цвет статуса
  const getStatusColor = (status: string) => {
    return STATUS_COLORS[status] || 'bg-gray-100 text-gray-800'
  }

  // Получить текст статуса
  const getStatusLabel = (status: string) => {
    return STATUS_LABELS[status] || status
  }

  // Получить текущий активный заказ (последний не завершённый)
  const activeOrder = computed(() => {
    return orders.value.find(
      (order) =>
        order.status !== 'delivered' &&
        order.status !== 'cancelled' &&
        order.status !== 'completed'
    )
  })

  // Получить последний заказ
  const latestOrder = computed(() => {
    return orders.value[0] || null
  })

  return {
    orders,
    isLoading,
    error,
    activeOrder,
    latestOrder,
    fetchOrders,
    subscribeToOrderUpdates,
    getStatusColor,
    getStatusLabel,
  }
}
