import { corsHeaders } from '../_shared/cors.ts'
import { createAdminClient } from '../_shared/supabase-client.ts'
import { successResponse, errorResponse } from '../_shared/response-helpers.ts'
import { getTelegramConfig, sendTelegramMessage } from '../_shared/telegram.ts'
import { formatOrderMessage } from '../_shared/order-formatter.ts'
import type { OrderPayload, OrderData } from '../_shared/types.ts'

console.log('✅ Функция notify-order-to-telegram инициализирована')

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Получаем payload от триггера
    const payload: OrderPayload = await req.json()
    const orderId = payload.record.id
    console.log(`📦 Обработка заказа: ${orderId}`)

    // 2. Создаем клиент и получаем данные заказа
    const supabase = createAdminClient()
    const { data, error: orderError } = await supabase
      .from('orders')
      .select(`
        id, final_amount, created_at, delivery_method, payment_method,
        delivery_address, guest_name, guest_phone, guest_email,
        profile:profiles(first_name, last_name, phone),
        order_items(quantity, product:products(name))
      `)
      .eq('id', orderId)
      .single()

    if (orderError) {
      throw new Error(`Ошибка получения заказа: ${orderError.message}`)
    }

    if (!data) {
      throw new Error(`Заказ ${orderId} не найден`)
    }

    const orderData = data as unknown as OrderData

    // 3. Получаем конфигурацию Telegram
    const telegramConfig = getTelegramConfig()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    if (!supabaseUrl) {
      throw new Error('Отсутствует SUPABASE_URL')
    }

    // 4. Формируем сообщение
    const confirmUrl = `${supabaseUrl}/functions/v1/confirm-order?order_id=${orderId}`
    const cancelUrl = `${supabaseUrl}/functions/v1/cancel-order?order_id=${orderId}`
    const { text, replyMarkup } = formatOrderMessage(orderData, confirmUrl, cancelUrl)

    // 5. Отправляем в Telegram
    await sendTelegramMessage(telegramConfig, text, replyMarkup)
    console.log(`✅ Уведомление для заказа ${orderId} отправлено`)

    return successResponse(`Уведомление для заказа ${orderId} отправлено`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка'
    console.error('❌ Ошибка:', errorMessage)
    return errorResponse(errorMessage)
  }
})