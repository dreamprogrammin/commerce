/**
 * Утилиты для работы с Telegram Bot API
 */

/**
 * Обновляет текст сообщения в Telegram
 * @param botToken - Токен Telegram бота
 * @param chatId - ID чата
 * @param messageId - ID сообщения для обновления
 * @param newText - Новый текст сообщения
 * @param parseMode - Режим парсинга (Markdown, HTML)
 * @returns Promise с результатом обновления
 */
export async function updateTelegramMessage(
  botToken: string,
  chatId: string,
  messageId: string,
  newText: string,
  parseMode: 'Markdown' | 'HTML' = 'Markdown'
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`📝 Обновление Telegram сообщения ${messageId}...`)

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/editMessageText`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: parseInt(messageId),
          text: newText,
          parse_mode: parseMode,
        }),
      }
    )

    const result = await response.json()

    if (!response.ok) {
      console.error('❌ Ошибка обновления Telegram сообщения:', result)
      return {
        success: false,
        error: result.description || 'Unknown error'
      }
    }

    console.log('✅ Telegram сообщение обновлено успешно')
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('❌ Критическая ошибка при обновлении Telegram:', errorMessage)
    return {
      success: false,
      error: errorMessage
    }
  }
}

/**
 * Обновляет inline-кнопки в сообщении
 * @param botToken - Токен Telegram бота
 * @param chatId - ID чата
 * @param messageId - ID сообщения
 * @param buttons - Массив кнопок (inline_keyboard)
 * @returns Promise с результатом
 */
export async function updateMessageButtons(
  botToken: string,
  chatId: string,
  messageId: string,
  buttons: any[][]
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`🔘 Обновление кнопок в сообщении ${messageId}...`)

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: parseInt(messageId),
          reply_markup: { inline_keyboard: buttons }
        }),
      }
    )

    const result = await response.json()

    if (!response.ok) {
      console.error('❌ Ошибка обновления кнопок:', result)
      return {
        success: false,
        error: result.description || 'Unknown error'
      }
    }

    console.log('✅ Кнопки обновлены')
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('❌ Критическая ошибка при обновлении кнопок:', errorMessage)
    return {
      success: false,
      error: errorMessage
    }
  }
}

/**
 * Удаляет inline-кнопки из сообщения (делает их неактивными)
 * @param botToken - Токен Telegram бота
 * @param chatId - ID чата
 * @param messageId - ID сообщения
 * @returns Promise с результатом
 */
export async function removeMessageButtons(
  botToken: string,
  chatId: string,
  messageId: string
): Promise<{ success: boolean; error?: string }> {
  return updateMessageButtons(botToken, chatId, messageId, [])
}

/**
 * Отправляет текстовое уведомление в чат
 * @param botToken - Токен Telegram бота
 * @param chatId - ID чата
 * @param text - Текст сообщения
 * @param parseMode - Режим парсинга
 * @returns Promise с результатом
 */
export async function sendTelegramNotification(
  botToken: string,
  chatId: string,
  text: string,
  parseMode: 'Markdown' | 'HTML' = 'Markdown'
): Promise<{ success: boolean; error?: string; messageId?: number }> {
  try {
    console.log('📤 Отправка уведомления в Telegram...')

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: parseMode,
        }),
      }
    )

    const result = await response.json()

    if (!response.ok) {
      console.error('❌ Ошибка отправки уведомления:', result)
      return {
        success: false,
        error: result.description || 'Unknown error'
      }
    }

    console.log('✅ Уведомление отправлено')
    return {
      success: true,
      messageId: result.result?.message_id
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('❌ Критическая ошибка при отправке уведомления:', errorMessage)
    return {
      success: false,
      error: errorMessage
    }
  }
}
