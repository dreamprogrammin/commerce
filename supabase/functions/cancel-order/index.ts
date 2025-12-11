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
    
    console.log('🔍 Запрос на отмену заказа')

    // Получаем параметры из URL
    const url = new URL(req.url)
    const orderId = url.searchParams.get('order_id')
    const providedSecret = url.searchParams.get('secret')

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

    // Обновляем статус заказа на 'cancelled'
    const { data, error } = await supabase
      .from('orders')
      .update({ 
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select()
      .single()

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

    if (!data) {
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

    console.log('✅ Заказ успешно отменен')

    // Если заказ был от авторизованного пользователя, возвращаем потраченные бонусы
    let bonusMessage = ''
    if (data.user_id && data.bonuses_spent > 0) {
      console.log(`💰 Возврат ${data.bonuses_spent} бонусов пользователю ${data.user_id}`)
      
      const { error: bonusError } = await supabase.rpc('increment_bonus_balance', {
        user_id: data.user_id,
        amount: data.bonuses_spent
      })

      if (bonusError) {
        console.error('⚠️ Не удалось вернуть бонусы:', bonusError)
        bonusMessage = `\n\n⚠️ Внимание: бонусы не были возвращены автоматически`
      } else {
        console.log('✅ Бонусы возвращены')
        bonusMessage = `\n\n💰 Бонусы возвращены: ${data.bonuses_spent} ₸`
      }
    }

    const responseText = `✅ ЗАКАЗ ОТМЕНЕН

📦 Заказ №${orderId.slice(-6)}
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