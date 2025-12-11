import { corsHeaders } from '../_shared/cors.ts'
import { createAdminClient } from '../_shared/supabase-client.ts'
import { textResponse } from '../_shared/response-helpers.ts'

console.log('✅ Функция confirm-order запущена')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const orderId = url.searchParams.get('order_id')

    if (!orderId) {
      return textResponse(
        '❌ ОШИБКА: Отсутствует order_id\n\n' +
        'Использование: ?order_id=ваш-uuid',
        400
      )
    }

    // Тестовый режим
    if (orderId === 'TEST_ID') {
      return textResponse(
        '🧪 ТЕСТОВЫЙ РЕЖИМ\n\n' +
        '✅ Функция работает корректно!\n' +
        'Версия: 4.0.0\n' +
        'Для реального заказа используйте настоящий UUID.'
      )
    }

    console.log(`📋 Подтверждение заказа: ${orderId}`)

    const supabase = createAdminClient()
    const { data: resultMessage, error } = await supabase.rpc('confirm_and_process_order', {
      p_order_id: orderId,
    })

    if (error) {
      console.error('❌ RPC ошибка:', error)
      return textResponse(
        '❌ ОШИБКА БАЗЫ ДАННЫХ\n\n' +
        `Заказ: ${orderId}\n` +
        `Ошибка: ${error.message}\n\n` +
        'Возможные причины:\n' +
        '• Заказ не найден\n' +
        '• Заказ уже обработан\n' +
        '• Проблема с БД',
        400
      )
    }

    console.log(`✅ Заказ ${orderId} подтвержден`)

    return textResponse(
      '🎉 ЗАКАЗ УСПЕШНО ПОДТВЕРЖДЕН!\n\n' +
      `📋 ID: ...${orderId.slice(-6)}\n` +
      `📝 ${resultMessage || 'Заказ обработан'}\n` +
      `⏰ ${new Date().toLocaleString('ru-RU')}\n\n` +
      '✅ Операция выполнена.\n' +
      'Это окно можно закрыть.'
    )
  } catch (error) {
    console.error('💥 Критическая ошибка:', error)
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка'
    
    return textResponse(
      '💥 КРИТИЧЕСКАЯ ОШИБКА\n\n' +
      `Детали: ${errorMessage}\n` +
      `Время: ${new Date().toISOString()}\n\n` +
      'Обратитесь к техподдержке.',
      500
    )
  }
})