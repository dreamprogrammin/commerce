import { corsHeaders } from '../_shared/cors.ts'
import { createAdminClient } from '../_shared/supabase-client.ts'
import { textResponse } from '../_shared/response-helpers.ts'

console.log('✅ Функция cancel-order запущена')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const orderId = url.searchParams.get('order_id')

    if (!orderId) {
      return textResponse('❌ ID заказа не предоставлен', 400)
    }

    console.log(`🗑️ Отмена заказа: ${orderId}`)

    const supabase = createAdminClient()
    const { data: resultMessage, error } = await supabase.rpc('cancel_order', {
      p_order_id: orderId,
    })

    if (error) {
      console.error('❌ RPC ошибка:', error)
      throw error
    }

    console.log(`✅ Заказ ${orderId} отменен`)

    return textResponse(
      '🗑️ ЗАКАЗ ОТМЕНЕН\n' +
      '=================\n' +
      `ID: ...${orderId.slice(-6)}\n` +
      `${resultMessage || 'Заказ успешно отменен'}\n\n` +
      'Это окно можно закрыть.'
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка'
    console.error('❌ Ошибка отмены:', errorMessage)

    return textResponse(
      '❌ ОШИБКА ОТМЕНЫ ЗАКАЗА\n' +
      '========================\n' +
      `Детали: ${errorMessage}`,
      400
    )
  }
})