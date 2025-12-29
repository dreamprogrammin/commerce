import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { updateTelegramMessage } from '../_shared/telegramUtils.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log('✅ Функция assign-order-to-admin инициализирована')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('👤 === НАЗНАЧЕНИЕ ЗАКАЗА АДМИНУ ===')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminSecret = Deno.env.get('ADMIN_SECRET')
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID')

    if (!botToken || !chatId) {
      throw new Error('Отсутствуют TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID')
    }

    console.log('🔍 Разбор параметров запроса')

    // Получаем параметры из URL
    const url = new URL(req.url)
    const orderId = url.searchParams.get('order_id')
    const providedSecret = url.searchParams.get('secret')
    const tableParam = url.searchParams.get('table')
    const adminName = url.searchParams.get('admin_name') || 'Админ'
    const adminUsername = url.searchParams.get('admin_username')

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

    console.log(`📦 Заказ: ${orderId}`)
    console.log(`👤 Админ: ${adminName}${adminUsername ? ` (@${adminUsername})` : ''}`)

    // Создаем admin-клиент
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Определяем таблицу
    let tableName = tableParam
    if (!tableName) {
      console.log('🔍 Определяем таблицу заказа...')
      const { data: detectedTable, error: detectError } = await supabase.rpc('get_order_table_name', {
        p_order_id: orderId
      })

      if (detectError || !detectedTable) {
        console.error('❌ Ошибка определения таблицы:', detectError)
        return new Response(
          `❌ ОШИБКА\n\nНе удалось найти заказ`,
          {
            headers: {
              ...corsHeaders,
              'Content-Type': 'text/plain; charset=UTF-8'
            },
            status: 404
          }
        )
      }

      tableName = detectedTable
    }

    console.log(`📋 Таблица заказа: ${tableName}`)

    // Получаем текущие данные заказа
    let orderData: {
      status: string
      assigned_admin_name?: string | null
      telegram_message_id?: string | null
      final_amount?: number
      guest_name?: string
    } | null = null

    if (tableName === 'orders') {
      const { data } = await supabase
        .from('orders')
        .select('status, assigned_admin_name, telegram_message_id, final_amount, profile:profiles(first_name, last_name)')
        .eq('id', orderId)
        .single()
      orderData = data as any
    } else {
      const { data } = await supabase
        .from('guest_checkouts')
        .select('status, assigned_admin_name, telegram_message_id, final_amount, guest_name')
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

    // Проверяем, не взят ли уже заказ другим админом
    if (orderData.assigned_admin_name && orderData.assigned_admin_name !== adminName) {
      console.log(`⚠️ Заказ уже взят: ${orderData.assigned_admin_name}`)
      return new Response(
        `⚠️ ВНИМАНИЕ\n\nЗаказ уже в работе у:\n${orderData.assigned_admin_name}`,
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/plain; charset=UTF-8'
          },
          status: 400
        }
      )
    }

    // Обновляем заказ - назначаем админа и сразу подтверждаем (confirmed)
    const { error: updateError } = await supabase
      .from(tableName)
      .update({
        assigned_admin_name: adminName,
        assigned_admin_username: adminUsername,
        assigned_at: new Date().toISOString(),
        status: 'confirmed'
      })
      .eq('id', orderId)

    if (updateError) {
      console.error('❌ Ошибка при назначении админа:', updateError)
      return new Response(
        `❌ ОШИБКА\n\nНе удалось взять заказ в работу:\n${updateError.message}`,
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/plain; charset=UTF-8'
          },
          status: 500
        }
      )
    }

    console.log('✅ Заказ успешно назначен админу')

    // Обновляем Telegram сообщение
    if (orderData.telegram_message_id) {
      console.log(`📱 Обновление Telegram сообщения ${orderData.telegram_message_id}...`)

      const customerName = tableName === 'orders'
        ? `${(orderData as any).profile?.first_name || ''} ${(orderData as any).profile?.last_name || ''}`.trim() || 'Не указано'
        : orderData.guest_name || 'Гость'

      const updatedText = `⚙️ *В ОБРАБОТКЕ*\n\n🔔 Заказ №${orderId.slice(-6)}\n💰 *Сумма:* ${orderData.final_amount} ₸\n👤 *Клиент:* ${customerName}\n\n👨‍💼 *Ответственный:* ${adminName}${adminUsername ? ` (@${adminUsername})` : ''}\n\n_Статус: processing_\n\n📝 Заказ взят в работу\n\n⏰ _Обновлено: ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}_`

      const updateResult = await updateTelegramMessage(
        botToken,
        chatId,
        orderData.telegram_message_id,
        updatedText
      )

      if (updateResult.success) {
        console.log('✅ Telegram сообщение обновлено для всех админов')
      } else {
        console.error('⚠️ Не удалось обновить Telegram:', updateResult.error)
      }
    }

    console.log('🎉 Назначение админа завершено')

    const orderType = tableName === 'guest_checkouts' ? 'Гостевой' : 'Пользовательский'
    const responseText = `✅ ЗАКАЗ ВЗЯТ В РАБОТУ

📦 Заказ №${orderId.slice(-6)}
Тип: ${orderType}
👨‍💼 Ответственный: ${adminName}${adminUsername ? ` (@${adminUsername})` : ''}

Статус изменен на: В обработке

Другие админы увидят это обновление в Telegram.`

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
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка'
    console.error('❌ Критическая ошибка:', errorMessage)
    console.error('Stack:', error instanceof Error ? error.stack : 'N/A')

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
