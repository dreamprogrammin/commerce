/**
 * Акции: пустая закрыта от индекса и не лежит в карте сайта, непустая —
 * открыта и в карте есть.
 *
 * ЗАЧЕМ. Страница акции ставила себе `index, follow` всегда, даже когда в
 * кампании ноль товаров, а ветки для акций в карте сайта не было вовсе. То
 * есть первая же заведённая акция попадала бы в индекс мимо карты, а пустая —
 * в индекс как страница ни о чём.
 *
 * ГЛАВНАЯ ЛОВУШКА, ради которой страж и написан: закрывать надо ЯВНЫМ
 * `noindex: true`. При `{ index: false }` мета-тег говорит `noindex`, а
 * заголовок `x-robots-tag` отдаёт просто `follow` — разрешение индексировать.
 * Поймано запуском 21 сентября; та же грабля описана в `pages/brand/[slug].vue`.
 *
 * СТЕНД — локальная база, потому что на бою активных акций нет. Данные:
 *
 *   INSERT INTO promo_campaigns (slug, title, discount_percentage, is_active, source_type)
 *   VALUES ('probe-s-tovarom', 'Проба с товаром', 10, true, 'category'),
 *          ('probe-pustaya',   'Проба пустая',    10, true, 'category');
 *   INSERT INTO promo_campaign_products (campaign_id, product_id)
 *   SELECT c.id, (SELECT id FROM products WHERE is_active = true LIMIT 1)
 *   FROM promo_campaigns c WHERE c.slug = 'probe-s-tovarom';
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_KEY=<локальный ключ> pnpm dev
 *   BASE=http://localhost:3000 node check-promo-indexability.mjs
 */
import process from 'node:process'

const BASE = process.env.BASE || 'http://localhost:3000'
const WITH_PRODUCTS = process.env.PROMO_FULL || 'probe-s-tovarom'
const EMPTY = process.env.PROMO_EMPTY || 'probe-pustaya'

let failed = false
const check = (ok, label) => {
  if (!ok)
    failed = true
  console.log(`${ok ? '✅' : '❌'} ${label}`)
}

const robotsOf = async (slug) => {
  const res = await fetch(`${BASE}/promo/${slug}`)
  const html = await res.text()
  return {
    code: res.status,
    header: res.headers.get('x-robots-tag') ?? '',
    meta: html.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? '',
  }
}

// ── Непустая акция открыта ────────────────────────────────────────────────
const full = await robotsOf(WITH_PRODUCTS)
check(full.code === 200, `акция с товаром отвечает 200 (${full.code})`)
check(
  full.header.startsWith('index') && full.meta.startsWith('index'),
  `акция с товаром открыта: заголовок «${full.header}», мета «${full.meta}»`,
)

// ── Пустая закрыта, причём В ОБОИХ местах ─────────────────────────────────
const empty = await robotsOf(EMPTY)
check(
  empty.header.includes('noindex'),
  `пустая акция закрыта заголовком: «${empty.header}»`,
)
check(
  empty.meta.includes('noindex'),
  `пустая акция закрыта мета-тегом: «${empty.meta}»`,
)

// ── Карта сайта согласна со страницами ────────────────────────────────────
const routes = await (await fetch(`${BASE}/api/sitemap-routes`)).json()
const promo = routes.filter(r => r.loc.startsWith('/promo/')).map(r => r.loc)
check(promo.includes(`/promo/${WITH_PRODUCTS}`), `в карте есть непустая акция: ${promo.join(', ') || 'ни одной'}`)
check(!promo.includes(`/promo/${EMPTY}`), 'пустой акции в карте нет')

console.log(failed ? '\n❌ есть падения' : '\n✅ всё сошлось')
process.exit(failed ? 1 : 0)
