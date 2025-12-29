import { toast } from 'vue-sonner'

export interface GuestOrderItem {
  id: string
  quantity: number
  product_id: string
  product_name: string
  product_price: number
  product_image_url: string | null
}

export interface GuestOrder {
  id: string
  created_at: string
  status: string
  final_amount: number
  guest_name: string
  guest_email: string
  guest_phone: string
  delivery_method: string
  payment_method: string | null
  delivery_address: any
  telegram_message_id: string | null
  items: GuestOrderItem[]
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

export const useGuestOrder = () => {
  const supabase = useSupabaseClient()
  const router = useRouter()

  const order = ref<GuestOrder | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Поиск заказа по ID и email
  const trackOrder = async (orderId: string, email: string) => {
    if (!orderId || !email) {
      error.value = 'Необходимо указать номер заказа и email'
      return
    }

    isLoading.value = true
    error.value = null

    try {
      // Ищем заказ по ID и email
      const { data, error: fetchError } = await supabase
        .from('guest_checkouts')
        .select(`
          id,
          created_at,
          status,
          final_amount,
          guest_name,
          guest_email,
          guest_phone,
          delivery_method,
          payment_method,
          delivery_address,
          telegram_message_id,
          guest_checkout_items (
            id,
            quantity,
            product_id,
            product_name,
            product_price,
            product_image_url
          )
        `)
        .eq('id', orderId)
        .eq('guest_email', email.toLowerCase().trim())
        .single()

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          error.value = 'Заказ не найден. Проверьте номер заказа и email.'
        } else {
          throw fetchError
        }
        return
      }

      // Преобразуем данные
      order.value = {
        ...data,
        items: data.guest_checkout_items || [],
      } as any

      // Сохраняем в localStorage для последующего отслеживания
      localStorage.setItem('tracked_guest_order', JSON.stringify({
        orderId,
        email,
        timestamp: Date.now(),
      }))

      toast.success('Заказ найден!', {
        description: `Заказ №${orderId.slice(-6)} от ${data.guest_name}`,
      })
    } catch (err: any) {
      console.error('Ошибка при поиске заказа:', err)
      error.value = err.message || 'Не удалось найти заказ'
      toast.error('Ошибка', {
        description: 'Не удалось найти заказ',
      })
    } finally {
      isLoading.value = false
    }
  }

  // Подписка на обновления заказа
  const subscribeToOrderUpdates = (orderId: string) => {
    if (!orderId) return null

    const channel = supabase
      .channel(`guest-order:${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'guest_checkouts',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          console.log('📦 Обновление гостевого заказа:', payload)

          const updatedOrder = payload.new as any
          const oldOrder = payload.old as any

          if (order.value && order.value.id === updatedOrder.id) {
            // Обновляем статус, сохраняя items
            order.value = {
              ...order.value,
              ...updatedOrder,
            }

            // Показываем toast при изменении статуса
            if (oldOrder.status !== updatedOrder.status) {
              showStatusChangeToast(updatedOrder)
            }
          }
        },
      )
      .subscribe()

    return channel
  }

  // Toast уведомление при изменении статуса
  const showStatusChangeToast = (orderData: any) => {
    const statusLabel = STATUS_LABELS[orderData.status] || orderData.status
    const orderNumber = orderData.id.slice(-6)

    toast(`Статус заказа №${orderNumber} изменён`, {
      description: `Новый статус: ${statusLabel}`,
      duration: 10000,
    })
  }

  // Загрузить последний отслеживаемый заказ из localStorage
  const loadTrackedOrder = async () => {
    const stored = localStorage.getItem('tracked_guest_order')
    if (!stored) return

    try {
      const { orderId, email, timestamp } = JSON.parse(stored)

      // Если данные старше 7 дней - удаляем
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      if (timestamp < sevenDaysAgo) {
        localStorage.removeItem('tracked_guest_order')
        return
      }

      await trackOrder(orderId, email)
    } catch (err) {
      console.error('Ошибка загрузки отслеживаемого заказа:', err)
      localStorage.removeItem('tracked_guest_order')
    }
  }

  // Очистить отслеживаемый заказ
  const clearTrackedOrder = () => {
    order.value = null
    error.value = null
    localStorage.removeItem('tracked_guest_order')
  }

  // Получить цвет статуса
  const getStatusColor = (status: string) => {
    return STATUS_COLORS[status] || 'bg-gray-100 text-gray-800'
  }

  // Получить текст статуса
  const getStatusLabel = (status: string) => {
    return STATUS_LABELS[status] || status
  }

  return {
    order,
    isLoading,
    error,
    trackOrder,
    subscribeToOrderUpdates,
    loadTrackedOrder,
    clearTrackedOrder,
    getStatusColor,
    getStatusLabel,
  }
}
