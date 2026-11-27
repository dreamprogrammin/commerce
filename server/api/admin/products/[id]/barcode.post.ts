import { sameScanCode, scanCode } from '~/utils/receiveScan'

/**
 * Штрихкод товару — с экрана «Приёмка по факту» (27.11.2026). На 27.11 код
 * был у 3 товаров из 186: незнакомую коробку человек один раз показывает на
 * строку заказа, дальше такие считаются сканом. Тело `{ code, replace? }`.
 *
 *   • код уже у другого товара — 409 с его названием: один код — один товар,
 *     иначе скан считал бы не ту строку (касса ищет так же, adminPosStore);
 *   • у товара свой, другой код — 409 «заменить?»; `replace: true` — заменить;
 *   • тот же код (UPC-A и EAN-13 с нулём — один) — ничего не меняется.
 *
 * В фид Merchant Center и разметку карточки код уходит, только если это
 * настоящий GTIN (utils/gtin.ts) — код поставщика их не испортит.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const productId = getRouterParam(event, 'id')
  if (!isUuid(productId))
    throw createError({ statusCode: 400, message: 'Неверный id товара' })
  const body = await readBody<{ code?: unknown, replace?: unknown }>(event)
  const code = typeof body?.code === 'string' ? scanCode(body.code) : ''
  // Печатные знаки ASCII: русская раскладка у сканера-клавиатуры даёт кириллицу вместо латиницы
  if (code.length < 4 || code.length > 64 || !/^[\x21-\x7E]+$/.test(code))
    throw createError({ statusCode: 400, message: 'Штрихкод — от 4 до 64 знаков: цифры, латинские буквы и знаки' })

  const [productRes, coded] = await Promise.all([
    db.from('products').select('id, name, barcode').eq('id', productId).maybeSingle(),
    loadProductBarcodes(db),
  ])
  if (productRes.error)
    throw createError({ statusCode: 500, message: productRes.error.message })
  const product = productRes.data
  if (!product)
    throw createError({ statusCode: 404, message: 'Товар не найден — возможно, его удалили' })

  const holder = coded.find(p => p.id !== productId && sameScanCode(p.barcode, code))
  if (holder)
    throw createError({ statusCode: 409, message: `Этот штрихкод уже у товара «${holder.name}»`, data: { holder: { id: holder.id, name: holder.name } } })

  const current = product.barcode?.trim() || null
  if (current && sameScanCode(current, code))
    return { productId, barcode: current, changed: false }
  if (current && body?.replace !== true)
    throw createError({ statusCode: 409, message: `У товара уже есть штрихкод ${current}`, data: { current } })

  const { error } = await db.from('products').update({ barcode: code }).eq('id', productId)
  if (error)
    throw createError({ statusCode: 500, message: error.message })
  return { productId, barcode: code, changed: true }
})
