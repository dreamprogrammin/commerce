import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { updateTelegramMessage, escapeMarkdown } from '../_shared/telegramUtils.ts'

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

console.log('✅ Функция sync-order-status-to-telegram v2 инициализирована')

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

    // Получаем информацию о заказе (включая cancelled_by)
    let orderInfo = ''
    let assignedAdmin = ''
    let cancelledBy = ''

    if (table === 'orders') {
      const { data: orderData } = await supabase
        .from('orders')
        .select(`
          final_amount,
          bonuses_spent,
          bonuses_awarded,
          assigned_admin_name,
          assigned_admin_username,
          cancelled_by,
          profile:profiles(first_name, last_name)
        `)
        .eq('id', record.id)
        .single()

      if (orderData) {
        const customerNameRaw = orderData.profile
          ? `${orderData.profile.first_name} ${orderData.profile.last_name || ''}`.trim()
          : 'Не указано'
        const customerName = escapeMarkdown(customerNameRaw)

        orderInfo = `\n💰 *Сумма:* ${orderData.final_amount} ₸`
        if (orderData.bonuses_spent > 0) {
          orderInfo += `\n💳 *Списано бонусов:* ${orderData.bonuses_spent}`
        }
        orderInfo += `\n👤 *Клиент:* ${customerName}`

        // Информация об ответственном админе
        if (orderData.assigned_admin_name) {
          const adminName = escapeMarkdown(orderData.assigned_admin_name)
          const adminUsername = orderData.assigned_admin_username ? escapeMarkdown(orderData.assigned_admin_username) : null
          assignedAdmin = `\n👨‍💼 *Ответственный:* ${adminName}`
          if (adminUsername) {
            assignedAdmin += ` (@${adminUsername})`
          }
        }

        // ✅ Информация о том кто отменил (для cancelled статуса)
        if (record.status === 'cancelled' && orderData.cancelled_by) {
          const cancelledByMap: Record<string, string> = {
            'client': '👤 клиентом',
            'admin': '👨‍💼 администратором',
            'system': '🤖 автоматически'
          }
          cancelledBy = `\n⚠️ *Отменён:* ${cancelledByMap[orderData.cancelled_by] || orderData.cancelled_by}`
        }
      }
    } else {
      const { data: guestData } = await supabase
        .from('guest_checkouts')
        .select('final_amount, guest_name, assigned_admin_name, assigned_admin_username, cancelled_by')
        .eq('id', record.id)
        .single()

      if (guestData) {
        const guestName = escapeMarkdown(guestData.guest_name) || 'Гость'
        orderInfo = `\n💰 *Сумма:* ${guestData.final_amount} ₸`
        orderInfo += `\n👥 *Клиент:* ${guestName}`

        // Информация об ответственном админе
        if (guestData.assigned_admin_name) {
          const adminName = escapeMarkdown(guestData.assigned_admin_name)
          const adminUsername = guestData.assigned_admin_username ? escapeMarkdown(guestData.assigned_admin_username) : null
          assignedAdmin = `\n👨‍💼 *Ответственный:* ${adminName}`
          if (adminUsername) {
            assignedAdmin += ` (@${adminUsername})`
          }
        }

        // ✅ Информация о том кто отменил (для cancelled статуса)
        if (record.status === 'cancelled' && guestData.cancelled_by) {
          const cancelledByMap: Record<string, string> = {
            'client': '👤 клиентом',
            'admin': '👨‍💼 администратором',
            'system': '🤖 автоматически'
          }
          cancelledBy = `\n⚠️ *Отменён:* ${cancelledByMap[guestData.cancelled_by] || guestData.cancelled_by}`
        }
      }
    }

    // ✅ Формируем обновленное сообщение с информацией о том кто отменил
    const updatedText = `${statusEmoji} *${statusText}*\n\n🔔 Заказ №${record.id.slice(-6)}${orderInfo}${assignedAdmin}${cancelledBy}\n\n_Статус: ${record.status}_\n\n${statusDescription}\n\n⏰ _Обновлено: ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}_`

    console.log('📝 Текст обновления:')
    console.log(updatedText)

    // Формируем кнопки в зависимости от статуса
    let buttons = null
    const adminSecret = Deno.env.get('ADMIN_SECRET')
    const secretParam = adminSecret ? `&secret=${adminSecret}` : ''
    const tableParam = `&table=${table}`

    if (record.status === 'processing') {
      // В работе → показываем [Подтвердить] [Отменить]
      const confirmUrl = `${supabaseUrl}/functions/v1/confirm-order?order_id=${record.id}${tableParam}${secretParam}`
      const cancelUrl = `${supabaseUrl}/functions/v1/cancel-order?order_id=${record.id}${tableParam}${secretParam}`

      buttons = {
        inline_keyboard: [
          [{ text: '✅ Подтвердить', url: confirmUrl }],
          [{ text: '❌ Отменить', url: cancelUrl }]
        ]
      }
    } else if (record.status === 'confirmed') {
      // Подтверждён → показываем [Передать курьеру] [Отменить]
      const shipUrl = `${supabaseUrl}/functions/v1/ship-order?order_id=${record.id}${tableParam}${secretParam}`
      const cancelUrl = `${supabaseUrl}/functions/v1/cancel-order?order_id=${record.id}${tableParam}${secretParam}`

      buttons = {
        inline_keyboard: [
          [{ text: '🚚 Передать курьеру', url: shipUrl }],
          [{ text: '❌ Отменить', url: cancelUrl }]
        ]
      }
    } else if (record.status === 'shipped') {
      // В пути → показываем [Доставлен] [Отменить]
      const deliveredUrl = `${supabaseUrl}/functions/v1/deliver-order?order_id=${record.id}${tableParam}${secretParam}`
      const cancelUrl = `${supabaseUrl}/functions/v1/cancel-order?order_id=${record.id}${tableParam}${secretParam}`

      buttons = {
        inline_keyboard: [
          [{ text: '✅ Доставлен', url: deliveredUrl }],
          [{ text: '❌ Отменить', url: cancelUrl }]
        ]
      }
    } else if (record.status === 'new' || record.status === 'pending') {
      // Новый → показываем [Взять в работу] [Отменить]
      const assignUrl = `${supabaseUrl}/functions/v1/assign-order-to-admin?order_id=${record.id}${tableParam}${secretParam}`
      const cancelUrl = `${supabaseUrl}/functions/v1/cancel-order?order_id=${record.id}${tableParam}${secretParam}`

      buttons = {
        inline_keyboard: [
          [{ text: '✅ Взять в работу', url: assignUrl }],
          [{ text: '❌ Отменить', url: cancelUrl }]
        ]
      }
    }
    // Для delivered и cancelled кнопок нет (buttons = null)

    console.log('🔘 Кнопки:', buttons ? JSON.stringify(buttons) : 'отсутствуют')

    // Обновляем Telegram сообщение с кнопками
    const updateResult = await updateTelegramMessage(
      botToken,
      chatId,
      record.telegram_message_id,
      updatedText,
      'Markdown',
      buttons || undefined
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
