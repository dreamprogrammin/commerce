import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface OrderPayload {
  record: { id: string }
}

interface OrderItem {
  quantity: number
  product: { name: string | null; price: number | null } | null
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
  delivery_address: { city: string, line1: string } | null
  guest_name: string | null
  guest_phone: string | null
  guest_email: string | null
  user_id: string | null
  status: string
  bonuses_awarded: number
  bonuses_spent: number
  profile: OrderProfile | null
  order_items: OrderItem[]
}

console.log('✅ Функция notify-order-to-telegram инициализирована')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🔍 === НАЧАЛО ОБРАБОТКИ ЗАКАЗА ===')
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID')

    if (!botToken || !chatId) {
      throw new Error('Отсутствуют TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID')
    }

    // Проверяем источник запроса
    const userAgent = req.headers.get('user-agent') || ''
    const isFromTrigger = userAgent.toLowerCase().includes('pg_net')
    
    console.log(`📨 User-Agent: "${userAgent}"`)
    console.log(`🔍 Запрос от триггера БД: ${isFromTrigger}`)

    // Функция принимает запросы ТОЛЬКО от триггера БД
    if (!isFromTrigger) {
      console.error('❌ Запрос не от триггера БД')
      return new Response(
        JSON.stringify({ error: 'Forbidden - only database triggers allowed' }), 
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      )
    }

    console.log('✅ Запрос от триггера базы данных')

    const payload: OrderPayload = await req.json()
    const orderId = payload.record.id
    console.log(`📦 Обработка заказа: ${orderId}`)

    // Создаем admin-клиент для полного доступа
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Получаем полные данные заказа
    const { data, error: orderError } = await supabaseAdmin
      .from('orders')
      .select(`
        id, final_amount, created_at, delivery_method, payment_method,
        delivery_address, guest_name, guest_phone, guest_email, user_id,
        status, bonuses_awarded, bonuses_spent,
        profile:profiles(first_name, last_name, phone),
        order_items(quantity, product:products(name, price))
      `)
      .eq('id', orderId)
      .single()

    if (orderError) {
      console.error('❌ Ошибка получения заказа:', orderError)
      throw new Error(`Ошибка получения заказа: ${orderError.message}`)
    }

    if (!data) {
      throw new Error(`Заказ ${orderId} не найден`)
    }

    const orderData = data as unknown as OrderData
    console.log(`✅ Заказ получен. User ID: ${orderData.user_id || 'гость'}`)
    console.log(`   Статус: ${orderData.status}`)
    console.log(`   Бонусов к начислению: ${orderData.bonuses_awarded}`)
    console.log(`   Бонусов потрачено: ${orderData.bonuses_spent}`)

    // ========================================
    // 📱 ОТПРАВКА УВЕДОМЛЕНИЯ В TELEGRAM
    // ========================================
    console.log('📱 Формирование уведомления для Telegram...')

    const customerName = orderData.profile?.first_name
      ? `${orderData.profile.first_name} ${orderData.profile.last_name || ''}`.trim()
      : orderData.guest_name || 'Не указано'
    
    const customerPhone = orderData.profile?.phone || orderData.guest_phone || 'Не указан'
    const customerType = orderData.user_id ? '👤 Зарегистрированный' : '👥 Гость'
    
    const orderDate = new Date(orderData.created_at).toLocaleString('ru-RU', { 
      timeZone: 'Asia/Almaty' 
    })

    let messageText = `🔔 *Новый заказ №${orderId.slice(-6)}*\n\n`
    messageText += `*Дата:* ${orderDate}\n`
    messageText += `*Тип:* ${customerType}\n`
    messageText += `*Клиент:* ${customerName}\n`
    messageText += `*Телефон:* \`${customerPhone}\`\n\n`

    messageText += `*Состав заказа:*\n`
    orderData.order_items.forEach((item) => {
      const productName = item.product?.name || 'Неизвестный товар'
      messageText += `• ${productName} × ${item.quantity} шт.\n`
    })

    messageText += `\n*Сумма:* ${orderData.final_amount} ₸\n`
    
    // Показываем информацию о бонусах
    if (orderData.user_id) {
      if (orderData.bonuses_spent > 0) {
        messageText += `💳 *Списано бонусов:* ${orderData.bonuses_spent}\n`
      }
      messageText += `🎁 *Будет начислено бонусов:* ${orderData.bonuses_awarded}\n`
    }
    
    messageText += `*Оплата:* ${orderData.payment_method || 'Не указано'}\n`
    messageText += `*Доставка:* ${orderData.delivery_method === 'courier' ? 'Курьер' : 'Самовывоз'}\n`

    if (orderData.delivery_method === 'courier' && orderData.delivery_address) {
      messageText += `*Адрес:* ${orderData.delivery_address.city}, ${orderData.delivery_address.line1}\n`
    }

    messageText += `\n_Статус: ${orderData.status}_`

    // Кнопки управления заказом с секретным токеном
    const adminSecret = Deno.env.get('ADMIN_SECRET')
    const secretParam = adminSecret ? `&secret=${adminSecret}` : ''
    
    const confirmUrl = `${supabaseUrl}/functions/v1/confirm-order?order_id=${orderId}${secretParam}`
    const cancelUrl = `${supabaseUrl}/functions/v1/cancel-order?order_id=${orderId}${secretParam}`

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: '✅ Подтвердить', url: confirmUrl }, 
          { text: '❌ Отменить', url: cancelUrl }
        ],
      ],
    }

    console.log('📤 Отправка в Telegram...')

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: messageText,
          parse_mode: 'Markdown',
          reply_markup: inlineKeyboard,
        }),
      },
    )

    if (!telegramResponse.ok) {
      const errorBody = await telegramResponse.json()
      console.error('❌ Ошибка Telegram API:', errorBody)
      throw new Error(`Ошибка Telegram API: ${errorBody.description}`)
    }

    console.log('✅ Уведомление отправлено в Telegram')
    console.log('🎉 Обработка заказа завершена успешно')

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Уведомление отправлено в Telegram',
        orderId,
        customerType: orderData.user_id ? 'registered' : 'guest',
        bonusesAwarded: orderData.bonuses_awarded,
        bonusesSpent: orderData.bonuses_spent
      }), 
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка'
    console.error('❌ Критическая ошибка:', errorMessage)
    console.error('Stack:', error instanceof Error ? error.stack : 'N/A')

    return new Response(
      JSON.stringify({ 
        error: 'Internal Server Error',
        message: errorMessage,
        timestamp: new Date().toISOString()
      }), 
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})