import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { updateTelegramMessage } from '../_shared/telegramUtils.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminSecret = Deno.env.get('ADMIN_SECRET')

    console.log('🔍 Запрос на подтверждение заказа')

    // Получаем параметры из URL
    const url = new URL(req.url)
    const orderId = url.searchParams.get('order_id')
    const providedSecret = url.searchParams.get('secret')
    const tableParam = url.searchParams.get('table')

    if (!orderId) {
      return new Response(
        '❌ ОШИБКА\n\nНе указан ID заказа',
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/plain; charset=UTF-8'
          },
          status: 400
        }
      )
    }

    // Проверяем секретный токен (если настроен)
    if (adminSecret && providedSecret !== adminSecret) {
      console.error('❌ Неверный секретный токен')
      return new Response(
        '🔒 ДОСТУП ЗАПРЕЩЕН\n\nНеверный секретный токен',
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/plain; charset=UTF-8'
          },
          status: 403
        }
      )
    }

    console.log(`📦 Подтверждение заказа: ${orderId}`)

    // Создаем admin-клиент
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Определяем таблицу, если не указана явно
    let tableName = tableParam
    if (!tableName) {
      console.log('🔍 Определяем таблицу заказа...')
      const { data: detectedTable, error: detectError } = await supabase.rpc('get_order_table_name', {
        p_order_id: orderId
      })

      if (detectError) {
        console.error('❌ Ошибка определения таблицы:', detectError)
        return new Response(
          `❌ ОШИБКА\n\nНе удалось определить тип заказа:\n${detectError.message}`,
          {
            headers: {
              ...corsHeaders,
              'Content-Type': 'text/plain; charset=UTF-8'
            },
            status: 500
          }
        )
      }

      tableName = detectedTable
    }

    if (!tableName) {
      return new Response(
        '❌ ОШИБКА\n\nЗаказ не найден',
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/plain; charset=UTF-8'
          },
          status: 404
        }
      )
    }

    console.log(`📋 Таблица заказа: ${tableName}`)

    // Получаем данные заказа (для информации и telegram_message_id)
    let orderData: { status: string; telegram_message_id?: string | null } | null = null
    if (tableName === 'orders') {
      const { data } = await supabase
        .from('orders')
        .select('status, telegram_message_id')
        .eq('id', orderId)
        .single()
      orderData = data
    } else {
      const { data } = await supabase
        .from('guest_checkouts')
        .select('status, telegram_message_id')
        .eq('id', orderId)
        .single()
      orderData = data
    }

    if (!orderData) {
      return new Response(
        '❌ ОШИБКА\n\nЗаказ не найден',
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/plain; charset=UTF-8'
          },
          status: 404
        }
      )
    }

    // Проверяем статус заказа
    if (orderData.status === 'confirmed' || orderData.status === 'delivered') {
      return new Response(
        '⚠️ ПРЕДУПРЕЖДЕНИЕ\n\nЗаказ уже подтвержден',
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/plain; charset=UTF-8'
          },
          status: 400
        }
      )
    }

    if (orderData.status === 'cancelled') {
      return new Response(
        '❌ ОШИБКА\n\nНевозможно подтвердить отмененный заказ',
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/plain; charset=UTF-8'
          },
          status: 400
        }
      )
    }

    // Обновляем статус заказа на confirmed
    const { error: updateError } = await supabase
      .from(tableName)
      .update({ status: 'confirmed' })
      .eq('id', orderId)

    if (updateError) {
      console.error('❌ Ошибка при подтверждении:', updateError)
      return new Response(
        `❌ ОШИБКА\n\nНе удалось подтвердить заказ:\n${updateError.message}`,
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/plain; charset=UTF-8'
          },
          status: 500
        }
      )
    }

    console.log('✅ Заказ успешно подтвержден')

    // Обновляем Telegram сообщение, если есть telegram_message_id
    if (orderData.telegram_message_id) {
      const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
      const chatId = Deno.env.get('TELEGRAM_CHAT_ID')

      if (botToken && chatId) {
        console.log(`📱 Обновление Telegram сообщения ${orderData.telegram_message_id}...`)

        const updatedText = `✅ *ЗАКАЗ ПОДТВЕРЖДЕН*\n\n🔔 Заказ №${orderId.slice(-6)}\n\n_Статус: confirmed_\n\n✔️ Клиент согласен. Заказ готов к доставке.\n\n⏰ _Обновлено: ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}_`

        // Формируем новые кнопки: "Доставлен" и "Отменить"
        const secretParam = adminSecret ? `&secret=${adminSecret}` : ''
        const tableUrlParam = `&table=${tableName}`

        const shipUrl = `${supabaseUrl}/functions/v1/ship-order?order_id=${orderId}${tableUrlParam}${secretParam}`
        const cancelUrl = `${supabaseUrl}/functions/v1/cancel-order?order_id=${orderId}${tableUrlParam}${secretParam}`

        const newButtons = {
          inline_keyboard: [
            [
              { text: '🚚 Передать курьеру', url: shipUrl }
            ],
            [
              { text: '❌ Отменить', url: cancelUrl }
            ]
          ]
        }

        // Обновляем текст И кнопки одновременно
        const updateResult = await updateTelegramMessage(
          botToken,
          chatId,
          orderData.telegram_message_id,
          updatedText,
          'Markdown',
          newButtons
        )

        if (updateResult.success) {
          console.log('✅ Telegram сообщение и кнопки обновлены для всех админов')
        } else {
          console.error('⚠️ Не удалось обновить Telegram:', updateResult.error)
        }
      }
    }

    const orderType = tableName === 'guest_checkouts' ? 'Гостевой' : 'Пользовательский'
    const responseText = `✅ ЗАКАЗ ПОДТВЕРЖДЕН

📦 Заказ №${orderId.slice(-6)}
Тип: ${orderType}
Статус: Подтвержден

Операция выполнена успешно.`

    return new Response(
      responseText,
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/plain; charset=UTF-8'
        }
      }
    )
  } catch (error) {
    console.error('❌ Критическая ошибка:', error)
    return new Response(
      '❌ ОШИБКА СЕРВЕРА\n\nПроизошла внутренняя ошибка.\nПопробуйте позже.',
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/plain; charset=UTF-8'
        },
        status: 500
      }
    )
  }
})
