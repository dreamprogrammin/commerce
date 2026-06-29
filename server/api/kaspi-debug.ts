export default defineEventHandler(async (event) => {
  try {
    const client = await serverSupabaseClient(event)
    
    // Проверяем подключение
    const { data: testQuery, error: testError } = await client
      .from('products')
      .select('count')
      .limit(1)
    
    if (testError) {
      return {
        step: 'connection_test',
        error: testError.message,
        details: testError
      }
    }
    
    // Проверяем колонку export_to_kaspi
    const { data: exportCheck, error: exportError } = await client
      .from('products')
      .select('id, export_to_kaspi')
      .limit(1)
    
    if (exportError) {
      return {
        step: 'column_check',
        error: exportError.message,
        hint: 'Колонка export_to_kaspi не существует. Выполни миграцию.'
      }
    }
    
    // Проверяем RPC функцию
    const { data: products, error: rpcError } = await client.rpc('get_kaspi_feed_products')
    
    if (rpcError) {
      return {
        step: 'rpc_call',
        error: rpcError.message,
        hint: 'Функция get_kaspi_feed_products не найдена. Выполни SQL миграцию.',
        details: rpcError
      }
    }
    
    return {
      success: true,
      count: products?.length || 0,
      products: products || []
    }
  } catch (err: any) {
    return {
      error: 'general_error',
      message: err.message,
      stack: err.stack
    }
  }
})
