/**
 * «Что добавляют в корзину» — обезличенная сводка Google Analytics для админки.
 *
 * Зачем (29 сентября 2026). Имён GA не даёт и давать не должна; зато видно,
 * какие товары кладут в корзину, сколько из них доходит до оформления и
 * покупки, на каком шаге оформления уходят и откуда приходят те, кто
 * добавлял. Шаги оформления (`view_cart`, `add_shipping_info`,
 * `add_payment_info`) собираются с 29 сентября — раньше их не было.
 *
 * Ответ держим 10 минут: у Data API суточные квоты, а страницу открывают
 * по нескольку раз подряд.
 */

const FUNNEL = ['view_item', 'add_to_cart', 'view_cart', 'begin_checkout', 'add_shipping_info', 'add_payment_info', 'purchase'] as const
const cache = new Map<number, { at: number, data: unknown }>()

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  if (!ga4Configured())
    return { configured: false }

  const days = [7, 30, 90].includes(Number(getQuery(event).days)) ? Number(getQuery(event).days) : 30
  const hit = cache.get(days)
  if (hit && Date.now() - hit.at < 10 * 60_000)
    return hit.data

  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: 'today' }]
  const [items, events, channels] = await Promise.all([
    ga4Report({
      dateRanges,
      dimensions: [{ name: 'itemName' }],
      metrics: [{ name: 'itemsViewed' }, { name: 'itemsAddedToCart' }, { name: 'itemsCheckedOut' }, { name: 'itemsPurchased' }],
      orderBys: [{ metric: { metricName: 'itemsAddedToCart' }, desc: true }],
      limit: 30,
    }),
    ga4Report({
      dateRanges,
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: [...FUNNEL] } } },
    }),
    ga4Report({
      dateRanges,
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'add_to_cart' } } },
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    }),
  ])

  const num = (v?: string) => Number(v ?? 0)
  const byEvent = new Map(events.map(r => [r.dimensionValues?.[0]?.value, r]))
  const data = {
    configured: true,
    days,
    funnel: FUNNEL.map(name => ({
      event: name,
      count: num(byEvent.get(name)?.metricValues?.[0]?.value),
      users: num(byEvent.get(name)?.metricValues?.[1]?.value),
    })),
    items: items
      .map(r => ({
        name: r.dimensionValues?.[0]?.value ?? '',
        viewed: num(r.metricValues?.[0]?.value),
        addedToCart: num(r.metricValues?.[1]?.value),
        checkedOut: num(r.metricValues?.[2]?.value),
        purchased: num(r.metricValues?.[3]?.value),
      }))
      .filter(i => i.addedToCart > 0 && i.name !== '(not set)'),
    channels: channels.map(r => ({
      channel: r.dimensionValues?.[0]?.value ?? '',
      count: num(r.metricValues?.[0]?.value),
      users: num(r.metricValues?.[1]?.value),
    })),
  }
  cache.set(days, { at: Date.now(), data })
  return data
})
