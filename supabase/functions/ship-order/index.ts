import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { shippedWording } from '../_shared/shopInfo.ts'

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
      /** От него зависит, что писать покупателю: «в пути» или «готов к выдаче». */
      delivery_method?: string | null
      profile?: { first_name: string | null; last_name: string | null } | null
    } | null = null

    if (tableName === 'orders') {
      const { data } = await supabase
        .from('orders')
        .select('status, telegram_message_id, final_amount, user_id, delivery_method')
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
        .select('status, telegram_message_id, final_amount, guest_name, delivery_method')
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
    /*
     * Один и тот же статус `shipped` значит разное: курьеру заказ передают,
     * а самовывозный просто собирают и ставят на выдачу. Раньше текст был
     * только под курьера, и покупатель самовывоза получал «заказ уже едет к
     * вам» — на проде это 42 заказа из 45.
     */
    const wording = shippedWording(orderData.delivery_method)

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

    /*
     * Карточку в чате здесь БОЛЬШЕ НЕ ПЕРЕРИСОВЫВАЕМ.
     *
     * Этим занимается sync-order-status-to-telegram: на смену статуса стоят
     * триггеры `on_order_status_changed` и `on_guest_order_status_changed`,
     * и он перерисовывает сообщение общим сборщиком кнопок.
     *
     * Дубль здесь был не просто лишним. Он собирал кнопки СТАРОГО образца —
     * ссылками с ADMIN_SECRET внутри, — и после каждого действия секрет
     * снова оказывался в чате, откуда его убрал переход на callback. Плюс
     * гонка: кто перерисует последним, того и кнопки.
     */
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
          title: wording.customerTitle,
          body: wording.customerBody(orderId.slice(-6)),
        }),
      })
    }

    return new Response(
      `✅ ${wording.adminTitle}\n\n📦 Заказ №${orderId.slice(-6)}\n${wording.adminNote}`,
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
