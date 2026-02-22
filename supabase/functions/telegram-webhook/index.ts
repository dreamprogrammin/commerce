import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log('Telegram webhook v4 initialized')

// Стикер "машет привет". Чтобы заменить:
// отправьте боту любой стикер → бот ответит file_id → вставьте сюда
const WELCOME_STICKER = 'CAACAgIAAxkBAAEMk2tnuH-VAAHRdGfhZDqkrCvNHr5uqnMAAgEBAAJWnb0KIoz4oeejx_g2BA'

// === Настройка бота при холодном старте ===
const setupToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
if (setupToken) {
  const baseUrl = `https://api.telegram.org/bot${setupToken}`

  // Команды меню
  fetch(`${baseUrl}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commands: [
        { command: 'start', description: '🧸 Начать — привет от Ухтышки!' },
        { command: 'unlink', description: '🔓 Отвязать Telegram от аккаунта' },
      ],
    }),
  }).then(() => console.log('✅ Bot commands set'))
    .catch(e => console.error('Bot commands setup error:', e))

  // Описание бота (видно при первом открытии чата, над кнопкой START)
  fetch(`${baseUrl}/setMyDescription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: '🧸 Ухтышка — магазин детских игрушек в Алматы!\n\n🎁 Бонусная программа\n📦 Уведомления о заказах\n🔥 Акции и скидки\n\nНажмите START, чтобы начать!',
    }),
  }).then(() => console.log('✅ Bot description set'))
    .catch(e => console.error('Bot description setup error:', e))

  // Короткое описание (в поиске и профиле бота)
  fetch(`${baseUrl}/setMyShortDescription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      short_description: '🧸 Магазин детских игрушек — заказы, бонусы, акции | uhti.kz',
    }),
  }).then(() => console.log('✅ Bot short description set'))
    .catch(e => console.error('Bot short description setup error:', e))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const update = await req.json()
    console.log('Incoming Telegram update:', JSON.stringify(update))

    const message = update.message
    if (!message) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const chatId = message.chat.id

    // Если пользователь прислал стикер — отвечаем его file_id (удобно для настройки)
    if (message.sticker) {
      await sendMessage(
        botToken,
        chatId,
        `📎 file\\_id этого стикера:\n\n\`${message.sticker.file_id}\`\n\nСкопируйте и вставьте в WELCOME\\_STICKER`
      )
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!message.text) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const text = message.text.trim()

    // /start {code} — привязка аккаунта
    if (text.startsWith('/start ')) {
      const code = text.replace('/start ', '').trim()

      if (!code) {
        await sendMessage(botToken, chatId, 'Код привязки не указан. Попробуйте получить новую ссылку в личном кабинете на сайте uhti.kz')
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Ищем код в таблице
      const { data: linkCode, error: codeError } = await supabase
        .from('telegram_link_codes')
        .select('*')
        .eq('code', code)
        .gt('expires_at', new Date().toISOString())
        .single()

      if (codeError || !linkCode) {
        console.log('Link code not found or expired:', code, codeError)
        await sendMessage(botToken, chatId, 'Код привязки недействителен или истёк. Попробуйте получить новый код в личном кабинете на сайте uhti.kz')
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Привязываем telegram_chat_id к профилю
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ telegram_chat_id: chatId })
        .eq('id', linkCode.user_id)

      if (updateError) {
        console.error('Error updating profile:', updateError)
        if (updateError.code === '23505') {
          await sendMessage(botToken, chatId, 'Этот Telegram аккаунт уже привязан к другому профилю. Сначала отвяжите его в настройках профиля.')
        } else {
          await sendMessage(botToken, chatId, 'Произошла ошибка при привязке. Попробуйте позже.')
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Удаляем использованный код
      await supabase
        .from('telegram_link_codes')
        .delete()
        .eq('id', linkCode.id)

      // Удаляем все другие коды этого пользователя
      await supabase
        .from('telegram_link_codes')
        .delete()
        .eq('user_id', linkCode.user_id)

      await sendMessage(
        botToken,
        chatId,
        '✅ Telegram успешно привязан!\n\n🎉 Теперь вы будете получать:\n📦 Статус ваших заказов\n💰 Начисление бонусов\n🔥 Акции и новинки\n\n🛍 Приятных покупок на uhti.kz!'
      )

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // /start без кода — приветствие со стикером + кнопками
    if (text === '/start') {
      // 1. Отправляем стикер "машет привет"
      await sendSticker(botToken, chatId, WELCOME_STICKER)

      // 2. Красивое приветственное сообщение с кнопками
      const welcomeText = [
        '🧸 *Добро пожаловать в Ухтышка\\!*',
        '',
        'Мы — магазин детских игрушек в Алматы 🏙',
        '',
        '✨ Привяжите аккаунт и получайте:',
        '📦 Статус ваших заказов',
        '💰 Начисление бонусов',
        '🔥 Акции и скидки',
        '',
        '👇 Нажмите кнопку ниже, чтобы начать\\!',
      ].join('\n')

      const keyboard = {
        inline_keyboard: [
          [{ text: '🛍 Перейти в магазин', url: 'https://uhti.kz' }],
          [{ text: '👤 Привязать аккаунт', url: 'https://uhti.kz/profile/settings' }],
        ],
      }

      await sendMessageWithKeyboard(botToken, chatId, welcomeText, keyboard)

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // /unlink — отвязка аккаунта
    if (text === '/unlink') {
      const { error } = await supabase
        .from('profiles')
        .update({ telegram_chat_id: null })
        .eq('telegram_chat_id', chatId)

      if (error) {
        console.error('Error unlinking:', error)
        await sendMessage(botToken, chatId, 'Произошла ошибка при отвязке. Попробуйте позже.')
      } else {
        await sendMessage(botToken, chatId, 'Telegram отвязан от аккаунта. Вы больше не будете получать уведомления.\n\nЧтобы привязать снова, используйте ссылку из личного кабинета на uhti.kz')
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Любое другое сообщение — справка
    await sendMessage(
      botToken,
      chatId,
      '🧸 *Ухтышка* — магазин детских игрушек\n\n📋 Команды:\n/start — Привязать аккаунт\n/unlink — Отвязать аккаунт\n\n📱 Привязка: uhti.kz → Профиль → Настройки → Подключить Telegram'
    )

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Telegram webhook error:', error)
    // Всегда возвращаем 200 для Telegram, чтобы не было повторных запросов
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function sendMessage(botToken: string, chatId: number, text: string) {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
        }),
      }
    )

    const result = await response.json()
    if (!response.ok) {
      console.error('Failed to send message:', result)
    }
    return result
  } catch (error) {
    console.error('Error sending message:', error)
  }
}

async function sendSticker(botToken: string, chatId: number, stickerId: string) {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendSticker`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          sticker: stickerId,
        }),
      }
    )

    const result = await response.json()
    if (!response.ok) {
      console.error('Failed to send sticker:', result)
    }
    return result
  } catch (error) {
    console.error('Error sending sticker:', error)
  }
}

async function sendMessageWithKeyboard(botToken: string, chatId: number, text: string, replyMarkup: object) {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'MarkdownV2',
          reply_markup: replyMarkup,
        }),
      }
    )

    const result = await response.json()
    if (!response.ok) {
      console.error('Failed to send message with keyboard:', result)
    }
    return result
  } catch (error) {
    console.error('Error sending message with keyboard:', error)
  }
}
