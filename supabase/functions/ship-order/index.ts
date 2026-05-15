import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { updateTelegramMessage, escapeMarkdown } from '../_shared/telegramUtils.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log('✅ Функция ship-order v1 инициализирована')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🚚 === ПЕРЕДАЧА ЗАКАЗА КУРЬЕРУ ===')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminSecret = Deno.env.get('ADMIN_SECRET')
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID')

    if (!botToken || !chatId) {
      throw new Error('Отсутствуют TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID')
    }

    const url = new URL(req.url)
    const orderId = url.searchParams.get('order_id')
    const providedSecret = url.searchParams.get('secret')
    const tableParam = url.searchParams.get('table')

    if (!orderId) {
      return new Response('❌ ОШИБКА\n\nНе указан ID заказа', {
        headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=UTF-8' },
        status: 400,
      })
    }

    if (adminSecret && providedSecret !== adminSecret) {
      return new Response('🔒 ДОСТУП ЗАПРЕЩЕН\n\nНеверный секретный токен', {
        headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=UTF-8' },
        status: 403,
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Определяем таблицу
    let tableName = tableParam
    if (!tableName) {
      const { data: detectedTable, error: detectError } = await supabase.rpc('get_order_table_name', {
        p_order_id: orderId,
      })
      if (detectError || !detectedTable) {
        return new Response('❌ ОШИБКА\n\nНе удалось найти заказ', {
          headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=UTF-8' },
          status: 404,
        })
      }
      tableName = detectedTable
    }

    console.log(`📋 Таблица: ${tableName}, заказ: ${orderId}`)

    // Получаем данные заказа
    let orderData: {
      status: string
      telegram_message_id?: string | null
      final_amount?: number
      guest_name?: string
      user_id?: string | null
      telegram_chat_id?: string | null
      profile?: { first_name: string | null; last_name: string | null } | null
    } | null = null

    if (tableName === 'orders') {
      const { data } = await supabase
        .from('orders')
        .select('status, telegram_message_id, final_amount, user_id')
        .eq('id', orderId)
        .single()
      orderData = data as any

      if (orderData?.user_id) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('first_name, last_name, telegram_chat_id')
          .eq('id', orderData.user_id)
          .single()
        if (profileData) {
          orderData.profile = { first_name: profileData.first_name, last_name: profileData.last_name }
          orderData.telegram_chat_id = profileData.telegram_chat_id
        }
      }
    } else {
      const { data } = await supabase
        .from('guest_checkouts')
        .select('status, telegram_message_id, final_amount, guest_name')
        .eq('id', orderId)
        .single()
      orderData = data
    }

    if (!orderData) {
      return new Response('❌ ОШИБКА\n\nЗаказ не найден', {
        headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=UTF-8' },
        status: 404,
      })
    }

    if (orderData.status === 'shipped') {
      return new Response('⚠️ ПРЕДУПРЕЖДЕНИЕ\n\nЗаказ уже передан курьеру', {
        headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=UTF-8' },
        status: 400,
      })
    }

    if (orderData.status === 'delivered') {
      return new Response('⚠️ ПРЕДУПРЕЖДЕНИЕ\n\nЗаказ уже доставлен', {
        headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=UTF-8' },
        status: 400,
      })
    }

    if (orderData.status === 'cancelled') {
      return new Response('❌ ОШИБКА\n\nНевозможно передать отмененный заказ', {
        headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=UTF-8' },
        status: 400,
      })
    }

    if (orderData.status !== 'confirmed') {
      return new Response('❌ ОШИБКА\n\nЗаказ должен быть подтверждён перед передачей курьеру', {
        headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=UTF-8' },
        status: 400,
      })
    }

    // Обновляем статус на shipped
    const { error: updateError } = await supabase
      .from(tableName)
      .update({ status: 'shipped' })
      .eq('id', orderId)

    if (updateError) {
      console.error('❌ Ошибка обновления статуса:', updateError)
      return new Response(`❌ ОШИБКА\n\nНе удалось обновить статус:\n${updateError.message}`, {
        headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=UTF-8' },
        status: 500,
      })
    }

    console.log('✅ Статус обновлён на shipped')

    const customerNameRaw = tableName === 'orders'
      ? `${(orderData as any).profile?.first_name || ''} ${(orderData as any).profile?.last_name || ''}`.trim() || 'Не указано'
      : orderData.guest_name || 'Гость'
    const customerName = escapeMarkdown(customerNameRaw)

    // Обновляем сообщение в Telegram (убираем кнопки, показываем новый статус + кнопку "Доставлен")
    if (orderData.telegram_message_id) {
      const secretParam = adminSecret ? `&secret=${adminSecret}` : ''
      const tableUrlParam = `&table=${tableName}`

      const deliveredUrl = `${supabaseUrl}/functions/v1/deliver-order?order_id=${orderId}${tableUrlParam}${secretParam}`
      const cancelUrl = `${supabaseUrl}/functions/v1/cancel-order?order_id=${orderId}${tableUrlParam}${secretParam}`

      const updatedText = `🚚 *ПЕРЕДАН КУРЬЕРУ*\n\n🔔 Заказ №${orderId.slice(-6)}\n💰 *Сумма:* ${orderData.final_amount} ₸\n👤 *Клиент:* ${customerName}\n\n_Статус: shipped_\n\n📦 Заказ передан курьеру и в пути\n\n⏰ _Обновлено: ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}_`

      const newButtons = {
        inline_keyboard: [
          [{ text: '✅ Доставлен', url: deliveredUrl }],
          [{ text: '❌ Отменить', url: cancelUrl }],
        ],
      }

      const updateResult = await updateTelegramMessage(
        botToken, chatId, orderData.telegram_message_id, updatedText, 'Markdown', newButtons
      )

      if (updateResult.success) {
        console.log('✅ Telegram сообщение обновлено')
      } else {
        console.error('⚠️ Не удалось обновить Telegram:', updateResult.error)
      }
    }

    // Уведомляем клиента (если есть telegram_chat_id)
    if (tableName === 'orders' && orderData.telegram_chat_id) {
      console.log(`📱 Уведомление клиенту: ${orderData.telegram_chat_id}`)
      await fetch(`${supabaseUrl}/functions/v1/send-user-telegram`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          chat_id: orderData.telegram_chat_id,
          title: '🚚 Ваш заказ в пути!',
          body: `Заказ №${orderId.slice(-6)} передан курьеру и уже едет к вам 🎉`,
        }),
      })
    }

    return new Response(
      `✅ ЗАКАЗ ПЕРЕДАН КУРЬЕРУ\n\n📦 Заказ №${orderId.slice(-6)}\nСтатус: В пути\n\nОперация выполнена успешно.`,
      { headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=UTF-8' } }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка'
    console.error('❌ Критическая ошибка:', errorMessage)
    return new Response('❌ ОШИБКА СЕРВЕРА\n\nПроизошла внутренняя ошибка.\nПопробуйте позже.', {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=UTF-8' },
      status: 500,
    })
  }
})
