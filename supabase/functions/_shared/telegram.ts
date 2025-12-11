export interface TelegramConfig {
  botToken: string
  chatId: string
}

export function getTelegramConfig(): TelegramConfig {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID')

  if (!botToken || !chatId) {
    throw new Error('Отсутствуют TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID')
  }

  return { botToken, chatId }
}

export async function sendTelegramMessage(
  config: TelegramConfig,
  text: string,
  replyMarkup?: Record<string, unknown>
): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${config.botToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: replyMarkup,
      }),
    }
  )

  if (!response.ok) {
    const errorBody = await response.json()
    throw new Error(`Telegram API error: ${errorBody.description || 'Unknown error'}`)
  }
}
