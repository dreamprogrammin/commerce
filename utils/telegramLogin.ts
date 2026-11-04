/**
 * Вход в аккаунт Telegram на странице «Аккаунт Telegram» (4 ноября 2026):
 * разбор телефона и кода, ответы Telegram по-русски. Общее для страницы
 * (подсказка до запроса) и сервера (server/utils/telegramAccount.ts).
 *
 * Аккаунт нужен для закрытых каналов поставщиков (ссылка t.me/+…): у них нет
 * просмотра t.me/s/, читает их только участник канала.
 */

/** Телефон в международном формате: «+7 (777) 123-45-67» → «+77771234567»; null — не телефон. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.trim().replace(/[\s().\-–]/g, '')
  // «8 777 …» — казахстанская запись того же +7
  const intl = /^8\d{10}$/.test(digits) ? `+7${digits.slice(1)}` : digits.startsWith('+') ? digits : `+${digits}`
  return /^\+[1-9]\d{9,14}$/.test(intl) ? intl : null
}

/** Последние 4 цифры телефона — всё, что от него показывается и хранится вне Vault. */
export function phoneLast4(phone: string): string {
  return phone.replace(/\D/g, '').slice(-4)
}

/** Код из Telegram: «12 345», «12-345» → «12345»; null — не код. */
export function normalizeCode(raw: string): string | null {
  const code = raw.replace(/[\s\-–]/g, '')
  return /^\d{4,8}$/.test(code) ? code : null
}

/** Куда Telegram отправил код — по типу из auth.sentCode. */
export function codeDeliveryText(via: string): string {
  const texts: Record<string, string> = {
    app: 'в приложение Telegram: чат «Telegram» на телефоне или компьютере, где этот аккаунт уже открыт',
    sms: 'по SMS',
    sms_word: 'по SMS',
    sms_phrase: 'по SMS',
    firebase: 'по SMS',
    call: 'звонком',
    flash_call: 'звонком: код — последние цифры номера, с которого звонят',
    missed_call: 'пропущенным звонком: код — последние цифры номера, с которого звонили',
    email: 'на почту, привязанную к аккаунту',
    fragment: 'в Fragment',
  }
  return texts[via] ?? 'в Telegram'
}

/** Минуты ожидания по-русски: «через 5 мин», «через 2 ч». */
function waitText(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  return minutes < 90 ? `через ${minutes} мин` : `через ${Math.ceil(minutes / 60)} ч`
}

/**
 * Ответ Telegram (код ошибки RPC) → что сказать человеку. Неизвестный код
 * показывается как есть: по нему ищут причину.
 */
export function telegramErrorText(text: string, seconds?: number): string {
  if (/^(?:FLOOD_WAIT|FLOOD_PREMIUM_WAIT)_/.test(text) || text === 'PHONE_NUMBER_FLOOD')
    return `Telegram просит подождать: слишком много попыток. Повторите ${seconds ? waitText(seconds) : 'позже'}`
  const texts: Record<string, string> = {
    API_ID_INVALID: 'api_id и api_hash не подошли — сверьте их на my.telegram.org',
    API_ID_PUBLISHED_FLOOD: 'Эти api_id и api_hash Telegram не принимает — создайте своё приложение на my.telegram.org',
    PHONE_NUMBER_INVALID: 'Telegram не принимает этот номер — проверьте его: +7 и 10 цифр',
    PHONE_NUMBER_BANNED: 'Этот номер заблокирован в Telegram',
    PHONE_NUMBER_UNOCCUPIED: 'На этот номер нет аккаунта Telegram — сначала зарегистрируйте его в приложении',
    PHONE_CODE_INVALID: 'Код не подошёл — проверьте и введите ещё раз',
    PHONE_CODE_EMPTY: 'Введите код из Telegram',
    PHONE_CODE_EXPIRED: 'Код устарел — запросите новый',
    PHONE_CODE_HASH_EMPTY: 'Вход устарел — запросите код заново',
    PASSWORD_HASH_INVALID: 'Пароль не подошёл',
    AUTH_RESTART: 'Telegram просит начать вход заново — запросите код ещё раз',
    SEND_CODE_UNAVAILABLE: 'Telegram сейчас не может отправить код — попробуйте позже',
    AUTH_KEY_UNREGISTERED: 'Telegram завершил сессию — войдите заново',
    SESSION_REVOKED: 'Сессию завершили в настройках Telegram — войдите заново',
    SESSION_EXPIRED: 'Сессия истекла — войдите заново',
    USER_DEACTIVATED: 'Аккаунт удалён или заблокирован в Telegram',
    USER_DEACTIVATED_BAN: 'Аккаунт заблокирован в Telegram',
  }
  return texts[text] ?? `Telegram ответил ошибкой ${text}`
}

/** После этих ответов сессия больше не действует — её надо стереть и войти заново. */
export function isSessionGone(text: string): boolean {
  return ['AUTH_KEY_UNREGISTERED', 'SESSION_REVOKED', 'SESSION_EXPIRED', 'USER_DEACTIVATED', 'USER_DEACTIVATED_BAN', 'AUTH_KEY_INVALID'].includes(text)
}
