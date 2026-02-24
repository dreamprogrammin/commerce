import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log('Telegram webhook v6 initialized')

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
    console.log('📩 Incoming update:', JSON.stringify(update))

    const message = update.message
    if (!message) {
      console.log('No message in update, skipping')
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const chatId = message.chat.id
    const messageId = message.message_id
    console.log(`💬 chat_id=${chatId}, message_id=${messageId}, text="${message.text || ''}"`)

    // === /setup — одноразовая команда для настройки бота (webhook, описание, команды) ===
    if (message.text?.trim() === '/setup') {
      console.log('🔧 Running bot setup...')
      const baseUrl = `https://api.telegram.org/bot${botToken}`
      const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook`

      const results: string[] = []

      // Webhook
      try {
        const r = await fetch(`${baseUrl}/setWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: webhookUrl }),
        })
        const res = await r.json()
        results.push(`Webhook: ${res.ok ? '✅' : '❌'} ${res.description || ''}`)
      } catch (e) { results.push(`Webhook: ❌ ${e}`) }

      // Команды
      try {
        const r = await fetch(`${baseUrl}/setMyCommands`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            commands: [
              { command: 'start', description: '🧸 Приветствие от Ухтышки' },
              { command: 'unlink', description: '🔓 Отвязать Telegram от аккаунта' },
            ],
          }),
        })
        const res = await r.json()
        results.push(`Commands: ${res.ok ? '✅' : '❌'}`)
      } catch (e) { results.push(`Commands: ❌ ${e}`) }

      // Описание
      try {
        const r = await fetch(`${baseUrl}/setMyDescription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: '🧸 Ухтышка — магазин детских игрушек в Алматы!\n\n🎁 Бонусная программа\n📦 Уведомления о заказах\n🔥 Акции и скидки\n\nНажмите START, чтобы начать!',
          }),
        })
        const res = await r.json()
        results.push(`Description: ${res.ok ? '✅' : '❌'}`)
      } catch (e) { results.push(`Description: ❌ ${e}`) }

      // Короткое описание
      try {
        const r = await fetch(`${baseUrl}/setMyShortDescription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            short_description: '🧸 Магазин детских игрушек — заказы, бонусы, акции | uhti.kz',
          }),
        })
        const res = await r.json()
        results.push(`Short desc: ${res.ok ? '✅' : '❌'}`)
      } catch (e) { results.push(`Short desc: ❌ ${e}`) }

      const report = `🔧 Setup complete:\n\n${results.join('\n')}`
      console.log(report)
      await sendPlainMessage(botToken, chatId, report)

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Если пользователь прислал стикер — игнорируем (бот только для уведомлений)
    if (!message.text) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const text = message.text.trim()

    // /start {code} — привязка аккаунта
    if (text.startsWith('/start ')) {
      const code = text.replace('/start ', '').trim()
      console.log(`🔗 /start with code: ${code}`)

      if (!code) {
        await sendPlainMessage(botToken, chatId, 'Код привязки не указан. Попробуйте получить новую ссылку в личном кабинете на сайте uhti.kz')
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
        console.log('Code not found or expired, showing welcome:', code, codeError?.message)
        // Код невалидный — удаляем команду и показываем приветствие
        await deleteMessage(botToken, chatId, messageId)
        await sendWelcome(botToken, chatId)
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
          await sendPlainMessage(botToken, chatId, 'Этот Telegram аккаунт уже привязан к другому профилю. Сначала отвяжите его в настройках профиля.')
        } else {
          await sendPlainMessage(botToken, chatId, 'Произошла ошибка при привязке. Попробуйте позже.')
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Удаляем использованный код и все другие коды
      await supabase.from('telegram_link_codes').delete().eq('id', linkCode.id)
      await supabase.from('telegram_link_codes').delete().eq('user_id', linkCode.user_id)

      // Удаляем /start из чата
      await deleteMessage(botToken, chatId, messageId)

      await sendPlainMessage(
        botToken,
        chatId,
        '👋 Привет!\n\n✅ Telegram успешно привязан!\n\n🎉 Теперь вы будете получать:\n📦 Статус ваших заказов\n💰 Начисление бонусов\n🔥 Акции и новинки\n\n🛍 Приятных покупок на uhti.kz!'
      )

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // /start без кода — приветствие
    if (text === '/start') {
      console.log('👋 /start without code — showing welcome')
      await deleteMessage(botToken, chatId, messageId)
      await sendWelcome(botToken, chatId)
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // /unlink — отвязка аккаунта
    if (text === '/unlink') {
      console.log('🔓 /unlink command')
      const { error } = await supabase
        .from('profiles')
        .update({ telegram_chat_id: null })
        .eq('telegram_chat_id', chatId)

      if (error) {
        console.error('Error unlinking:', error)
        await sendPlainMessage(botToken, chatId, 'Произошла ошибка при отвязке. Попробуйте позже.')
      } else {
        await sendPlainMessage(botToken, chatId, 'Telegram отвязан от аккаунта. Вы больше не будете получать уведомления.\n\nЧтобы привязать снова, используйте ссылку из личного кабинета на uhti.kz')
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Любое другое сообщение — справка
    await sendPlainMessage(
      botToken,
      chatId,
      '🧸 Ухтышка — магазин детских игрушек\n\n📋 Команды:\n/start — Приветствие\n/unlink — Отвязать аккаунт\n\n📱 Подключение: uhti.kz → Профиль → Настройки → Подключить Telegram'
    )

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('❌ Telegram webhook error:', error)
    // Всегда возвращаем 200 для Telegram, чтобы не было повторных запросов
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// === Вспомогательные функции ===

async function sendPlainMessage(botToken: string, chatId: number, text: string) {
  try {
    console.log(`📤 sendPlainMessage to ${chatId}: ${text.slice(0, 50)}...`)
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      }
    )
    const result = await response.json()
    if (!result.ok) {
      console.error('❌ sendPlainMessage failed:', result)
    } else {
      console.log('✅ Message sent')
    }
    return result
  } catch (error) {
    console.error('❌ sendPlainMessage error:', error)
    return null
  }
}

async function deleteMessage(botToken: string, chatId: number, messageId: number) {
  try {
    console.log(`🗑 deleteMessage: chat_id=${chatId}, message_id=${messageId}`)
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/deleteMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
        }),
      }
    )
    const result = await response.json()
    if (!result.ok) {
      console.error('❌ deleteMessage failed:', result)
    } else {
      console.log('✅ Message deleted successfully')
    }
    return result
  } catch (error) {
    console.error('❌ deleteMessage error:', error)
    return null
  }
}

async function sendWelcome(botToken: string, chatId: number) {
  console.log(`🏠 sendWelcome to ${chatId}`)

  const welcomeText = [
    '👋 Привет!',
    '🧸 Добро пожаловать в Ухтышка!',
    'Мы — магазин детских игрушек в Алматы 🏙',
    '',
    'Здесь вы будете получать:',
    '📦 Статусы заказов',
    '💰 Начисление бонусов',
    '🔥 Информацию об акциях и скидках',
    '',
    'Чтобы подключить уведомления, привяжите',
    'Telegram в личном кабинете на uhti.kz',
  ].join('\n')

  await sendPlainMessage(botToken, chatId, welcomeText)
  console.log('🏠 sendWelcome completed')
}
