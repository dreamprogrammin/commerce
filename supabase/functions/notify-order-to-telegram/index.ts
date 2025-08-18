import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Стандартные заголовки (без изменений)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// "Контракт" (без изменений)
interface OrderPayload {
  record: { id: string }
}

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

    // ======================================================
    // ===           КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ ЗДЕСЬ           ===
    // ======================================================
    // Мы используем синтаксис `псевдоним:имя_таблицы(...)`, чтобы
    // явно сказать Supabase, что мы ожидаем один объект, а не массив.
    const { data: orderData, error: orderError } = await supabaseAdminClient
      .from('orders')
      .select(`
        id,
        final_amount,
        created_at,
        delivery_method,
        payment_method,
        delivery_address,
        guest_name,
        guest_phone,
        profile:profiles ( first_name, last_name, phone ),  
        order_items (
          quantity,
          product:products ( name ) 
        )
      `)
      .eq('id', orderId)
      .single()

    if (orderError) {
      throw new Error(`Ошибка получения данных заказа: ${orderError.message}`)
    }
    console.log('Данные заказа успешно получены из БД.')

    // ======================================================
    // ===      ИСПРАВЛЕНИЕ ЛОГИКИ РАБОТЫ С ДАННЫМИ        ===
    // ======================================================
    // Теперь `orderData.profile` - это ОДИН объект (или null), а не массив.
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
      // `item.product` теперь тоже ОДИН объект, а не массив.
      const productName = item.product?.name || 'Неизвестный товар'
      messageText += `• ${productName} (${item.quantity} шт.)\n`
    })

    // --- Остальной код остается без изменений ---
    messageText += `\n*Сумма:* ${orderData.final_amount} ₸\n`
    messageText += `*Оплата:* ${orderData.payment_method}\n`
    // ... и так далее до конца функции ...

    // ... (создание клавиатуры и отправка в Telegram)

    return new Response(JSON.stringify({ success: true, message: `Уведомление для заказа ${orderId} отправлено.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  catch (error) {
    console.error('Критическая ошибка в Edge Function:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
