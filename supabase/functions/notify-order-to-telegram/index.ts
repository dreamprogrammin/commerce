import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Стандартные заголовки для CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// "Контракт" для данных от триггера
interface OrderPayload {
  record: { id: string }
}

// --- Явные интерфейсы для структуры данных, которую мы ожидаем от Supabase ---
interface OrderItem {
  quantity: number
  product: { name: string | null } | null
}
interface OrderProfile {
  first_name: string | null
  last_name: string | null
  phone: string | null
}
interface OrderData {
  id: string
  final_amount: number
  created_at: string
  delivery_method: string
  payment_method: string | null
  delivery_address: { city: string, line1: string } | null // Уточнили тип адреса
  guest_name: string | null
  guest_phone: string | null
  profile: OrderProfile | null
  order_items: OrderItem[]
}
// -------------------------------------------------------------------------

console.log('Функция notify-order-to-telegram инициализирована.')

// Основная функция
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload: OrderPayload = await req.json()
    const orderId = payload.record.id
    console.log(`Получен новый заказ для обработки: ${orderId}`)

    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data, error: orderError } = await supabaseAdminClient
      .from('orders')
      .select(`
        id, final_amount, created_at, delivery_method, payment_method,
        delivery_address, guest_name, guest_phone,
        profile:profiles(first_name, last_name, phone),
        order_items(quantity, product:products(name))
      `)
      .eq('id', orderId)
      .single()

    if (orderError) {
      throw new Error(`Ошибка получения данных заказа: ${orderError.message}`)
    }

    // Используем "двойное приведение типа" для максимальной надежности
    const orderData = data as unknown as OrderData

    if (!orderData) {
      throw new Error(`Заказ с ID ${orderId} не найден в базе данных.`)
    }
    console.log('Данные заказа успешно получены из БД.')

    const customerName = orderData.profile?.first_name
      ? `${orderData.profile.first_name} ${orderData.profile.last_name || ''}`.trim()
      : orderData.guest_name
    const customerPhone = orderData.profile?.phone || orderData.guest_phone
    const orderDate = new Date(orderData.created_at).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })

    let messageText = `🔔 *Новый заказ №...${orderData.id.slice(-6)}*\n\n`
    messageText += `*Дата:* ${orderDate}\n`
    messageText += `*Клиент:* ${customerName || 'Не указано'}\n`
    messageText += `*Телефон:* \`${customerPhone || 'Не указан'}\`\n\n`

    messageText += `*Состав заказа:*\n`
    orderData.order_items.forEach((item) => {
      const productName = item.product?.name || 'Неизвестный товар'
      messageText += `• ${productName} (${item.quantity} шт.)\n`
    })

    // --- ДОПИСАННЫЙ КОД НАЧИНАЕТСЯ ЗДЕСЬ ---

    messageText += `\n*Сумма:* ${orderData.final_amount} ₸\n`
    messageText += `*Оплата:* ${orderData.payment_method || 'Не указано'}\n`
    messageText += `*Доставка:* ${orderData.delivery_method === 'courier' ? 'Курьер' : 'Самовывоз'}\n`

    // Добавляем адрес, если это доставка курьером
    if (orderData.delivery_method === 'courier' && orderData.delivery_address) {
      messageText += `*Адрес:* ${orderData.delivery_address.city}, ${orderData.delivery_address.line1}\n`
    }

    // Получаем переменные для отправки
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')

    if (!botToken || !chatId || !supabaseUrl) {
      throw new Error('Необходимые переменные окружения (секреты) не установлены.')
    }

    // Формируем URL'ы для кнопок
    const confirmUrl = `${supabaseUrl}/functions/v1/confirm-order?order_id=${orderId}`
    const cancelUrl = `${supabaseUrl}/functions/v1/cancel-order?order_id=${orderId}`

    const inlineKeyboard = {
      inline_keyboard: [
        [{ text: '✅ Подтвердить', url: confirmUrl }, { text: '❌ Отменить', url: cancelUrl }],
      ],
    }

    // Отправляем финальное сообщение в Telegram API
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: messageText, // Используем нашу собранную переменную
          parse_mode: 'Markdown',
          reply_markup: inlineKeyboard,
        }),
      },
    )

    if (!response.ok) {
      const errorBody = await response.json()
      throw new Error(`Ошибка Telegram API: ${errorBody.description}`)
    }

    console.log('Сообщение успешно отправлено в Telegram.')

    return new Response(JSON.stringify({ success: true, message: `Уведомление для заказа ${orderId} отправлено.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  catch (error) {
    let errorMessage = 'Произошла неизвестная ошибка.'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    else if (typeof error === 'string') {
      errorMessage = error
    }

    console.error('Критическая ошибка в Edge Function:', errorMessage)

    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
