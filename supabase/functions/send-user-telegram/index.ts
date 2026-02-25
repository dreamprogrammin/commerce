const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log('send-user-telegram v3 initialized')

interface Photo {
  url: string
  caption?: string
}

interface Button {
  text: string
  url: string
}

interface RequestBody {
  chat_id: number | string
  title: string
  body?: string
  photos?: Photo[]
  buttons?: Button[]
}

function buildInlineKeyboard(buttons: Button[]) {
  return {
    inline_keyboard: [buttons.map(b => ({ text: b.text, url: b.url }))],
  }
}

async function isUrlAccessible(url: string): Promise<boolean> {
  try {
    const resp = await fetch(url, { method: 'HEAD' })
    return resp.ok
  } catch {
    return false
  }
}

async function telegramApi(botToken: string, method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json()
  return { ok: response.ok, result }
}

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

    const { chat_id, title, body, photos, buttons }: RequestBody = await req.json()

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

    const replyMarkup = buttons?.length ? buildInlineKeyboard(buttons) : undefined

    // Если есть фото — пробуем отправить с фото
    const validPhotos: Photo[] = []
    if (photos?.length) {
      // Проверяем доступность фото (HEAD-запрос)
      const checks = await Promise.all(
        photos.slice(0, 10).map(async (p) => ({
          ...p,
          accessible: await isUrlAccessible(p.url),
        }))
      )
      for (const check of checks) {
        if (check.accessible) {
          validPhotos.push({ url: check.url, caption: check.caption })
        } else {
          console.warn(`Photo not accessible: ${check.url}`)
        }
      }
    }

    let sent = false

    if (validPhotos.length === 1) {
      // Одно фото → sendPhoto с caption + inline keyboard
      const { ok, result } = await telegramApi(botToken, 'sendPhoto', {
        chat_id,
        photo: validPhotos[0].url,
        caption: text,
        ...(replyMarkup && { reply_markup: replyMarkup }),
      })

      if (ok) {
        sent = true
      } else {
        console.warn('sendPhoto failed, falling back to text:', result)
      }
    } else if (validPhotos.length >= 2) {
      // Несколько фото → sendMediaGroup (caption на первом) + отдельное сообщение с кнопками
      const media = validPhotos.slice(0, 10).map((p, i) => ({
        type: 'photo',
        media: p.url,
        ...(i === 0 && { caption: text }),
      }))

      const { ok, result } = await telegramApi(botToken, 'sendMediaGroup', {
        chat_id,
        media,
      })

      if (ok) {
        sent = true
        // Кнопки отдельным сообщением (sendMediaGroup не поддерживает inline keyboard)
        if (replyMarkup) {
          await telegramApi(botToken, 'sendMessage', {
            chat_id,
            text: '👇 Перейдите по ссылке:',
            reply_markup: replyMarkup,
          })
        }
      } else {
        console.warn('sendMediaGroup failed, falling back to text:', result)
      }
    }

    // Fallback на текстовое сообщение (если фото нет или не удалось отправить)
    if (!sent) {
      const { ok, result } = await telegramApi(botToken, 'sendMessage', {
        chat_id,
        text,
        ...(replyMarkup && { reply_markup: replyMarkup }),
      })

      if (!ok) {
        console.error('Telegram API error:', result)

        // Если пользователь заблокировал бота — не считаем ошибкой
        if (result.result?.error_code === 403 || result.error_code === 403) {
          console.log('User blocked the bot, skipping')
          return new Response(JSON.stringify({ sent: false, reason: 'blocked' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        return new Response(JSON.stringify({ error: result.result?.description || 'Telegram API error' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        })
      }
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
