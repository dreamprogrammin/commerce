/**
 * GTIN — 8, 12, 13 или 14 цифр с верной контрольной цифрой, не из внутренних
 * и не из купонных диапазонов GS1, иначе null.
 *
 * Зачем проверять. Единственный штрихкод в базе (22 сентября 2026) — «8497» у
 * куклы DEFA Lucy FCJ0840265: четыре цифры, это не GTIN. Он уходил в разметку
 * Product на карточке, в разделе, на страницах бренда и линейки как `gtin`, а в
 * фид Merchant Center шёл бы как неверный штрихкод. Проверка одна на всё:
 * разметка сайта и фид (utils/merchantFeed.ts).
 *
 * Диапазоны (28 ноября 2026). С «Приёмки по факту» штрихкод привязывают прямо
 * с коробки, а на ней бывает этикетка магазина или поставщика. Google: «Don't
 * submit a GTIN in the restricted ranges… prefixes: 02, 04, or 2» и «…coupon
 * ranges… 05, 98 or 99» (support.google.com/merchants/answer/6324461).
 * Префикс смотрится по виду из 13 цифр: у 12 цифр UPC впереди ноль (UPC на 2,
 * 4 и 5 — это 02, 04 и 05), у 14 цифр — после первой цифры, цифры упаковки.
 * Восемь цифр на 0 и 2 — внутренние коды компании по GS1 (RCN-8).
 * У товара такой код остаётся — по нему приёмка узнаёт коробку; не уходит он
 * только в фид и разметку.
 */
const NOT_GTIN_PREFIXES = ['2', '02', '04', '05', '98', '99']

export function validGtin(code: string | null | undefined): string | null {
  const digits = (code ?? '').replace(/\s+/g, '')
  if (!/^(?:\d{8}|\d{12,14})$/.test(digits))
    return null
  const body = digits.slice(0, -1)
  let sum = 0
  for (let i = 0; i < body.length; i++) {
    const n = Number(body[body.length - 1 - i])
    sum += i % 2 === 0 ? n * 3 : n
  }
  const check = (10 - (sum % 10)) % 10
  if (check !== Number(digits.at(-1)))
    return null
  if (digits.length === 8)
    return digits[0] === '0' || digits[0] === '2' ? null : digits
  const gtin13 = digits.length === 14 ? digits.slice(1) : digits.padStart(13, '0')
  return NOT_GTIN_PREFIXES.some(prefix => gtin13.startsWith(prefix)) ? null : digits
}
