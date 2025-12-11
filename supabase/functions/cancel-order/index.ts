import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const url = new URL(req.url)
    const orderId = url.searchParams.get('order_id')
    if (!orderId) throw new Error('ID заказа не предоставлен.')

    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: resultMessage, error } = await supabaseAdminClient.rpc('cancel_order', {
      p_order_id: orderId
    })
    if (error) throw error

    // Формируем простой и понятный текстовый ответ
    const responseText = `
🗑️ ЗАКАЗ ОТМЕНЕН
=================
ID Заказа: ...${orderId.slice(-6)}
Результат: ${resultMessage}

Это окно можно закрыть.
    `
    return new Response(responseText, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/plain; charset=utf-8' 
      },
    })

  } catch (error) {
    let errorMessage = "Произошла неизвестная ошибка."
    if (error instanceof Error) errorMessage = error.message

    const errorText = `
❌ ОШИБКА ОТМЕНЫ ЗАКАЗА!
========================
Детали: ${errorMessage}
    `
    return new Response(errorText, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/plain; charset=utf-8' 
      },
      status: 400
    })
  }
})