import { describe, expect, it } from 'vitest'
import { codeDeliveryText, isSessionGone, normalizeCode, normalizePhone, phoneLast4, telegramErrorText } from '../../utils/telegramLogin'

describe('normalizePhone', () => {
  it('казахстанский номер в любой записи — +7 и 10 цифр', () => {
    expect(normalizePhone('+7 (777) 123-45-67')).toBe('+77771234567')
    expect(normalizePhone('8 777 123 45 67')).toBe('+77771234567')
    expect(normalizePhone('77771234567')).toBe('+77771234567')
    expect(normalizePhone(' +7 777 123-45-67 ')).toBe('+77771234567')
  })

  it('чужая страна остаётся своей', () => {
    expect(normalizePhone('+998 90 123 45 67')).toBe('+998901234567')
  })

  it('не телефон — null', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('+7 777 123')).toBeNull()
    expect(normalizePhone('+0 777 123 45 67')).toBeNull()
    expect(normalizePhone('+7 777 123 45 6a')).toBeNull()
    expect(normalizePhone('+7 777 123 45 67 89 01 2')).toBeNull()
  })
})

describe('phoneLast4', () => {
  it('последние 4 цифры', () => {
    expect(phoneLast4('+77771234567')).toBe('4567')
    expect(phoneLast4('77771234567')).toBe('4567')
  })
})

describe('normalizeCode', () => {
  it('код с пробелом или дефисом', () => {
    expect(normalizeCode('12345')).toBe('12345')
    expect(normalizeCode(' 12 345 ')).toBe('12345')
    expect(normalizeCode('12-345')).toBe('12345')
  })

  it('не код — null', () => {
    expect(normalizeCode('')).toBeNull()
    expect(normalizeCode('123')).toBeNull()
    expect(normalizeCode('12a45')).toBeNull()
    expect(normalizeCode('123456789')).toBeNull()
  })
})

describe('telegramErrorText', () => {
  it('ожидание — со временем, когда Telegram его назвал', () => {
    expect(telegramErrorText('FLOOD_WAIT_%d', 30)).toBe('Telegram просит подождать: слишком много попыток. Повторите через 1 мин')
    expect(telegramErrorText('FLOOD_WAIT_%d', 300)).toContain('через 5 мин')
    expect(telegramErrorText('FLOOD_WAIT_%d', 7200)).toContain('через 2 ч')
    expect(telegramErrorText('FLOOD_PREMIUM_WAIT_%d', 61)).toContain('через 2 мин')
    expect(telegramErrorText('PHONE_NUMBER_FLOOD')).toContain('Повторите позже')
  })

  it('известные ответы — по-русски', () => {
    expect(telegramErrorText('PHONE_CODE_INVALID')).toBe('Код не подошёл — проверьте и введите ещё раз')
    expect(telegramErrorText('API_ID_INVALID')).toContain('my.telegram.org')
    expect(telegramErrorText('PASSWORD_HASH_INVALID')).toBe('Пароль не подошёл')
  })

  it('неизвестный — кодом Telegram: по нему ищут причину', () => {
    expect(telegramErrorText('SOMETHING_NEW')).toBe('Telegram ответил ошибкой SOMETHING_NEW')
  })
})

describe('codeDeliveryText', () => {
  it('куда пришёл код', () => {
    expect(codeDeliveryText('app')).toContain('в приложение Telegram')
    expect(codeDeliveryText('sms')).toBe('по SMS')
    expect(codeDeliveryText('unknown_kind')).toBe('в Telegram')
  })
})

describe('isSessionGone', () => {
  it('сессию закрыли — стереть; ожидание — нет', () => {
    expect(isSessionGone('AUTH_KEY_UNREGISTERED')).toBe(true)
    expect(isSessionGone('SESSION_REVOKED')).toBe(true)
    expect(isSessionGone('FLOOD_WAIT_%d')).toBe(false)
  })
})
