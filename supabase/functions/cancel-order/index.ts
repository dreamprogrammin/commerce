import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { updateTelegramMessage } from '../_shared/telegramUtils.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log('✅ Функция cancel-order инициализирована v2')

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminSecret = Deno.env.get('ADMIN_SECRET')
    
    console.log('🔍 Запрос на отмену заказа')

    // Получаем параметры из URL
    const url = new URL(req.url)
    const orderId = url.searchParams.get('order_id')
    const providedSecret = url.searchParams.get('secret')
    const tableParam = url.searchParams.get('table') // Новый параметр

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

    console.log(`📦 Отмена заказа: ${orderId}`)

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

    // Получаем данные заказа перед отменой (для информации о бонусах, telegram_message_id и cancelled_by)
    let orderData: { user_id?: string; bonuses_spent?: number; bonuses_awarded?: number; status: string; telegram_message_id?: string | null; cancelled_by?: string | null } | null = null
    if (tableName === 'orders') {
      const { data } = await supabase
        .from('orders')
        .select('user_id, bonuses_spent, bonuses_awarded, status, telegram_message_id, cancelled_by')  // ✅ Добавлен cancelled_by
        .eq('id', orderId)
        .single()
      orderData = data
    } else {
      const { data } = await supabase
        .from('guest_checkouts')
        .select('status, telegram_message_id, cancelled_by')  // ✅ Добавлен cancelled_by
        .eq('id', orderId)
        .single()
      orderData = data as { status: string; telegram_message_id?: string | null; cancelled_by?: string | null } | null
    }

    // ✅ Вызываем функцию отмены заказа с указанием таблицы и cancelled_by='admin'
    const { data, error } = await supabase.rpc('cancel_order', {
      p_order_id: orderId,
      p_table_name: tableName,
      p_cancelled_by: 'admin'  // Отмена через Telegram = admin
    })

    if (error) {
      console.error('❌ Ошибка при отмене:', error)
      return new Response(
        `❌ ОШИБКА\n\nНе удалось отменить заказ:\n${error.message}`,
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'text/plain; charset=UTF-8' 
          },
          status: 500
        }
      )
    }

    console.log('✅ Заказ успешно отменен:', data)

    // Обновляем Telegram сообщение, если есть telegram_message_id
    if (orderData?.telegram_message_id) {
      const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
      const chatId = Deno.env.get('TELEGRAM_CHAT_ID')

      if (botToken && chatId) {
        console.log(`📱 Обновление Telegram сообщения ${orderData.telegram_message_id}...`)

        // ✅ Определяем кто отменил заказ (проверяем поле cancelled_by)
        let cancelledByText = 'администратором'
        if (orderData.cancelled_by === 'client') {
          cancelledByText = 'клиентом'
        } else if (orderData.cancelled_by === 'system') {
          cancelledByText = 'автоматически'
        }

        // Обновляем текст и удаляем кнопки одним запросом
        const updatedText = `❌ *ЗАКАЗ ОТМЕНЕН*\n\n🔔 Заказ №${orderId.slice(-6)} был отменен ${cancelledByText}\n\n_Статус: cancelled_\n\n⚠️ Все действия с этим заказом недоступны`

        const updateResult = await updateTelegramMessage(
          botToken,
          chatId,
          orderData.telegram_message_id,
          updatedText,
          'Markdown',
          { inline_keyboard: [] } // Удаляем кнопки в том же запросе
        )

        if (updateResult.success) {
          console.log('✅ Telegram сообщение обновлено и кнопки удалены')
        } else {
          console.error('⚠️ Не удалось обновить Telegram:', updateResult.error)
        }
      }
    }

    // Формируем сообщение о бонусах
    let bonusMessage = ''
    if (tableName === 'orders' && orderData?.user_id && orderData?.bonuses_spent && orderData.bonuses_spent > 0) {
      bonusMessage = `\n\n💰 Бонусы возвращены: ${orderData.bonuses_spent}`
    }

    const orderType = tableName === 'guest_checkouts' ? 'Гостевой' : 'Пользовательский'
    const responseText = `✅ ЗАКАЗ ОТМЕНЕН

📦 Заказ №${orderId.slice(-6)}
Тип: ${orderType}
Статус: Отменен${bonusMessage}

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