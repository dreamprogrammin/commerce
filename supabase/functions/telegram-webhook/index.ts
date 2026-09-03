import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ACTION_FUNCTIONS, buildOrderKeyboard, parseCallbackData } from '../_shared/orderActions.ts'
import {
  ACTIVE_STATUSES,
  orderCardMessage,
  orderListMessage,
  shortNumber,
  type OrderSummary,
} from '../_shared/orderCard.ts'
import {
  buildCardKeyboard,
  buildListKeyboard,
  buildPanelKeyboard,
  buildReplyKeyboard,
  LIST_TITLES,
  type MenuScope,
  PANEL_TEXT,
  parseMenuData,
  replyButtonScope,
} from '../_shared/orderMenu.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log('Telegram webhook v6 initialized')

/**
 * Адрес Bot API. Переопределяется переменной окружения — только ради
 * локальной проверки: заглушка вместо Telegram позволяет увидеть, что бот
 * отправил бы в чат, не трогая настоящего бота (check-telegram-commands.mjs).
 * В проде переменная не задана, и запросы идут на api.telegram.org.
 */
function telegramApiBase(): string {
  return Deno.env.get('TELEGRAM_API_BASE') ?? 'https://api.telegram.org'
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
    console.log('📩 Incoming update:', JSON.stringify(update))

    /*
     * Нажатие кнопки под карточкой заказа.
     *
     * Раньше кнопки были ссылками на эдж-функции, и это уводило оператора в
     * браузер, светило ADMIN_SECRET в чате и не давало узнать, КТО нажал —
     * все заказы записывались на «Админ». Подробности в _shared/orderActions.ts.
     */
    if (update.callback_query) {
      // Сначала навигация по панели, потом действия под уведомлением о заказе.
      const handledByMenu = await handleMenuTap(
        update.callback_query,
        botToken,
        supabaseUrl,
        supabase,
      )
      if (!handledByMenu)
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
      const baseUrl = `${telegramApiBase()}/bot${botToken}`
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

      /*
       * Команды менеджера — отдельным списком и только для рабочего чата.
       * Через `scope: chat` они не попадают в меню покупателей: те пишут боту
       * в личку, и «активные заказы» им там ни к чему.
       */
      try {
        const managerChatId = Deno.env.get('TELEGRAM_CHAT_ID')
        if (managerChatId) {
          const r = await fetch(`${baseUrl}/setMyCommands`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scope: { type: 'chat', chat_id: Number(managerChatId) },
              commands: [
                { command: 'panel', description: '🧭 Панель заказов' },
                { command: 'orders', description: '📋 Активные заказы' },
                { command: 'my', description: '👤 Мои заказы' },
                { command: 'order', description: '🔍 Заказ по номеру: /order 5e4fc2' },
              ],
            }),
          })
          const res = await r.json()
          results.push(`Команды менеджера: ${res.ok ? '✅' : '❌'} ${res.description || ''}`)
        }
        else {
          results.push('Команды менеджера: ⚠️ не задан TELEGRAM_CHAT_ID')
        }
      } catch (e) { results.push(`Команды менеджера: ❌ ${e}`) }

      /*
       * Постоянная клавиатура в рабочем чате — «кнопки по умолчанию».
       * Ставится прямо здесь, чтобы после `/setup` менеджерам не пришлось
       * ничего вызывать: открыл чат — кнопки уже под полем ввода.
       */
      try {
        const managerChatId = Deno.env.get('TELEGRAM_CHAT_ID')
        if (managerChatId) {
          const r = await fetch(`${baseUrl}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: managerChatId,
              text: 'Кнопки заказов под полем ввода — нажимайте, ничего вводить не нужно.',
              reply_markup: buildReplyKeyboard(),
            }),
          })
          const res = await r.json()
          results.push(`Кнопки в чате: ${res.ok ? '✅' : '❌'} ${res.description || ''}`)
        }
      } catch (e) { results.push(`Кнопки в чате: ❌ ${e}`) }

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

    /*
     * Команды менеджера. Работают ТОЛЬКО в рабочем чате: в личке бот
     * обслуживает покупателей, и там же лежат их /start и /unlink. Разводить
     * по чату, а не по списку людей, — то же решение, что и для кнопок:
     * состав рабочего чата и есть список менеджеров.
     */
    const adminChatId = Deno.env.get('TELEGRAM_CHAT_ID')
    if (adminChatId && String(chatId) === String(adminChatId)) {
      const handled = await handleManagerCommand(
        text,
        chatId,
        botToken,
        supabase,
        message.from,
        messageId,
      )
      if (handled) {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

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
      `${telegramApiBase()}/bot${botToken}/sendMessage`,
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
      `${telegramApiBase()}/bot${botToken}/deleteMessage`,
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
  await fetch(`${telegramApiBase()}/bot${botToken}/answerCallbackQuery`, {
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

  const result = await runOrderAction(
    parsed.action,
    parsed.table,
    parsed.orderId,
    callbackQuery.from,
    supabaseUrl,
  )
  // Ошибку показываем «алертом»: её надо прочитать, а не проморгать.
  await answerCallback(botToken, callbackQuery.id, result.toast, !result.ok)
}

/**
 * Зовёт эдж-функцию действия от имени нажавшего и возвращает готовый текст
 * для всплывающей плашки.
 *
 * Один вызов на два пути: кнопки под уведомлением о заказе и кнопки на
 * карточке в панели. Логика, проверки и уведомления покупателю живут в самих
 * функциях (assign/confirm/ship/deliver/cancel) и здесь не дублируются.
 */
async function runOrderAction(
  action: keyof typeof ACTION_FUNCTIONS,
  table: string,
  orderId: string,
  from: { first_name?: string; last_name?: string; username?: string },
  supabaseUrl: string,
): Promise<{ ok: boolean; toast: string }> {
  const adminSecret = Deno.env.get('ADMIN_SECRET') ?? ''
  const name = operatorName(from)

  const params = new URLSearchParams({ order_id: orderId, table, admin_name: name })
  if (from.username)
    params.set('admin_username', from.username)
  if (adminSecret)
    params.set('secret', adminSecret)

  const fn = ACTION_FUNCTIONS[action]
  console.log(`🔘 ${name} → ${fn} для заказа ${orderId}`)

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${fn}?${params}`)
    const body = await res.text()
    console.log(`   ответ ${res.status}: ${body.slice(0, 200)}`)
    return { ok: res.ok, toast: toToast(body) }
  }
  catch (e) {
    console.error('Ошибка вызова функции:', e)
    return { ok: false, toast: 'Не получилось — попробуйте ещё раз' }
  }
}


/**
 * Отправка с разметкой и (по желанию) кнопками. `sendPlainMessage` рядом
 * шлёт без разметки — она для покупателя, где Markdown только мешает.
 */
async function sendRichMessage(
  botToken: string,
  chatId: number,
  text: string,
  replyMarkup?: unknown,
): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
  }
  if (replyMarkup)
    body.reply_markup = replyMarkup

  const res = await fetch(`${telegramApiBase()}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await res.json()
  if (!result.ok)
    console.error('sendRichMessage failed:', JSON.stringify(result))
}

/** Заказы из обеих таблиц одним списком: гостевые лежат отдельно от обычных. */
async function fetchOrders(
  supabase: ReturnType<typeof createClient>,
  filter: (query: any) => any,
): Promise<OrderSummary[]> {
  const columns
    = 'id, status, final_amount, created_at, delivery_method, delivery_address, comment, assigned_admin_name, assigned_admin_username'

  const [users, guests] = await Promise.all([
    filter(supabase.from('orders').select(`${columns}, customer_name, customer_phone`)),
    filter(supabase.from('guest_checkouts').select(`${columns}, guest_name, guest_phone`)),
  ])

  if (users.error)
    console.error('Ошибка выборки orders:', users.error.message)
  if (guests.error)
    console.error('Ошибка выборки guest_checkouts:', guests.error.message)

  return [
    ...(users.data ?? []).map((o: any) => ({ ...o, table: 'orders' })),
    ...(guests.data ?? []).map((o: any) => ({ ...o, table: 'guest_checkouts' })),
  ].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
}

/**
 * Команды менеджера в рабочем чате. Возвращает `true`, если команда узнана, —
 * тогда покупательские ветки ниже не выполняются.
 *
 * Зачем они. Раньше найти заказ можно было только прокруткой чата: карточки
 * приходят лентой и теряются среди переписки. Отсюда три команды — что горит
 * прямо сейчас, что взял лично я, и «покажи вот этот заказ».
 */
async function handleManagerCommand(
  text: string,
  chatId: number,
  botToken: string,
  supabase: ReturnType<typeof createClient>,
  from?: { first_name?: string; last_name?: string; username?: string },
  messageId?: number,
): Promise<boolean> {
  /*
   * Нажатие постоянной клавиатуры приходит обычным текстом. Разбираем его до
   * команд и сразу удаляем сообщение: иначе чат зарастёт строчками
   * «📋 Активные заказы» от каждого менеджера.
   */
  const scope = replyButtonScope(text)
  if (scope) {
    if (messageId)
      await deleteMessageById(botToken, chatId, messageId)

    if (scope === 'm' && !from?.username) {
      await sendRichMessage(
        botToken,
        chatId,
        'У вас не задан ник в Telegram — по нему я различаю менеджеров. Заведите @username в настройках, и кнопка заработает.',
      )
      return true
    }

    const orders = await ordersForScope(supabase, scope, from?.username)
    const { title, empty } = LIST_TITLES[scope]
    await sendRichMessage(
      botToken,
      chatId,
      orderListMessage(orders, title, empty),
      buildListKeyboard(orders, scope),
    )
    return true
  }

  const command = text.split(/\s+/)[0].split('@')[0].toLowerCase()

  if (command === '/panel' || command === '/start') {
    /*
     * Панель — то, ради чего всё и делалось: менеджеру не нужно помнить
     * команды, он нажимает кнопки. Владелец вызывает её один раз и закрепляет
     * сообщение в чате.
     *
     * `/start` тоже сюда: в рабочем чате это первое, что нажимает человек,
     * добавивший бота, и логично показать ему панель, а не приветствие для
     * покупателей.
     */
    /*
     * Двумя сообщениями: сперва постоянная клавиатура у поля ввода — она и
     * есть «кнопки по умолчанию», ради которых всё делалось, — затем панель
     * с теми же входами для тех, кому привычнее инлайн.
     */
    await sendRichMessage(
      botToken,
      chatId,
      'Кнопки заказов теперь всегда под рукой — они под полем ввода.',
      buildReplyKeyboard(),
    )
    await sendRichMessage(botToken, chatId, PANEL_TEXT, buildPanelKeyboard())
    return true
  }

  if (command === '/orders') {
    const orders = await fetchOrders(supabase, (q: any) =>
      q.in('status', ACTIVE_STATUSES).order('created_at', { ascending: false }).limit(15))
    await sendRichMessage(
      botToken,
      chatId,
      orderListMessage(orders, 'Активные заказы', 'Пусто — все заказы закрыты.'),
    )
    return true
  }

  if (command === '/my') {
    /*
     * Отбор по нику, а не по имени: имя пользователь меняет когда угодно, и
     * заказы «потерялись» бы. Ник в заказ записывает обработчик нажатия
     * кнопки — до перехода на callback его вообще не было, поэтому у старых
     * заказов здесь пусто, и это ожидаемо.
     */
    if (!from?.username) {
      await sendRichMessage(
        botToken,
        chatId,
        'У вас не задан ник в Telegram — по нему я и различаю менеджеров. Заведите @username в настройках, и команда заработает.',
      )
      return true
    }

    const orders = await fetchOrders(supabase, (q: any) =>
      q.eq('assigned_admin_username', from.username)
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: false })
        .limit(15))

    await sendRichMessage(
      botToken,
      chatId,
      orderListMessage(orders, 'Ваши активные заказы', 'За вами сейчас ничего не числится.'),
    )
    return true
  }

  if (command === '/order') {
    const query = text.split(/\s+/)[1]?.trim().replace(/^#/, '')
    if (!query) {
      await sendRichMessage(botToken, chatId, 'Укажите номер заказа: `/order 5e4fc2`')
      return true
    }

    /*
     * Ищем по хвосту id — это и есть «номер заказа», который видят и
     * покупатель, и менеджер.
     *
     * Фильтр применяется В КОДЕ, а не запросом. Колонка `id` типа uuid, и
     * приведение прямо в фильтре PostgREST не проходит: проверено на локальной
     * базе, `.ilike('id::text', …)` отвечает «operator does not exist:
     * uuid ~~* unknown». Поэтому берём последние заказы и отбираем сами.
     *
     * Двухсот хватает с запасом: на проде 3 сентября 2026 всего 43 заказа за
     * всё время, и ищут обычно свежие. Когда счёт пойдёт на тысячи, поиск
     * стоит перенести в RPC с `right(id::text, 6) = p_query` — тогда и
     * ограничение уйдёт.
     */
    const recent = await fetchOrders(supabase, (q: any) =>
      q.order('created_at', { ascending: false }).limit(200))
    const needle = query.toLowerCase()
    const orders = recent
      .filter(o => o.id.toLowerCase().endsWith(needle))
      .slice(0, 5)

    if (orders.length === 0) {
      await sendRichMessage(botToken, chatId, `Заказ \`${query}\` не найден.`)
      return true
    }

    if (orders.length > 1) {
      await sendRichMessage(
        botToken,
        chatId,
        orderListMessage(orders, `Нашлось несколько по «${query}»`, '', undefined),
      )
      return true
    }

    const order = orders[0]
    await sendRichMessage(
      botToken,
      chatId,
      orderCardMessage(order),
      buildOrderKeyboard(order.status, order.table, order.id) ?? undefined,
    )
    return true
  }

  return false
}


/** Правка уже отправленного сообщения: так список превращается в карточку и обратно. */
async function editMessage(
  botToken: string,
  chatId: number | string,
  messageId: number,
  text: string,
  replyMarkup?: unknown,
): Promise<void> {
  const res = await fetch(`${telegramApiBase()}/bot${botToken}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'Markdown',
      reply_markup: replyMarkup,
    }),
  })
  const result = await res.json()
  // «message is not modified» — не ошибка: менеджер нажал «Обновить», а
  // ничего не изменилось. Остальное стоит увидеть в логах.
  if (!result.ok && !String(result.description).includes('not modified'))
    console.error('editMessageText failed:', JSON.stringify(result))
}

async function deleteMessageById(
  botToken: string,
  chatId: number | string,
  messageId: number,
): Promise<void> {
  await fetch(`${telegramApiBase()}/bot${botToken}/deleteMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  })
}

/** Заказы для списка: активные все или активные конкретного менеджера. */
async function ordersForScope(
  supabase: ReturnType<typeof createClient>,
  scope: MenuScope,
  username?: string,
): Promise<OrderSummary[]> {
  return await fetchOrders(supabase, (q: any) => {
    let query = q.in('status', ACTIVE_STATUSES)
    if (scope === 'm')
      query = query.eq('assigned_admin_username', username ?? '\u0000')
    return query.order('created_at', { ascending: false }).limit(20)
  })
}

/**
 * Нажатия на панели заказов. Возвращает `true`, если нажатие относилось к
 * панели, — тогда обработчик действий под уведомлением не запускается.
 *
 * Экраны переключаются правкой ТОГО ЖЕ сообщения, в котором нажали: список
 * становится карточкой, карточка — снова списком. Это личное сообщение
 * менеджера (панель прислала его в ответ на нажатие), поэтому менеджеры друг
 * другу не мешают.
 */
async function handleMenuTap(
  callbackQuery: {
    id: string
    data?: string
    from: { id: number; first_name?: string; last_name?: string; username?: string }
    message?: { message_id: number; chat?: { id: number | string } }
  },
  botToken: string,
  supabaseUrl: string,
  supabase: ReturnType<typeof createClient>,
): Promise<boolean> {
  const parsed = callbackQuery.data ? parseMenuData(callbackQuery.data) : null
  if (!parsed)
    return false

  const chatId = callbackQuery.message?.chat?.id
  const messageId = callbackQuery.message?.message_id
  if (chatId === undefined || messageId === undefined)
    return true

  // Та же проверка, что и для действий: панель работает только в рабочем чате.
  const adminChatId = Deno.env.get('TELEGRAM_CHAT_ID')
  if (!adminChatId || String(chatId) !== String(adminChatId)) {
    await answerCallback(botToken, callbackQuery.id, 'Панель работает только в рабочем чате', true)
    return true
  }

  if (parsed.kind === 'close') {
    await deleteMessageById(botToken, chatId, messageId)
    await answerCallback(botToken, callbackQuery.id, '')
    return true
  }

  const username = callbackQuery.from.username

  if (parsed.kind === 'panel' || parsed.kind === 'menu') {
    const scope = parsed.scope!

    if (scope === 'm' && !username) {
      await answerCallback(
        botToken,
        callbackQuery.id,
        'У вас не задан ник в Telegram — по нему я различаю менеджеров',
        true,
      )
      return true
    }

    const orders = await ordersForScope(supabase, scope, username)
    const { title, empty } = LIST_TITLES[scope]
    const text = orderListMessage(orders, title, empty)
    const keyboard = buildListKeyboard(orders, scope)

    /*
     * С панели — новым сообщением, изнутри своего экрана — правкой его же.
     * Панель одна на чат: перепиши её, и остальные увидят чужой список.
     */
    if (parsed.kind === 'panel')
      await sendRichMessage(botToken, chatId as number, text, keyboard)
    else
      await editMessage(botToken, chatId, messageId, text, keyboard)

    await answerCallback(botToken, callbackQuery.id, '')
    return true
  }

  if (parsed.kind === 'card' || parsed.kind === 'card-action') {
    const scope = parsed.scope!
    const table = parsed.table!
    const orderId = parsed.orderId!

    // Действие выполняем ДО перерисовки, чтобы карточка показала новый статус.
    if (parsed.kind === 'card-action') {
      const result = await runOrderAction(
        parsed.action!,
        table,
        orderId,
        callbackQuery.from,
        supabaseUrl,
      )
      await answerCallback(botToken, callbackQuery.id, result.toast, !result.ok)
    }
    else {
      await answerCallback(botToken, callbackQuery.id, '')
    }

    const order = await fetchOrderById(supabase, table, orderId)
    if (!order) {
      await editMessage(botToken, chatId, messageId, 'Заказ не найден.', buildListKeyboard([], scope))
      return true
    }

    await editMessage(
      botToken,
      chatId,
      messageId,
      orderCardMessage(order),
      buildCardKeyboard(order.status, scope, table, orderId),
    )
    return true
  }

  return true
}

/** Один заказ по id — для карточки. */
async function fetchOrderById(
  supabase: ReturnType<typeof createClient>,
  table: string,
  orderId: string,
): Promise<OrderSummary | null> {
  const columns
    = 'id, status, final_amount, created_at, delivery_method, delivery_address, comment, assigned_admin_name, assigned_admin_username'
  const extra = table === 'guest_checkouts' ? 'guest_name, guest_phone' : 'customer_name, customer_phone'

  const { data, error } = await supabase
    .from(table)
    .select(`${columns}, ${extra}`)
    .eq('id', orderId)
    .maybeSingle()

  if (error) {
    console.error('Ошибка выборки заказа:', error.message)
    return null
  }
  return data ? ({ ...data, table } as OrderSummary) : null
}
