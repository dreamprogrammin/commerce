import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log('✅ Функция confirm-order запущена')

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const orderId = url.searchParams.get('order_id')

    // Проверяем наличие order_id
    if (!orderId) {
      return new Response(
        '❌ ОШИБКА: Отсутствует order_id\n\n' +
        'Использование:\n' +
        '?order_id=ваш-order-id\n\n' +
        'Пример:\n' +
        '?order_id=123e4567-e89b-12d3-a456-426614174000',
        {
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'text/plain; charset=utf-8' 
          },
          status: 400,
        }
      )
    }

    console.log(`📋 Обработка заказа: ${orderId}`)

    // Специальная обработка для тестирования
    if (orderId === 'TEST_ID') {
      return new Response(
        '🧪 ТЕСТОВЫЙ РЕЖИМ\n\n' +
        '✅ Функция работает корректно!\n' +
        'Версия: 3.1.0\n' +
        'Статус: Готова к работе\n\n' +
        'Для реального заказа используйте настоящий UUID.',
        {
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'text/plain; charset=utf-8' 
          }
        }
      )
    }

    // Создаем клиент с admin правами
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Вызываем RPC функцию
    const { data: resultMessage, error } = await supabase.rpc('confirm_and_process_order', {
      p_order_id: orderId,
    })

    // Обрабатываем ошибки БД
    if (error) {
      console.error('❌ RPC ошибка:', error)
      
      return new Response(
        '❌ ОШИБКА БАЗЫ ДАННЫХ\n\n' +
        `Заказ: ${orderId}\n` +
        `Ошибка: ${error.message}\n` +
        `Код: ${error.code || 'неизвестен'}\n\n` +
        'Возможные причины:\n' +
        '• Заказ не найден\n' +
        '• Заказ уже обработан\n' +
        '• Проблема с доступом к БД\n\n' +
        'Обратитесь к администратору.',
        {
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'text/plain; charset=utf-8' 
          },
          status: 400,
        }
      )
    }

    // Успешная обработка
    console.log(`✅ Заказ ${orderId} успешно обработан:`, resultMessage)

    return new Response(
      '🎉 ЗАКАЗ УСПЕШНО ПОДТВЕРЖДЕН!\n\n' +
      `📋 ID заказа: ${orderId}\n` +
      `📝 Результат: ${resultMessage || 'Заказ обработан успешно'}\n` +
      `⏰ Время: ${new Date().toLocaleString('ru-RU')}\n` +
      `🔧 Версия: 3.1.0\n\n` +
      '✅ Все операции выполнены корректно.',
      {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'text/plain; charset=utf-8' 
        }
      }
    )

  } catch (error) {
    console.error('💥 Критическая ошибка:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная системная ошибка'
    
    return new Response(
      '💥 КРИТИЧЕСКАЯ ОШИБКА СИСТЕМЫ\n\n' +
      `Детали: ${errorMessage}\n` +
      `Время: ${new Date().toISOString()}\n` +
      `Версия: 3.1.0\n\n` +
      'Действия:\n' +
      '1. Попробуйте повторить запрос через минуту\n' +
      '2. Проверьте правильность order_id\n' +
      '3. Обратитесь к техподдержке\n\n' +
      'Администраторам: проверьте логи функции.',
      {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'text/plain; charset=utf-8' 
        },
        status: 500,
      }
    )
  }
})