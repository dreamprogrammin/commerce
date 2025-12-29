import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { updateTelegramMessage } from '../_shared/telegramUtils.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface StatusUpdatePayload {
  record: {
    id: string
    status: string
    telegram_message_id?: string | null
  }
  old_record: {
    status: string
  }
  table: 'orders' | 'guest_checkouts'
}

console.log('✅ Функция sync-order-status-to-telegram инициализирована')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🔄 === СИНХРОНИЗАЦИЯ СТАТУСА ЗАКАЗА В TELEGRAM ===')

    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID')

    if (!botToken || !chatId) {
      console.error('❌ Отсутствуют TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID')
      throw new Error('Отсутствуют переменные окружения для Telegram')
    }

    // Проверяем источник запроса (должен быть от триггера БД)
    const userAgent = req.headers.get('user-agent') || ''
    const isFromTrigger = userAgent.toLowerCase().includes('pg_net')

    console.log(`📨 User-Agent: "${userAgent}"`)
    console.log(`🔍 Запрос от триггера БД: ${isFromTrigger}`)

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

    const payload: StatusUpdatePayload = await req.json()
    const { record, old_record, table } = payload

    console.log(`📦 Заказ: ${record.id}`)
    console.log(`📋 Таблица: ${table}`)
    console.log(`🔄 Статус изменен: ${old_record.status} → ${record.status}`)
    console.log(`💬 Telegram Message ID: ${record.telegram_message_id || 'отсутствует'}`)

    // Если нет telegram_message_id, не можем обновить сообщение
    if (!record.telegram_message_id) {
      console.log('⚠️ Нет telegram_message_id, пропускаем обновление')
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No telegram_message_id to update',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // Формируем текст обновления в зависимости от статуса
    let statusEmoji = '📦'
    let statusText = ''
    let statusDescription = ''

    switch (record.status) {
      case 'new':
        statusEmoji = '🆕'
        statusText = 'НОВЫЙ ЗАКАЗ'
        statusDescription = 'Ожидает обработки'
        break
      case 'confirmed':
        statusEmoji = '✅'
        statusText = 'ПОДТВЕРЖДЕН'
        statusDescription = 'Заказ принят в работу'
        break
      case 'processing':
        statusEmoji = '⚙️'
        statusText = 'В ОБРАБОТКЕ'
        statusDescription = 'Заказ комплектуется'
        break
      case 'shipped':
        statusEmoji = '🚚'
        statusText = 'ОТПРАВЛЕН'
        statusDescription = 'Заказ в пути к клиенту'
        break
      case 'delivered':
        statusEmoji = '✨'
        statusText = 'ДОСТАВЛЕН'
        statusDescription = 'Заказ успешно доставлен'
        break
      case 'cancelled':
        statusEmoji = '❌'
        statusText = 'ОТМЕНЕН'
        statusDescription = 'Заказ отменен'
        break
      default:
        statusEmoji = '📦'
        statusText = record.status.toUpperCase()
        statusDescription = 'Статус обновлен'
    }

    // Получаем дополнительную информацию о заказе из БД
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Получаем информацию о заказе
    let orderInfo = ''
    if (table === 'orders') {
      const { data: orderData } = await supabase
        .from('orders')
        .select(`
          final_amount,
          bonuses_spent,
          bonuses_awarded,
          profile:profiles(first_name, last_name)
        `)
        .eq('id', record.id)
        .single()

      if (orderData) {
        const customerName = orderData.profile
          ? `${orderData.profile.first_name} ${orderData.profile.last_name || ''}`.trim()
          : 'Не указано'

        orderInfo = `\n💰 *Сумма:* ${orderData.final_amount} ₸`
        if (orderData.bonuses_spent > 0) {
          orderInfo += `\n💳 *Списано бонусов:* ${orderData.bonuses_spent}`
        }
        orderInfo += `\n👤 *Клиент:* ${customerName}`
      }
    } else {
      const { data: guestData } = await supabase
        .from('guest_checkouts')
        .select('final_amount, guest_name')
        .eq('id', record.id)
        .single()

      if (guestData) {
        orderInfo = `\n💰 *Сумма:* ${guestData.final_amount} ₸`
        orderInfo += `\n👥 *Клиент:* ${guestData.guest_name || 'Гость'}`
      }
    }

    // Формируем обновленное сообщение
    const updatedText = `${statusEmoji} *${statusText}*\n\n🔔 Заказ №${record.id.slice(-6)}${orderInfo}\n\n_Статус: ${record.status}_\n\n${statusDescription}\n\n⏰ _Обновлено: ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}_`

    console.log('📝 Текст обновления:')
    console.log(updatedText)

    // Обновляем Telegram сообщение
    const updateResult = await updateTelegramMessage(
      botToken,
      chatId,
      record.telegram_message_id,
      updatedText
    )

    if (updateResult.success) {
      console.log('✅ Telegram сообщение обновлено для всех админов')
    } else {
      console.error('⚠️ Не удалось обновить Telegram:', updateResult.error)
    }

    console.log('🎉 Синхронизация завершена')

    return new Response(
      JSON.stringify({
        success: updateResult.success,
        message: updateResult.success
          ? 'Статус синхронизирован в Telegram'
          : 'Ошибка синхронизации',
        orderId: record.id,
        oldStatus: old_record.status,
        newStatus: record.status,
        table,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: updateResult.success ? 200 : 500,
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
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
