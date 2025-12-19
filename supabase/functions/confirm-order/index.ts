import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    // Вызываем функцию подтверждения заказа с указанием таблицы
    const { data, error } = await supabase.rpc('confirm_and_process_order', {
      p_order_id: orderId,
      p_table_name: tableName
    })

    if (error) {
      console.error('❌ Ошибка при подтверждении:', error)
      return new Response(
        `❌ ОШИБКА\n\nНе удалось подтвердить заказ:\n${error.message}`,
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'text/plain; charset=UTF-8' 
          },
          status: 500
        }
      )
    }

    console.log('✅ Заказ успешно подтвержден:', data)

    const orderType = tableName === 'guest_checkouts' ? 'Гостевой' : 'Пользовательский'
    const responseText = `✅ ЗАКАЗ ПОДТВЕРЖДЕН

📦 Заказ №${orderId.slice(-6)}
Тип: ${orderType}
Статус: Подтвержден и обработан

Заказ принят в работу.
${tableName === 'orders' ? 'Клиент получит уведомление о подтверждении.' : 'Гостевой заказ обработан.'}`

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