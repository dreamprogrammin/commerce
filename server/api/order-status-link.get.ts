/**
 * Код отслеживания по id заказа — для кнопки «Страница статуса» на
 * `/order/success/<id>`. Гость свой заказ из базы прочитать не может (RLS),
 * а кто знает id — тот и так видит страницу «Заказ оформлен», так что доступ
 * это не расширяет. Отдаём только код, ничего больше.
 */
export default defineEventHandler(async (event) => {
  const id = String(getQuery(event).order ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id))
    throw createError({ statusCode: 404, message: 'Заказ не найден' })
  setResponseHeader(event, 'Cache-Control', 'no-store')

  const db = serviceSupabase()
  let { data } = await db.from('guest_checkouts').select('tracking_code').eq('id', id).maybeSingle()
  if (!data)
    ({ data } = await db.from('orders').select('tracking_code').eq('id', id).maybeSingle())
  if (!data?.tracking_code)
    throw createError({ statusCode: 404, message: 'Заказ не найден' })
  return { code: data.tracking_code }
})
