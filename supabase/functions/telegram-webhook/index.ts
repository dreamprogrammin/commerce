import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ACTION_FUNCTIONS, parseCallbackData } from '../_shared/orderActions.ts'

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

    /*
     * Нажатие кнопки под карточкой заказа.
     *
     * Раньше кнопки были ссылками на эдж-функции, и это уводило оператора в
     * браузер, светило ADMIN_SECRET в чате и не давало узнать, КТО нажал —
     * все заказы записывались на «Админ». Подробности в _shared/orderActions.ts.
     */
    if (update.callback_query) {
      await handleOrderAction(update.callback_query, botToken, supabaseUrl)
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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
          // `allowed_updates` указан явно: без него список берётся тот, что
          // остался от прошлой настройки, а нажатия кнопок под карточкой
          // заказа приходят именно как callback_query. Молча потерять их —
          // значит получить чат, где кнопки не работают вовсе.
          body: JSON.stringify({
            url: webhookUrl,
            allowed_updates: ['message', 'callback_query'],
          }),
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


/**
 * Имя оператора для записи в заказ: «Айгуль Смагулова» или «Айгуль».
 * Ник хранится отдельно — по нему в чате можно позвать человека.
 */
function operatorName(from: { first_name?: string; last_name?: string; username?: string }): string {
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ').trim()
  return name || from.username || 'Оператор'
}

/**
 * Всплывающая плашка над чатом. Telegram даёт на неё 200 знаков, а функции
 * отвечают многострочным текстом вроде «✅ ЗАКАЗ ПОДТВЕРЖДЁН\n\nНомер: …» —
 * поэтому берём первые непустые строки и обрезаем.
 */
function toToast(text: string): string {
  const clean = text.replace(/\*/g, '').split('\n').map(l => l.trim()).filter(Boolean)
  const joined = clean.slice(0, 2).join(' · ')
  return joined.length > 195 ? `${joined.slice(0, 195)}…` : joined
}

async function answerCallback(
  botToken: string,
  callbackQueryId: string,
  text: string,
  showAlert = false,
): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    }),
  })
}

/**
 * Выполняет действие с заказом от имени нажавшего.
 *
 * Работу делают те же эдж-функции, что и раньше (assign/confirm/ship/deliver/
 * cancel) — логика, проверки и уведомления покупателю не дублируются. Меняется
 * только вход: секрет берётся из окружения ЗДЕСЬ, на сервере, и в чат больше
 * не попадает; имя и ник оператора приходят из самого нажатия.
 *
 * Карточку заказа перерисовывать не нужно: смена статуса поднимает триггер
 * sync-order-status-to-telegram, и он обновляет сообщение на месте.
 */
async function handleOrderAction(
  callbackQuery: {
    id: string
    data?: string
    from: { id: number; first_name?: string; last_name?: string; username?: string }
    message?: { chat?: { id: number | string } }
  },
  botToken: string,
  supabaseUrl: string,
): Promise<void> {
  const parsed = callbackQuery.data ? parseCallbackData(callbackQuery.data) : null
  if (!parsed) {
    console.warn('Не разобрать callback_data:', callbackQuery.data)
    await answerCallback(botToken, callbackQuery.id, 'Не удалось разобрать кнопку')
    return
  }

  /*
   * Управлять заказами можно только из рабочего чата.
   *
   * Без этой проверки бот, добавленный в любой другой чат, выполнял бы
   * команды кого угодно: `callback_data` виден в разметке сообщения, а
   * подделать его несложно. Список менеджеров при этом вести не нужно —
   * им служит состав рабочего чата.
   */
  const adminChatId = Deno.env.get('TELEGRAM_CHAT_ID')
  const fromChatId = String(callbackQuery.message?.chat?.id ?? '')
  if (!adminChatId || fromChatId !== String(adminChatId)) {
    console.warn(`Действие из чужого чата: ${fromChatId}`)
    await answerCallback(botToken, callbackQuery.id, 'Управлять заказами можно только из рабочего чата', true)
    return
  }

  const adminSecret = Deno.env.get('ADMIN_SECRET') ?? ''
  const name = operatorName(callbackQuery.from)

  const params = new URLSearchParams({
    order_id: parsed.orderId,
    table: parsed.table,
    admin_name: name,
  })
  if (callbackQuery.from.username)
    params.set('admin_username', callbackQuery.from.username)
  if (adminSecret)
    params.set('secret', adminSecret)

  const fn = ACTION_FUNCTIONS[parsed.action]
  console.log(`🔘 ${name} → ${fn} для заказа ${parsed.orderId}`)

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${fn}?${params}`)
    const body = await res.text()
    console.log(`   ответ ${res.status}: ${body.slice(0, 200)}`)
    // Ошибку показываем «алертом»: её надо прочитать, а не проморгать.
    await answerCallback(botToken, callbackQuery.id, toToast(body), !res.ok)
  }
  catch (e) {
    console.error('Ошибка вызова функции:', e)
    await answerCallback(botToken, callbackQuery.id, 'Не получилось — попробуйте ещё раз', true)
  }
}
