import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log('Telegram webhook v1 initialized')

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
    if (!message || !message.text) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const chatId = message.chat.id
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
        'Telegram успешно привязан к вашему аккаунту на uhti.kz!\n\nТеперь вы будете получать уведомления о:\n- Статусе ваших заказов\n- Начислении бонусов\n- Акциях и новинках'
      )

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // /start без кода — приветствие
    if (text === '/start') {
      await sendMessage(
        botToken,
        chatId,
        'Добро пожаловать в бот uhti.kz!\n\nЧтобы получать уведомления о заказах и бонусах, привяжите свой аккаунт:\n\n1. Зайдите в личный кабинет на uhti.kz\n2. Откройте настройки профиля\n3. Нажмите "Подключить Telegram"\n4. Перейдите по ссылке'
      )
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
      'Это бот магазина uhti.kz\n\nДоступные команды:\n/start — Привязать аккаунт\n/unlink — Отвязать аккаунт\n\nДля привязки перейдите в личный кабинет на uhti.kz → Настройки → Подключить Telegram'
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
