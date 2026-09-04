import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ACTION_FUNCTIONS, buildOrderKeyboard, type OrderAction, parseCallbackData } from '../_shared/orderActions.ts'
import {
  assignedText,
  courierClosedText,
  courierLabel,
  deliveredKeyboard,
  managerNoticeText,
  takenByText,
} from '../_shared/courierOffers.ts'
import {
  ACTIVE_STATUSES,
  orderCardMessage,
  orderListMessage,
  shortNumber,
  type OrderSummary,
} from '../_shared/orderCard.ts'
import {
  applicationMessage,
  canManageStaff,
  staffListMessage,
  buildApprovalKeyboard,
  buildRoleKeyboard,
  canManageOrders,
  isStrictMode,
  looksLikeName,
  looksLikePhone,
  nextStep,
  parseJobData,
  ROLE_LABELS,
  type StaffRecord,
  STEP_QUESTIONS,
} from '../_shared/staff.ts'
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
      // Заявки на работу — раньше остального: их кнопки живут и в личке,
      // где панели заказов нет вовсе.
      const handledByJob = await handleJobTap(update.callback_query, botToken, supabase)
      if (handledByJob) {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Сначала навигация по панели, потом действия под уведомлением о заказе.
      const handledByMenu = await handleMenuTap(
        update.callback_query,
        botToken,
        supabaseUrl,
        supabase,
      )
      if (!handledByMenu)
        await handleOrderAction(update.callback_query, botToken, supabaseUrl, supabase)
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
              { command: 'job', description: '💼 Устроиться на работу' },
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
                { command: 'job', description: '💼 Анкета сотрудника' },
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

    /*
     * Анкета сотрудника — только в личке. В рабочем чате такой диалог мешал
     * бы переписке: на «как вас зовут?» ответили бы трое разом.
     */
    if (!adminChatId || String(chatId) !== String(adminChatId)) {
      const answered = await handleJobAnswer(text, chatId, botToken, supabase, {
        id: message.from?.id ?? chatId,
        username: message.from?.username,
      })
      if (answered) {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // /start job — переход по кнопке «Заполнить анкету» из рабочего чата
    if (text === '/start job') {
      const answered = await handleJobAnswer('/job', chatId, botToken, supabase, {
        id: message.from?.id ?? chatId,
        username: message.from?.username,
      })
      if (answered) {
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

    /*
     * Дальше — ветки для покупателя. В рабочем чате их быть не должно:
     * приветствие «Ухтышка — магазин детских игрушек» в ответ на неизвестную
     * команду выглядит как поломка и засоряет чат менеджеров.
     */
    if (adminChatId && String(chatId) === String(adminChatId)) {
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
    message?: { chat?: { id: number | string }; message_id?: number }
  },
  botToken: string,
  supabaseUrl: string,
  supabase: ReturnType<typeof createClient>,
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
  const fromAdminChat = !!adminChatId && fromChatId === String(adminChatId)

  /*
   * Вне рабочего чата кнопки заказов доступны ровно одному человеку —
   * принятому курьеру у себя в личке, куда ему приходят предложения доставки.
   * Проверка идёт по человеку (`callback_query.from`), а не по чату: чат тут
   * личный, и подделать его нельзя, но и опознавать по нему нечего.
   */
  const courier = fromAdminChat ? null : await findStaff(supabase, callbackQuery.from.id)
  const isCourier = !!courier && courier.role === 'courier' && courier.status === 'approved'

  if (!fromAdminChat && !isCourier) {
    console.warn(`Действие из чужого чата: ${fromChatId}`)
    await answerCallback(botToken, callbackQuery.id, 'Управлять заказами можно только из рабочего чата', true)
    return
  }

  /*
   * Курьер доставку берёт и отмечает доставленной. Подтверждать и отменять
   * заказы — не его работа, и кнопок таких у него нет; проверка здесь на
   * случай подделанного `callback_data`.
   */
  if (isCourier && parsed.action !== 'tak' && parsed.action !== 'dlv') {
    await answerCallback(botToken, callbackQuery.id, 'Здесь можно только взять доставку и отметить её', true)
    return
  }

  if (parsed.action === 'tak') {
    if (!isCourier) {
      await answerCallback(botToken, callbackQuery.id, 'Доставки берут курьеры', true)
      return
    }
    await claimDelivery(botToken, supabase, callbackQuery, parsed.table, parsed.orderId, courier!)
    return
  }

  /*
   * И вторая проверка — по человеку, а не по чату. Включается, только когда
   * в базе появился хотя бы один подтверждённый менеджер: см. `isStrictMode`.
   */
  if (fromAdminChat && !(await mayManageOrders(supabase, callbackQuery.from.id))) {
    await answerCallback(
      botToken,
      callbackQuery.id,
      'Вы пока не в команде. Напишите боту в личку /job, чтобы подать заявку.',
      true,
    )
    return
  }

  // Отметить доставленным может только тот курьер, который её вёз: иначе
  // заказ закроет любой, кому пришло предложение.
  if (isCourier && parsed.action === 'dlv') {
    const { data: order } = await supabase
      .from(parsed.table)
      .select('courier_staff_id')
      .eq('id', parsed.orderId)
      .maybeSingle()

    if ((order as { courier_staff_id?: string } | null)?.courier_staff_id !== courier!.id) {
      await answerCallback(botToken, callbackQuery.id, 'Эту доставку везёт другой курьер', true)
      return
    }
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

  /*
   * Курьеру правим его сообщение ПРЯМО ЗДЕСЬ, а не ждём, пока смена статуса
   * дойдёт до sync-order-status-to-telegram через триггер и pg_net. Курьер
   * стоит у подъезда и смотрит в экран: кнопка «Доставил» обязана погаснуть
   * в ту же секунду, иначе непонятно, засчиталось нажатие или нет.
   * (Владелец на это и указал 4 сентября 2026.)
   */
  if (isCourier && parsed.action === 'dlv' && result.ok) {
    const chatId = callbackQuery.message?.chat?.id
    const messageId = callbackQuery.message?.message_id
    if (chatId && messageId)
      await editMessage(botToken, chatId, messageId, courierClosedText(parsed.orderId, 'delivered'), undefined)
  }
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
  action: OrderAction,
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

  /*
   * `tak` («Беру» у курьера) сюда попасть не должен — его выполняет
   * claimDelivery, эдж-функции под ним нет. Если попал, значит кнопку собрали
   * не там: лучше сказать об этом, чем сходить по адресу `/functions/v1/undefined`.
   */
  const fn = ACTION_FUNCTIONS[action as Exclude<OrderAction, 'tak'>]
  if (!fn) {
    console.error(`Действие ${action} не привязано к функции`)
    return { ok: false, toast: 'Эта кнопка здесь не работает' }
  }

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
/**
 * Ник бота — нужен для ссылки «написать в личку». Запрашивается у Telegram,
 * а не хранится константой: сменить бота проще, чем не забыть поправить
 * строку в коде. Ответ кешируется на время жизни экземпляра функции.
 */
let cachedBotUsername: string | null = null

async function botUsername(botToken: string): Promise<string | null> {
  if (cachedBotUsername)
    return cachedBotUsername
  try {
    const res = await fetch(`${telegramApiBase()}/bot${botToken}/getMe`)
    const data = await res.json()
    cachedBotUsername = data?.result?.username ?? null
    return cachedBotUsername
  }
  catch {
    return null
  }
}

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
    = 'id, status, final_amount, created_at, delivery_method, delivery_address, comment, courier_name, assigned_admin_name, assigned_admin_username'

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

  /*
   * Анкету заполняют в личке: в общем чате на «как вас зовут?» ответили бы
   * трое разом. Но написать `/job` человек естественно пробует именно здесь —
   * он тут работает. Раньше на это приходило приветствие для покупателей, и
   * выглядело как «команда не работает» (владелец так и написал). Теперь —
   * подсказка с кнопкой, открывающей личку бота.
   */
  if (command === '/job' || command === '/rabota') {
    const me = await botUsername(botToken)
    await sendRichMessage(
      botToken,
      chatId,
      'Анкету заполняем в личке — в общем чате диалог мешал бы переписке.',
      me
        ? { inline_keyboard: [[{ text: '✍️ Заполнить анкету', url: `https://t.me/${me}?start=job` }]] }
        : undefined,
    )
    return true
  }

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
    const canSeeStaff = canManageStaff(
      await findStaff(supabase, from?.id ?? 0),
      await ownersExist(supabase),
    )
    await sendRichMessage(botToken, chatId, PANEL_TEXT, buildPanelKeyboard(canSeeStaff))
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


/**
 * «Беру» у курьера: заказ закрепляется за первым нажавшим.
 *
 * ГОНКА ЗДЕСЬ НАСТОЯЩАЯ — предложение уходит всем курьерам разом, и двое
 * вполне могут нажать одновременно. Поэтому закрепление идёт одним UPDATE с
 * условием «ещё никем не занято»: кто попал, тот и везёт. Проверять сначала
 * SELECT-ом, а потом писать — ровно тот способ, которым обе доставки
 * достаются обоим.
 */
async function claimDelivery(
  botToken: string,
  supabase: ReturnType<typeof createClient>,
  callbackQuery: {
    id: string
    from: { id: number }
    message?: { chat?: { id: number | string }; message_id?: number }
  },
  table: string,
  orderId: string,
  courier: StaffRecord,
): Promise<void> {
  const name = courierLabel(courier)

  /*
   * Условия на самом UPDATE, а не проверкой перед ним: предложение уходит всем
   * курьерам сразу, и двое жмут «Беру» одновременно. Заодно `status` не даёт
   * взять заказ, который уже отменили, — сообщение с кнопкой у курьера могло
   * остаться открытым на телефоне.
   */
  const { data: claimed } = await supabase
    .from(table)
    .update({
      courier_staff_id: courier.id,
      courier_name: name,
      courier_taken_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('status', 'shipped')
    .is('courier_staff_id', null)
    .select('*')
    .maybeSingle()

  const chatId = callbackQuery.message?.chat?.id
  const messageId = callbackQuery.message?.message_id

  if (!claimed) {
    // Не взяли — либо не успел, либо заказа больше нет в доставке. В обоих
    // случаях гасим кнопку, чтобы человек не жал её ещё раз.
    const { data: taken } = await supabase
      .from(table)
      .select('id, courier_name, status')
      .eq('id', orderId)
      .maybeSingle()

    const row = taken as { courier_name?: string | null; status?: string } | null
    const holder = row?.courier_name

    if (holder) {
      await answerCallback(botToken, callbackQuery.id, `Доставку уже взял ${holder}`, true)
      if (chatId && messageId)
        await editMessage(botToken, chatId, messageId, takenByText({ id: orderId } as never, holder), undefined)
    }
    else {
      await answerCallback(botToken, callbackQuery.id, 'Эта доставка уже неактуальна', true)
      if (chatId && messageId)
        await editMessage(botToken, chatId, messageId, courierClosedText(orderId, row?.status ?? 'cancelled'), undefined)
    }
    return
  }

  const order = claimed as Record<string, unknown> & { id: string }

  // Взявшему — полные данные с телефоном покупателя и кнопкой «Доставил».
  if (chatId && messageId) {
    await editMessage(
      botToken,
      chatId,
      messageId,
      assignedText(order as never),
      deliveredKeyboard(table, orderId),
    )
  }

  /*
   * Остальным предложение гасим: адрес и время чужой доставки в переписке
   * висеть не должны, а живая кнопка «Беру» под уже занятым заказом — прямой
   * путь к «нажал, а оно не работает».
   */
  const { data: offers } = await supabase
    .from('courier_offers')
    .select('telegram_user_id, message_id')
    .eq('order_id', orderId)

  for (const offer of (offers ?? []) as Array<{ telegram_user_id: number; message_id: number }>) {
    if (String(offer.telegram_user_id) === String(courier.telegram_user_id))
      continue
    await editMessage(botToken, offer.telegram_user_id, offer.message_id, takenByText(order as never, name), undefined)
  }

  // Менеджерам — строчка в рабочий чат: кто повёз. Без неё «передан курьеру»
  // остаётся статусом без человека, а спрашивать приходится голосом.
  const adminChatId = Deno.env.get('TELEGRAM_CHAT_ID')
  if (adminChatId)
    await sendRichMessage(botToken, Number(adminChatId), managerNoticeText(order as never, name))

  await answerCallback(botToken, callbackQuery.id, 'Доставка за вами. Контакты покупателя — в сообщении')
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
      buildCardKeyboard(order.status, scope, table, orderId, order.delivery_method),
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
    = 'id, status, final_amount, created_at, delivery_method, delivery_address, comment, courier_name, assigned_admin_name, assigned_admin_username'
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
  if (!data)
    return null

  return { ...data, table, items: await fetchOrderItems(supabase, table, orderId) } as OrderSummary
}

/**
 * Состав заказа. Таблицы у обычных и гостевых заказов разные, и связь тоже:
 * у гостевых внешний ключ называется `checkout_id`, а не `guest_checkout_id`
 * — на этом имени легко споткнуться, отметка об этом есть и в docs/HANDOFF.md.
 * Цена за штуку тоже под разными именами: `price_at_purchase` и
 * `price_per_item`.
 */
async function fetchOrderItems(
  supabase: ReturnType<typeof createClient>,
  table: string,
  orderId: string,
): Promise<Array<{ name: string; quantity: number; price: number | null }>> {
  const isGuest = table === 'guest_checkouts'
  const itemsTable = isGuest ? 'guest_checkout_items' : 'order_items'
  const foreignKey = isGuest ? 'checkout_id' : 'order_id'
  const priceColumn = isGuest ? 'price_per_item' : 'price_at_purchase'

  const { data, error } = await supabase
    .from(itemsTable)
    .select(`quantity, ${priceColumn}, product:products(name)`)
    .eq(foreignKey, orderId)

  if (error) {
    console.error('Ошибка выборки состава заказа:', error.message)
    return []
  }

  return (data ?? []).map((row: any) => ({
    // Товар могли удалить из каталога — заказ от этого не перестал
    // существовать, и позицию всё равно надо показать.
    name: row.product?.name ?? 'Товар удалён из каталога',
    quantity: row.quantity,
    price: row[priceColumn],
  }))
}


/** Заявка сотрудника по его Telegram-id. */
async function findStaff(
  supabase: ReturnType<typeof createClient>,
  telegramUserId: number,
): Promise<StaffRecord | null> {
  const { data } = await supabase
    .from('staff')
    .select('id, telegram_user_id, telegram_username, full_name, phone, role, status')
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle()
  return (data as StaffRecord | null) ?? null
}

/** Есть ли в базе подтверждённый владелец. */
async function ownersExist(supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const { count } = await supabase
    .from('staff')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')
    .eq('role', 'owner')
  return (count ?? 0) > 0
}

/**
 * Строгий режим включается, когда появился хотя бы один подтверждённый
 * менеджер. До этого работаем по-старому — иначе первый же выкат заблокировал
 * бы владельца, который ещё не подал заявку сам себе.
 */
async function strictModeOn(supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const { count } = await supabase
    .from('staff')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')
    .in('role', ['manager', 'owner'])
  return isStrictMode(count ?? 0)
}

/** Может ли этот человек управлять заказами. */
async function mayManageOrders(
  supabase: ReturnType<typeof createClient>,
  telegramUserId: number,
): Promise<boolean> {
  const strict = await strictModeOn(supabase)
  if (!strict)
    return true
  return canManageOrders(await findStaff(supabase, telegramUserId), true)
}

/**
 * Анкета сотрудника: очередной ответ на вопрос бота.
 *
 * Возвращает `true`, если сообщение было ответом на анкету. Работает только в
 * личке: в рабочем чате такой диалог мешал бы переписке, а на общий вопрос
 * ответили бы трое разом.
 */
async function handleJobAnswer(
  text: string,
  chatId: number,
  botToken: string,
  supabase: ReturnType<typeof createClient>,
  from: { id: number; username?: string },
): Promise<boolean> {
  const record = await findStaff(supabase, from.id)

  // Начало анкеты.
  if (text === '/job' || text === '/rabota') {
    if (record?.status === 'approved') {
      await sendRichMessage(
        botToken,
        chatId,
        `Вы уже в команде: *${ROLE_LABELS[record.role ?? 'manager']}*.`,
      )
      return true
    }
    if (record?.status === 'pending') {
      await sendRichMessage(botToken, chatId, 'Ваша заявка уже отправлена — ждём ответа.')
      return true
    }

    await supabase.from('staff').upsert({
      telegram_user_id: from.id,
      telegram_username: from.username ?? null,
      full_name: null,
      phone: null,
      role: null,
      status: 'draft',
    }, { onConflict: 'telegram_user_id' })

    await sendRichMessage(botToken, chatId, `Заполним короткую анкету.\n\n${STEP_QUESTIONS.name}`)
    return true
  }

  // Продолжение анкеты — только если она начата и не дошла до конца.
  if (!record || record.status !== 'draft')
    return false

  const step = nextStep(record)

  if (step === 'name') {
    if (!looksLikeName(text)) {
      await sendRichMessage(botToken, chatId, 'Похоже, это не имя. Напишите, как вас зовут.')
      return true
    }
    await supabase.from('staff').update({ full_name: text.trim() }).eq('id', record.id)
    await sendRichMessage(botToken, chatId, STEP_QUESTIONS.phone)
    return true
  }

  if (step === 'phone') {
    if (!looksLikePhone(text)) {
      await sendRichMessage(botToken, chatId, 'Не похоже на номер телефона. Напишите его целиком, с кодом.')
      return true
    }
    await supabase.from('staff').update({ phone: text.trim() }).eq('id', record.id)
    await sendRichMessage(botToken, chatId, STEP_QUESTIONS.role, buildRoleKeyboard())
    return true
  }

  // Роль выбирается кнопкой — текст здесь не ответ.
  if (step === 'role') {
    await sendRichMessage(botToken, chatId, STEP_QUESTIONS.role, buildRoleKeyboard())
    return true
  }

  return false
}

/**
 * Кнопки анкеты: выбор роли соискателем и решение владельца по заявке.
 *
 * Решение принимается в рабочем чате — там же, где менеджеры видят заказы;
 * заводить для этого отдельное место незачем.
 */
async function handleJobTap(
  callbackQuery: {
    id: string
    data?: string
    from: { id: number; first_name?: string; username?: string }
    message?: { message_id: number; chat?: { id: number | string } }
  },
  botToken: string,
  supabase: ReturnType<typeof createClient>,
): Promise<boolean> {
  const chatId = callbackQuery.message?.chat?.id
  const messageId = callbackQuery.message?.message_id
  const adminChatId = Deno.env.get('TELEGRAM_CHAT_ID')

  /*
   * Список команды. Открыт только владельцу: телефоны сотрудников по чату
   * разносить незачем, да и решать, кого пускать, — его дело.
   */
  if (callbackQuery.data === 'stf:list') {
    const allowed = canManageStaff(
      await findStaff(supabase, callbackQuery.from.id),
      await ownersExist(supabase),
    )
    if (!allowed) {
      await answerCallback(botToken, callbackQuery.id, 'Список команды доступен владельцу', true)
      return true
    }

    const { data } = await supabase
      .from('staff')
      .select('id, telegram_user_id, telegram_username, full_name, phone, role, status')
      .neq('status', 'draft')
      .order('created_at', { ascending: false })

    await answerCallback(botToken, callbackQuery.id, '')
    await sendRichMessage(
      botToken,
      chatId as number,
      staffListMessage((data ?? []) as StaffRecord[]),
    )
    return true
  }

  const parsed = callbackQuery.data ? parseJobData(callbackQuery.data) : null
  if (!parsed)
    return false

  // Соискатель выбрал роль — анкета заполнена, отправляем её владельцу.
  if (parsed.kind === 'role') {
    const record = await findStaff(supabase, callbackQuery.from.id)
    if (!record || record.status !== 'draft') {
      await answerCallback(botToken, callbackQuery.id, 'Анкета уже отправлена')
      return true
    }

    const { data: updated } = await supabase
      .from('staff')
      .update({ role: parsed.role, status: 'pending' })
      .eq('id', record.id)
      .select('id, telegram_user_id, telegram_username, full_name, phone, role, status')
      .maybeSingle()

    await answerCallback(botToken, callbackQuery.id, 'Заявка отправлена')
    if (chatId !== undefined && messageId !== undefined) {
      await editMessage(
        botToken,
        chatId,
        messageId,
        'Спасибо! Заявка отправлена, ждите ответа.',
      )
    }

    if (adminChatId && updated) {
      await sendRichMessage(
        botToken,
        Number(adminChatId),
        applicationMessage(updated as StaffRecord),
        buildApprovalKeyboard((updated as StaffRecord).id),
      )
    }
    return true
  }

  // Решение владельца. Принимается только в рабочем чате: иначе заявку мог бы
  // одобрить сам соискатель, переслав себе сообщение с кнопками.
  if (!adminChatId || String(chatId ?? '') !== String(adminChatId)) {
    await answerCallback(botToken, callbackQuery.id, 'Решение принимается в рабочем чате', true)
    return true
  }

  /*
   * И по человеку: принимает владелец. Менеджер ведёт заказы, но решать,
   * кого пускать в систему, — другое право. Пока владельца нет, решает любой
   * из рабочего чата, иначе первую заявку принять было бы некому.
   */
  if (!canManageStaff(await findStaff(supabase, callbackQuery.from.id), await ownersExist(supabase))) {
    await answerCallback(botToken, callbackQuery.id, 'Решение по заявкам принимает владелец', true)
    return true
  }

  const approved = parsed.kind === 'approve'
  const { data: staff } = await supabase
    .from('staff')
    .update({
      status: approved ? 'approved' : 'rejected',
      approved_at: approved ? new Date().toISOString() : null,
      approved_by: callbackQuery.from.id,
    })
    .eq('id', parsed.staffId!)
    .select('id, telegram_user_id, telegram_username, full_name, phone, role, status')
    .maybeSingle()

  await answerCallback(botToken, callbackQuery.id, approved ? 'Принят' : 'Отклонён')

  if (staff && chatId !== undefined && messageId !== undefined) {
    const record = staff as StaffRecord
    await editMessage(
      botToken,
      chatId,
      messageId,
      `${applicationMessage(record)}\n\n*Решение:* ${approved ? '✅ принят' : '❌ отклонён'} (${callbackQuery.from.first_name ?? 'владелец'})`,
    )

    // Человеку сообщаем в личку: он ждёт ответа именно там.
    await sendRichMessage(
      botToken,
      record.telegram_user_id,
      approved
        ? `Вас приняли: *${ROLE_LABELS[record.role ?? 'manager']}*. Добро пожаловать!`
        : 'К сожалению, заявка отклонена.',
    )
  }

  return true
}
