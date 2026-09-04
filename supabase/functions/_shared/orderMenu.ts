/**
 * Панель заказов в Telegram: навигация кнопками, без единой команды.
 *
 * ЗАЧЕМ. Команды `/orders`, `/my`, `/order номер` работают, но их надо
 * помнить и печатать. Менеджеру, который весь день разбирает заказы с
 * телефона, это лишний барьер: он не будет разбираться с синтаксисом, он
 * нажмёт кнопку. Поэтому поверх тех же данных сделан обычный экран —
 * закреплённое сообщение с кнопками, откуда всё и делается.
 *
 * КАК УСТРОЕНО. Три экрана, между ними ходят кнопками:
 *
 *   панель      «Активные» · «Мои» → список
 *   список      кнопка на каждый заказ → карточка; «Обновить», «Закрыть»
 *   карточка    действия с заказом («Взять в работу» и дальше) и «← К списку»
 *
 * Список и карточка живут в ОТДЕЛЬНОМ сообщении, которое бот присылает в
 * ответ на нажатие, и переключаются правкой этого же сообщения. Это не
 * прихоть: в рабочем чате несколько менеджеров, и если бы экраны рисовались
 * прямо в закреплённой панели, они перебивали бы друг друга — Айгуль открыла
 * список, Данияр нажал «Мои», и у обоих на экране чужое. Своё сообщение у
 * каждого своё, а «Закрыть» убирает его, чтобы чат не зарастал.
 */

import type { OrderSummary } from './orderCard.ts'
import { formatAmount, shortNumber, statusLabel } from './orderCard.ts'
import { type OrderAction, tableToCode } from './orderActions.ts'
import { type DeliveryMethod, deliveredWording, shippedWording } from './shopInfo.ts'

/** Какой список открыт: активные или свои. Нужен, чтобы «Назад» возвращал туда же. */
export type MenuScope = 'a' | 'm'

/**
 * Кнопка ПАНЕЛИ и кнопка внутри своего экрана различаются префиксом.
 *
 * Панель одна на чат, её нажимают все — поэтому она присылает менеджеру новое
 * сообщение. Кнопки внутри этого сообщения («Обновить», «← К списку») правят
 * его же. Без такого различия «Обновить» плодило бы сообщения, а панель
 * переписывалась бы под того, кто нажал последним.
 */
export const PANEL_PREFIX = 'pnl'
export const MENU_PREFIX = 'mnu'
export const CARD_PREFIX = 'ord'
export const CARD_ACTION_PREFIX = 'act'
export const CLOSE_DATA = 'cls'

/** Кнопка заказа в списке: `ord:<список>:<таблица>:<id>`, 44 байта при UUID. */
export function buildCardData(scope: MenuScope, table: string, orderId: string): string {
  return `${CARD_PREFIX}:${scope}:${tableToCode(table)}:${orderId}`
}

/**
 * Действие, нажатое НА КАРТОЧКЕ. Отличается от такого же действия под
 * уведомлением о заказе (`asg:o:…`) только префиксом — по нему обработчик
 * понимает, что после работы надо перерисовать карточку, а не оставить
 * менеджера смотреть на неизменившийся экран.
 */
export function buildCardActionData(
  action: OrderAction,
  scope: MenuScope,
  table: string,
  orderId: string,
): string {
  return `${CARD_ACTION_PREFIX}:${action}:${scope}:${tableToCode(table)}:${orderId}`
}

export interface ParsedMenu {
  kind: 'panel' | 'menu' | 'card' | 'card-action' | 'close'
  scope?: MenuScope
  table?: string
  orderId?: string
  action?: OrderAction
}

export function parseMenuData(data: string): ParsedMenu | null {
  if (data === CLOSE_DATA)
    return { kind: 'close' }

  const parts = data.split(':')

  if (parts[0] === PANEL_PREFIX && (parts[1] === 'a' || parts[1] === 'm'))
    return { kind: 'panel', scope: parts[1] }

  if (parts[0] === MENU_PREFIX && (parts[1] === 'a' || parts[1] === 'm'))
    return { kind: 'menu', scope: parts[1] }

  if (parts[0] === CARD_PREFIX && parts.length === 4) {
    const [, scope, tableCode, orderId] = parts
    if ((scope === 'a' || scope === 'm') && orderId)
      return { kind: 'card', scope, table: tableCode === 'g' ? 'guest_checkouts' : 'orders', orderId }
  }

  if (parts[0] === CARD_ACTION_PREFIX && parts.length === 5) {
    const [, action, scope, tableCode, orderId] = parts
    if ((scope === 'a' || scope === 'm') && orderId)
      return {
        kind: 'card-action',
        action: action as OrderAction,
        scope,
        table: tableCode === 'g' ? 'guest_checkouts' : 'orders',
        orderId,
      }
  }

  return null
}

/** Закреплённая панель — точка входа. Её видно всем, нажимает каждый за себя. */
export function buildPanelKeyboard(showStaff = false) {
  const rows = [[
    { text: '📋 Активные заказы', callback_data: `${PANEL_PREFIX}:a` },
    { text: '👤 Мои заказы', callback_data: `${PANEL_PREFIX}:m` },
  ]]

  // Команда и отчёт — только владельцу: остальным этот список ни к чему, а
  // телефоны сотрудников и выручку разносить по чату незачем.
  if (showStaff)
    rows.push([
      { text: '👥 Команда', callback_data: 'stf:list' },
      { text: '📊 Отчёт', callback_data: 'rep:w' },
    ])

  return { inline_keyboard: rows }
}

export const PANEL_TEXT = [
  '*Панель заказов*',
  '',
  'Нажмите кнопку — откроется список. В списке нажмите на заказ, чтобы',
  'посмотреть карточку и вести его: взять в работу, подтвердить, передать',
  'курьеру, отметить доставку.',
  '',
  '_Закрепите это сообщение, чтобы оно всегда было под рукой._',
].join('\n')

/**
 * Кнопки списка: по кнопке на заказ. Больше десяти не показываем — дальше
 * экран телефона всё равно кончается, а разбирать надо сверху.
 */
export function buildListKeyboard(orders: OrderSummary[], scope: MenuScope) {
  const rows = orders.slice(0, 10).map(order => [{
    text: `${shortNumber(order.id)} · ${formatAmount(order.final_amount)} · ${statusLabel(order.status)}`,
    callback_data: buildCardData(scope, order.table, order.id),
  }])

  rows.push([
    { text: '🔄 Обновить', callback_data: `${MENU_PREFIX}:${scope}` },
    { text: '✖️ Закрыть', callback_data: CLOSE_DATA },
  ])

  return { inline_keyboard: rows }
}

/**
 * Кнопки карточки: то же действие, что и под уведомлением о заказе, плюс
 * возврат к списку. У доставленного и отменённого заказа действий нет —
 * остаётся только «Назад».
 */
export function buildCardKeyboard(
  status: string,
  scope: MenuScope,
  table: string,
  orderId: string,
  /** См. пояснение у `buildOrderKeyboard`: подпись шага зависит от доставки. */
  deliveryMethod?: DeliveryMethod,
) {
  const rows: Array<Array<{ text: string; callback_data: string }>> = []

  const primary: Record<string, { text: string; action: OrderAction }> = {
    new: { text: '✅ Взять в работу', action: 'asg' },
    pending: { text: '✅ Взять в работу', action: 'asg' },
    processing: { text: '✅ Подтвердить', action: 'cfm' },
    confirmed: { text: shippedWording(deliveryMethod).button, action: 'shp' },
    shipped: { text: deliveredWording(deliveryMethod).button, action: 'dlv' },
  }

  const step = primary[status]
  if (step) {
    rows.push([{
      text: step.text,
      callback_data: buildCardActionData(step.action, scope, table, orderId),
    }])
    rows.push([{
      text: '❌ Отменить',
      callback_data: buildCardActionData('cnl', scope, table, orderId),
    }])
  }

  rows.push([
    { text: '← К списку', callback_data: `${MENU_PREFIX}:${scope}` },
    { text: '✖️ Закрыть', callback_data: CLOSE_DATA },
  ])

  return { inline_keyboard: rows }
}

/** Заголовок списка и текст на случай, когда показывать нечего. */
export const LIST_TITLES: Record<MenuScope, { title: string; empty: string }> = {
  a: { title: 'Активные заказы', empty: 'Пусто — все заказы закрыты.' },
  m: { title: 'Ваши активные заказы', empty: 'За вами сейчас ничего не числится.' },
}

/**
 * Постоянная клавиатура у поля ввода — «кнопки по умолчанию».
 *
 * Инлайн-панель надо было вызвать и закрепить, а закреплённое сообщение
 * уезжает из поля зрения. Эта клавиатура висит у строки ввода всегда и у
 * всех участников чата: менеджер открыл чат — кнопки уже есть, ничего
 * вызывать не нужно.
 *
 * Нажатие приходит обычным текстовым сообщением — поэтому подписи кнопок
 * сразу и служат «командами», см. REPLY_BUTTONS. Само сообщение бот удаляет,
 * чтобы чат не зарастал нажатиями.
 *
 * `is_persistent` требует Bot API 6.4+ и означает, что клавиатура не
 * сворачивается, когда менеджер начинает печатать.
 */
export const REPLY_BUTTONS = {
  active: '📋 Активные заказы',
  mine: '👤 Мои заказы',
  team: '👥 Команда',
  report: '📊 Отчёт',
} as const

/**
 * Клавиатура рабочего чата. Второй ряд — дела владельца: команда и отчёт.
 *
 * Раньше они жили ТОЛЬКО инлайн-кнопками внутри сообщения панели, то есть
 * находились, лишь если знать, куда нажать. Владелец попросил вывести их
 * нативно — под поле ввода, наравне с заказами.
 *
 * Клавиатура в группе одна на всех, персонализировать её Telegram не даёт.
 * Поэтому кнопки видны всем, но по нажатию проверяется роль: менеджеру бот
 * отвечает, что это дело владельца. Показать лишнюю кнопку дешевле, чем
 * заставлять владельца помнить команду.
 */
export function buildReplyKeyboard(withOwnerRow = false) {
  const rows: Array<Array<{ text: string }>> = [
    [{ text: REPLY_BUTTONS.active }, { text: REPLY_BUTTONS.mine }],
  ]

  if (withOwnerRow)
    rows.push([{ text: REPLY_BUTTONS.team }, { text: REPLY_BUTTONS.report }])

  return {
    keyboard: rows,
    resize_keyboard: true,
    is_persistent: true,
    selective: false,
  }
}

/**
 * Клавиатура в личке владельца. Списков заказов здесь нет намеренно: кнопки
 * под карточкой заказа работают только в рабочем чате, и список в личке
 * оказался бы набором мёртвых кнопок.
 */
export function buildOwnerDmKeyboard() {
  return {
    keyboard: [[{ text: REPLY_BUTTONS.report }, { text: REPLY_BUTTONS.team }]],
    resize_keyboard: true,
    is_persistent: true,
    selective: false,
  }
}

/** Текст нажатой кнопки → какой список открывать. */
export function replyButtonScope(text: string): MenuScope | null {
  const clean = text.trim()
  if (clean === REPLY_BUTTONS.active)
    return 'a'
  if (clean === REPLY_BUTTONS.mine)
    return 'm'
  return null
}
