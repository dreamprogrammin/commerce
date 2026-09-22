/**
 * GTIN — 8, 12, 13 или 14 цифр с верной контрольной цифрой, иначе null.
 *
 * Зачем проверять. Единственный штрихкод в базе (22 сентября 2026) — «8497» у
 * куклы DEFA Lucy FCJ0840265: четыре цифры, это не GTIN. Он уходил в разметку
 * Product на карточке, в разделе, на страницах бренда и линейки как `gtin`, а в
 * фид Merchant Center шёл бы как неверный штрихкод. Проверка одна на всё:
 * разметка сайта и фид (utils/merchantFeed.ts).
 */
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
  return check === Number(digits.at(-1)) ? digits : null
}
