// Файл: supabase/functions/notify-order-to-telegram/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface OrderPayload {
  record: { id: string; }
}

console.log("Функция notify-order-to-telegram инициализирована.")

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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: orderData, error: orderError } = await supabaseAdminClient
      .from('orders')
      .select(`
        id, final_amount, created_at, delivery_method, payment_method,
        delivery_address, guest_name, guest_phone,
        profiles ( first_name, last_name, phone ),
        order_items ( quantity, products ( name ) )
      `)
      .eq('id', orderId)
      .single()

    if (orderError) throw new Error(`Ошибка получения заказа: ${orderError.message}`)
    console.log("Данные заказа успешно получены из БД.")

    const customerName = orderData.profiles?.first_name ? `${orderData.profiles.first_name} ${orderData.profiles.last_name || ''}`.trim() : orderData.guest_name
    const customerPhone = orderData.profiles?.phone || orderData.guest_phone
    const orderDate = new Date(orderData.created_at).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' }) // Указал часовой пояс для Казахстана
    
    let messageText = `🔔 *Новый заказ №...${orderData.id.slice(-6)}*\n\n`
    messageText += `*Дата:* ${orderDate}\n`
    messageText += `*Клиент:* ${customerName || 'Не указано'}\n`
    messageText += `*Телефон:* \`${customerPhone || 'Не указан'}\`\n\n`
    
    messageText += `*Состав заказа:*\n`
    orderData.order_items.forEach(item => {
      messageText += `• ${item.products.name} (${item.quantity} шт.)\n`
    })
    
    messageText += `\n*Сумма:* ${orderData.final_amount} ₸\n`
    messageText += `*Оплата:* ${orderData.payment_method}\n`
    messageText += `*Доставка:* ${orderData.delivery_method === 'courier' ? 'Курьер' : 'Самовывоз'}\n`

    if (orderData.delivery_method === 'courier' && orderData.delivery_address) {
      const address = orderData.delivery_address as { line1: string, city: string }
      messageText += `*Адрес:* ${address.city}, ${address.line1}\n`
    }
    messageText += `\nДля подтверждения заказа перейдите в админ-панель.`
    
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID')
    if (!botToken || !chatId) throw new Error('Секреты TELEGRAM не установлены.')

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: messageText, parse_mode: 'Markdown' }),
    })
    
    if (!response.ok) {
       const errorBody = await response.json()
       throw new Error(`Ошибка Telegram API: ${errorBody.description}`)
    }
    console.log("Сообщение успешно отправлено в Telegram.")

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error("Критическая ошибка в Edge Function:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})