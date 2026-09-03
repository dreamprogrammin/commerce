import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { deliveredWording } from '../_shared/shopInfo.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log('✅ Функция deliver-order v2 инициализирована')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('📦 === ДОСТАВКА ЗАКАЗА ===')

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
      telegram_message_id?: string | null
      final_amount?: number
      guest_name?: string
      user_id?: string | null
      /** Курьер довёз или покупатель забрал — от этого зависит слово в отчёте. */
      delivery_method?: string | null
      profile?: { first_name: string | null; last_name: string | null } | null
    } | null = null

    if (tableName === 'orders') {
      // Получаем заказ БЕЗ вложенного запроса к profiles
      const { data } = await supabase
        .from('orders')
        .select('status, telegram_message_id, final_amount, user_id, delivery_method')
        .eq('id', orderId)
        .single()
      orderData = data as any

      // Если есть user_id - получаем профиль отдельным запросом
      if (orderData?.user_id) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', orderData.user_id)
          .single()

        if (profileData) {
          orderData.profile = profileData
        }
      }
    } else {
      const { data } = await supabase
        .from('guest_checkouts')
        .select('status, telegram_message_id, final_amount, guest_name, delivery_method')
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

    // Проверяем статус
    if (orderData.status === 'delivered') {
      return new Response(
        '⚠️ ВНИМАНИЕ\n\nЗаказ уже доставлен',
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
        '❌ ОШИБКА\n\nНевозможно доставить отмененный заказ',
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/plain; charset=UTF-8'
          },
          status: 400
        }
      )
    }

    if (orderData.status !== 'shipped') {
      return new Response(
        '❌ ОШИБКА\n\nЗаказ должен быть передан курьеру перед отметкой о доставке',
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/plain; charset=UTF-8'
          },
          status: 400
        }
      )
    }

    // Обновляем заказ - устанавливаем статус delivered
    const { error: updateError } = await supabase
      .from(tableName)
      .update({ status: 'delivered' })
      .eq('id', orderId)

    if (updateError) {
      console.error('❌ Ошибка при обновлении статуса:', updateError)
      return new Response(
        `❌ ОШИБКА\n\nНе удалось обновить статус заказа:\n${updateError.message}`,
        {
          headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=UTF-8' },
          status: 500
        }
      )
    }

    // Обрабатываем бонусы (ставим bonuses_activation_date)
    if (tableName === 'orders') {
      const { error: bonusError } = await supabase
        .from('orders')
        .update({ bonuses_activation_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() })
        .eq('id', orderId)
        .is('bonuses_activation_date', null)
      if (bonusError) {
        console.error('⚠️ Ошибка установки bonuses_activation_date:', bonusError.message)
      } else {
        console.log('✅ bonuses_activation_date установлена')
      }
    }

    console.log('✅ Заказ успешно доставлен')

    /*
     * Карточку в чате здесь БОЛЬШЕ НЕ ПЕРЕРИСОВЫВАЕМ — этим занимается
     * sync-order-status-to-telegram по триггеру на смену статуса. Он же
     * убирает кнопки: у доставленного заказа действий не осталось.
     * Подробнее — в таком же пояснении в ship-order.
     */

    console.log('🎉 Доставка заказа завершена')

    /*
     * Для самовывоза «доставлен» — неверное слово: покупатель забрал заказ
     * сам. Подписи разведены там же, где и для шага отгрузки.
     */
    const wording = deliveredWording(orderData.delivery_method)
    const orderType = tableName === 'guest_checkouts' ? 'Гостевой' : 'Пользовательский'
    const responseText = `✅ ${wording.adminTitle}

📦 Заказ №${orderId.slice(-6)}
Тип: ${orderType}

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
