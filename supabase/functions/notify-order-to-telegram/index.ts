import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface OrderPayload {
  record: { id: string }
  table: 'orders' | 'guest_checkouts'
  operation?: string
}

interface ProductImage {
  id: string
  image_url: string
  display_order: number
}

interface OrderItem {
  quantity: number
  product_id: string
  product: {
    id: string
    name: string | null
    price: number | null
    sku: string | null
    barcode: string | null
  } | null
}

interface GuestCheckoutItem {
  quantity: number
  product_id: string
  price_per_item: number
  product: {
    id: string
    name: string | null
    price: number | null
    sku: string | null
    barcode: string | null
  } | null
}

interface OrderProfile {
  first_name: string | null
  last_name: string | null
  phone: string | null
}

interface OrderData {
  id: string
  final_amount: number
  created_at: string
  delivery_method: string
  payment_method: string | null
  delivery_address: { city: string, line1: string } | null
  guest_name: string | null
  guest_phone: string | null
  guest_email: string | null
  user_id: string | null
  status: string
  bonuses_awarded: number
  bonuses_spent: number
  profile: OrderProfile | null
  order_items: OrderItem[]
}

interface GuestCheckoutData {
  id: string
  final_amount: number
  created_at: string
  delivery_method: string
  payment_method: string | null
  delivery_address: { city: string, line1: string } | null
  guest_name: string | null
  guest_phone: string | null
  guest_email: string | null
  status: string
  guest_checkout_items: GuestCheckoutItem[]
}

console.log('✅ Функция notify-order-to-telegram инициализирована')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🔍 === НАЧАЛО ОБРАБОТКИ ЗАКАЗА ===')
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID')

    if (!botToken || !chatId) {
      throw new Error('Отсутствуют TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID')
    }

    // Проверяем источник запроса
    const userAgent = req.headers.get('user-agent') || ''
    const isFromTrigger = userAgent.toLowerCase().includes('pg_net')
    
    console.log(`📨 User-Agent: "${userAgent}"`)
    console.log(`🔍 Запрос от триггера БД: ${isFromTrigger}`)

    if (!isFromTrigger) {
      console.error('❌ Запрос не от триггера БД')
      return new Response(
        JSON.stringify({ error: 'Forbidden - only database triggers allowed' }), 
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      )
    }

    console.log('✅ Запрос от триггера базы данных')

    const payload: OrderPayload = await req.json()
    const orderId = payload.record.id
    const tableName = payload.table || 'orders' // По умолчанию orders для обратной совместимости
    
    console.log(`📦 Обработка заказа: ${orderId}`)
    console.log(`📋 Таблица: ${tableName}`)

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    let orderData: OrderData | null = null
    let orderError: { message: string } | null = null

    // Получаем данные в зависимости от типа заказа
    if (tableName === 'guest_checkouts') {
      // Гостевой заказ
      const result = await supabaseAdmin
        .from('guest_checkouts')
        .select(`
          id, final_amount, created_at, delivery_method, payment_method,
          delivery_address, guest_name, guest_phone, guest_email, status,
          guest_checkout_items(
            quantity, 
            product_id,
            price_per_item,
            product:products(
              id, name, price, sku, barcode
            )
          )
        `)
        .eq('id', orderId)
        .single()
      
      const guestData = result.data as unknown as GuestCheckoutData | null
      orderError = result.error
      
      // Преобразуем структуру гостевого заказа к общему формату
      if (guestData) {
        orderData = {
          id: guestData.id,
          final_amount: guestData.final_amount,
          created_at: guestData.created_at,
          delivery_method: guestData.delivery_method,
          payment_method: guestData.payment_method,
          delivery_address: guestData.delivery_address,
          guest_name: guestData.guest_name,
          guest_phone: guestData.guest_phone,
          guest_email: guestData.guest_email,
          status: guestData.status,
          user_id: null,
          bonuses_awarded: 0,
          bonuses_spent: 0,
          profile: null,
          order_items: guestData.guest_checkout_items.map(item => ({
            quantity: item.quantity,
            product_id: item.product_id,
            product: item.product
          }))
        }
      }
    } else {
      // Заказ авторизованного пользователя
      const result = await supabaseAdmin
        .from('orders')
        .select(`
          id, final_amount, created_at, delivery_method, payment_method,
          delivery_address, user_id, status, bonuses_awarded, bonuses_spent,
          profile:profiles(first_name, last_name, phone),
          order_items(
            quantity, 
            product_id,
            product:products(
              id, name, price, sku, barcode
            )
          )
        `)
        .eq('id', orderId)
        .single()
      
      const userData = result.data as unknown as Omit<OrderData, 'guest_name' | 'guest_phone' | 'guest_email'> | null
      orderError = result.error
      
      // Добавляем пустые гостевые поля для единообразия
      if (userData) {
        orderData = {
          ...userData,
          guest_name: null,
          guest_phone: null,
          guest_email: null
        }
      }
    }

    if (orderError) {
      console.error('❌ Ошибка получения заказа:', orderError)
      throw new Error(`Ошибка получения заказа: ${orderError.message}`)
    }

    if (!orderData) {
      throw new Error(`Заказ ${orderId} не найден в таблице ${tableName}`)
    }

    const typedOrderData = orderData
    console.log(`✅ Заказ получен из таблицы: ${tableName}`)
    console.log(`   User ID: ${typedOrderData.user_id || 'гость'}`)
    console.log(`   Статус: ${typedOrderData.status}`)
    console.log(`   Товаров в заказе: ${typedOrderData.order_items.length}`)

    // Отдельно получаем изображения для каждого товара
    const productIds = typedOrderData.order_items
      .map(item => item.product?.id)
      .filter(Boolean) as string[]

    console.log(`📷 Загрузка изображений для товаров: ${productIds.join(', ')}`)

    const { data: imagesData, error: imagesError } = await supabaseAdmin
      .from('product_images')
      .select('product_id, id, image_url, display_order')
      .in('product_id', productIds)
      .order('display_order', { ascending: true })

    if (imagesError) {
      console.error('⚠️ Ошибка загрузки изображений:', imagesError)
    } else {
      console.log(`✅ Загружено изображений: ${imagesData?.length || 0}`)
      if (imagesData) {
        imagesData.forEach(img => {
          console.log(`   - Товар ${img.product_id}: ${img.image_url}`)
        })
      }
    }

    // Функция для преобразования URL в публичный
    const makePublicUrl = (url: string | null): string | null => {
      if (!url) return null
      
      console.log(`   Преобразование URL: ${url}`)
      
      // Если URL уже содержит полный публичный путь
      if (url.includes('/storage/v1/object/public/')) {
        console.log(`   ✅ URL уже публичный`)
        return url
      }
      
      // Если это signed URL - преобразуем в публичный
      if (url.includes('/storage/v1/object/sign/') || url.includes('/storage/v1/object/authenticated/')) {
        const match = url.match(/\/storage\/v1\/object\/(sign|authenticated)\/([^?]+)/)
        if (match) {
          const bucketAndPath = match[2]
          const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketAndPath}`
          console.log(`   🔄 Преобразован signed URL в: ${publicUrl}`)
          return publicUrl
        }
      }
      
      // Если это полный URL с другим форматом
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const match = url.match(/\/storage\/v1\/object\/[^/]+\/(.+)/)
        if (match) {
          const bucketAndPath = match[1].split('?')[0]
          const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketAndPath}`
          console.log(`   🔄 Преобразован URL в: ${publicUrl}`)
          return publicUrl
        }
        console.log(`   ⚠️ Не удалось распознать формат URL, используем как есть`)
        return url
      }
      
      // Если это относительный путь
      // В таблице product_images хранится: products/uuid/file.webp (БЕЗ имени bucket)
      // Реальный bucket: product-images
      // Правильный URL: https://.../public/product-images/products/uuid/file.webp
      const cleanPath = url.startsWith('/') ? url.slice(1) : url
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/product-images/${cleanPath}`
      console.log(`   🔄 Создан публичный URL: ${publicUrl}`)
      return publicUrl
    }

    // Группируем изображения по product_id с публичными URL
    const imagesByProduct = new Map<string, ProductImage[]>()
    if (imagesData) {
      imagesData.forEach((img) => {
        const publicUrl = makePublicUrl(img.image_url)
        if (publicUrl && !imagesByProduct.has(img.product_id)) {
          imagesByProduct.set(img.product_id, [])
        }
        if (publicUrl) {
          imagesByProduct.get(img.product_id)!.push({
            id: img.id,
            image_url: publicUrl,
            display_order: img.display_order
          })
        }
      })
    }

    // ========================================
    // 📱 ФОРМИРОВАНИЕ И ОТПРАВКА СООБЩЕНИЯ
    // ========================================
    const customerName = typedOrderData.profile?.first_name
      ? `${typedOrderData.profile.first_name} ${typedOrderData.profile.last_name || ''}`.trim()
      : typedOrderData.guest_name || 'Не указано'
    
    const customerPhone = typedOrderData.profile?.phone || typedOrderData.guest_phone || 'Не указан'
    const customerType = typedOrderData.user_id ? '👤 Зарегистрированный' : '👥 Гость'
    
    const orderDate = new Date(typedOrderData.created_at).toLocaleString('ru-RU', { 
      timeZone: 'Asia/Almaty' 
    })

    // Собираем информацию о товарах с изображениями
    const productsWithImages: Array<{ 
      text: string
      imageUrl: string | null 
    }> = []

    typedOrderData.order_items.forEach((item) => {
      const product = item.product
      if (!product) return

      const productName = product.name || 'Неизвестный товар'
      const productPrice = product.price || 0
      
      // Формируем текст с артикулом/штрихкодом
      let itemText = `• ${productName}\n`
      
      if (product.sku) {
        itemText += `  Артикул: \`${product.sku}\`\n`
      }
      if (product.barcode) {
        itemText += `  Штрихкод: \`${product.barcode}\`\n`
      }
      
      itemText += `  Количество: ${item.quantity} шт.\n`
      itemText += `  Цена за шт.: ${productPrice} ₸`

      // Получаем изображения для этого товара
      const productImages = imagesByProduct.get(product.id) || []
      const firstImage = productImages.length > 0 ? productImages[0] : null

      console.log(`🖼️ Товар "${productName}" (${product.id}): ${productImages.length} изображений`)
      if (firstImage) {
        console.log(`   Первое изображение: ${firstImage.image_url}`)
        console.log(`   URL валиден: ${firstImage.image_url.startsWith('http')}`)
      }

      productsWithImages.push({
        text: itemText,
        imageUrl: firstImage?.image_url || null
      })
    })

    // Формируем основное текстовое сообщение
    let messageText = `🔔 *Новый заказ №${orderId.slice(-6)}*\n\n`
    messageText += `*Дата:* ${orderDate}\n`
    messageText += `*Тип:* ${customerType}\n`
    messageText += `*Клиент:* ${customerName}\n`
    messageText += `*Телефон:* \`${customerPhone}\`\n\n`
    messageText += `*Состав заказа:*\n`
    
    // Добавляем информацию о товарах
    productsWithImages.forEach(item => {
      messageText += item.text + '\n\n'
    })

    messageText += `*Итого:* ${typedOrderData.final_amount} ₸\n`
    
    if (typedOrderData.user_id) {
      if (typedOrderData.bonuses_spent > 0) {
        messageText += `💳 *Списано бонусов:* ${typedOrderData.bonuses_spent}\n`
      }
      messageText += `🎁 *Будет начислено бонусов:* ${typedOrderData.bonuses_awarded}\n`
    }
    
    messageText += `*Оплата:* ${typedOrderData.payment_method || 'Не указано'}\n`
    messageText += `*Доставка:* ${typedOrderData.delivery_method === 'courier' ? 'Курьер' : 'Самовывоз'}\n`

    if (typedOrderData.delivery_method === 'courier' && typedOrderData.delivery_address) {
      messageText += `*Адрес:* ${typedOrderData.delivery_address.city}, ${typedOrderData.delivery_address.line1}\n`
    }

    messageText += `\n_Статус: ${typedOrderData.status}_`

    // Кнопки управления заказом
    const adminSecret = Deno.env.get('ADMIN_SECRET')
    const secretParam = adminSecret ? `&secret=${adminSecret}` : ''
    const tableParam = `&table=${tableName}`
    
    const confirmUrl = `${supabaseUrl}/functions/v1/confirm-order?order_id=${orderId}${tableParam}${secretParam}`
    const cancelUrl = `${supabaseUrl}/functions/v1/cancel-order?order_id=${orderId}${tableParam}${secretParam}`

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: '✅ Подтвердить', url: confirmUrl }, 
          { text: '❌ Отменить', url: cancelUrl }
        ],
      ],
    }

    console.log('📤 Отправка в Telegram...')

    // Если есть изображения - отправляем медиа-группу, иначе обычное сообщение
    const imagesWithUrl = productsWithImages.filter(p => p.imageUrl)
    
    console.log(`📊 Статистика изображений:`)
    console.log(`   Всего товаров: ${productsWithImages.length}`)
    console.log(`   Товаров с изображениями: ${imagesWithUrl.length}`)
    
    if (imagesWithUrl.length > 0 && imagesWithUrl.length <= 10) {
      console.log('📸 Попытка отправки медиа-группы...')
      
      // Пробуем загрузить изображения и проверить их доступность
      const validImages: Array<{ imageUrl: string, index: number }> = []
      
      for (let i = 0; i < imagesWithUrl.length; i++) {
        const item = imagesWithUrl[i]
        if (!item.imageUrl) continue
        
        try {
          console.log(`   Проверка изображения ${i + 1}: ${item.imageUrl}`)
          
          // Пробуем загрузить изображение
          const imageResponse = await fetch(item.imageUrl, {
            method: 'HEAD',
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; TelegramBot/1.0)',
            }
          })
          
          if (imageResponse.ok) {
            console.log(`   ✅ Изображение ${i + 1} доступно`)
            validImages.push({ imageUrl: item.imageUrl, index: i })
          } else {
            console.log(`   ❌ Изображение ${i + 1} недоступно: ${imageResponse.status}`)
          }
        } catch (err) {
          console.error(`   ❌ Ошибка проверки изображения ${i + 1}:`, err)
        }
      }
      
      console.log(`   Доступных изображений: ${validImages.length}`)
      
      if (validImages.length > 0) {
        const mediaGroup = validImages.map((item, idx) => ({
          type: 'photo',
          media: item.imageUrl,
          caption: idx === 0 ? messageText : undefined,
          parse_mode: idx === 0 ? 'Markdown' : undefined
        }))

        const mediaResponse = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMediaGroup`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              media: mediaGroup
            }),
          }
        )

        if (!mediaResponse.ok) {
          const errorBody = await mediaResponse.json()
          console.error('❌ Ошибка отправки медиа-группы:', errorBody)
          // Fallback на обычное сообщение
          await sendTextMessage(botToken, chatId, messageText, inlineKeyboard)
        } else {
          console.log('✅ Медиа-группа отправлена')
          // Отправляем кнопки отдельным сообщением
          await sendTextMessage(botToken, chatId, 'Управление заказом:', inlineKeyboard)
        }
      } else {
        console.log('📝 Нет доступных изображений, отправка текстового сообщения')
        await sendTextMessage(botToken, chatId, messageText, inlineKeyboard)
      }
    } else {
      console.log('📝 Отправка текстового сообщения (нет изображений)')
      // Отправляем обычное текстовое сообщение с кнопками
      await sendTextMessage(botToken, chatId, messageText, inlineKeyboard)
    }

    console.log('✅ Уведомление отправлено в Telegram')
    console.log('🎉 Обработка заказа завершена успешно')

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Уведомление отправлено в Telegram',
        orderId,
        customerType: typedOrderData.user_id ? 'registered' : 'guest',
        bonusesAwarded: typedOrderData.bonuses_awarded,
        bonusesSpent: typedOrderData.bonuses_spent,
        productsCount: typedOrderData.order_items.length,
        imagesCount: imagesWithUrl.length
      }), 
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка'
    console.error('❌ Критическая ошибка:', errorMessage)
    console.error('Stack:', error instanceof Error ? error.stack : 'N/A')

    return new Response(
      JSON.stringify({ 
        error: 'Internal Server Error',
        message: errorMessage,
        timestamp: new Date().toISOString()
      }), 
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

// Вспомогательная функция для отправки текстового сообщения
async function sendTextMessage(
  botToken: string, 
  chatId: string, 
  text: string, 
  replyMarkup?: object
) {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        reply_markup: replyMarkup,
      }),
    }
  )

  if (!response.ok) {
    const errorBody = await response.json()
    console.error('❌ Ошибка Telegram API:', errorBody)
    throw new Error(`Ошибка Telegram API: ${errorBody.description}`)
  }

  return response
}