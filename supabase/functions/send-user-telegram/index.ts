const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log('send-user-telegram v1 initialized')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    if (!botToken) {
      console.error('TELEGRAM_BOT_TOKEN not set')
      return new Response(JSON.stringify({ error: 'Bot token not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    const { chat_id, title, body, link } = await req.json()

    if (!chat_id || !title) {
      return new Response(JSON.stringify({ error: 'Missing chat_id or title' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    console.log(`Sending Telegram to chat ${chat_id}: ${title}`)

    // Формируем текст сообщения
    let text = `${title}`
    if (body) {
      text += `\n\n${body}`
    }

    // Формируем inline keyboard с кнопкой-ссылкой
    const replyMarkup = link
      ? {
          inline_keyboard: [
            [{ text: 'Перейти на сайт', url: `https://uhti.kz${link}` }],
          ],
        }
      : undefined

    const telegramBody: Record<string, unknown> = {
      chat_id,
      text,
    }

    if (replyMarkup) {
      telegramBody.reply_markup = replyMarkup
    }

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telegramBody),
      }
    )

    const result = await response.json()

    if (!response.ok) {
      console.error('Telegram API error:', result)

      // Если пользователь заблокировал бота — не считаем ошибкой
      if (result.error_code === 403) {
        console.log('User blocked the bot, skipping')
        return new Response(JSON.stringify({ sent: false, reason: 'blocked' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ error: result.description }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    console.log('Telegram message sent successfully')
    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('send-user-telegram error:', error)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
