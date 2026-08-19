import { buildBrandLandingPath, parseCatalogSlug } from '~/utils/brandLanding'

/**
 * Старые бренд-лендинги `/catalog/boys?brand=mattel` — постоянным редиректом
 * на `/catalog/boys/brand/mattel`.
 *
 * Зачем 301, а не просто оставить оба адреса рабочими: эти четырнадцать
 * страниц уже в индексе и на них ведут ссылки. Без редиректа они станут
 * дублями нового пути, а накопленный вес не перейдёт.
 *
 * 301, а не 302, намеренно: адрес сменился навсегда, и поисковику надо
 * сказать именно это — иначе он продолжит ходить по старому.
 *
 * Прочие параметры сохраняются: если в адресе была ещё и сортировка, она
 * доедет до нового пути.
 *
 * ВАЖНО: на Vercel этот обработчик до старых адресов не доходит. Правило
 * `'/catalog/**': { isr: 1800 }` заворачивает запрос в ISR-функцию раньше,
 * причём query-строка при этом заменяется — внутрь не попадает ни `brand=`,
 * ни возможность его увидеть. Проверено на превью: `?brand=mattel` отдавал
 * 200 и нефильтрованную категорию вместо 301.
 *
 * Поэтому боевой редирект стоит выше ISR — в `redirects` файла `vercel.json`,
 * который платформа обрабатывает до маршрутизации функций. Здесь обработчик
 * оставлен ради локальной сборки и `pnpm dev`, где vercel.json не читается:
 * без него разработчик видел бы поведение, отличное от боевого.
 *
 * ДВЕ ЗАЩИТЫ НИЖЕ ОБЯЗАНЫ БЫТЬ И В `vercel.json`. Комментарий висит здесь,
 * потому что JSON их не держит, а разошлись эти два места мгновенно:
 *
 *  1. Пропуск адресов, где хвост `/brand/<слаг>` уже есть. Правило платформы
 *     сопоставлялось с ЛЮБЫМ `/catalog/**`, а цель тащила `?brand=` дальше —
 *     и снова подходила под то же правило. На превью получалась бесконечная
 *     петля: `/catalog/boys?brand=mattel` → `…/brand/mattel?brand=mattel` →
 *     `…/brand/mattel/brand/mattel?brand=mattel` и так далее, восемь шагов и
 *     не кончалось. Браузер отдал бы ERR_TOO_MANY_REDIRECTS на всех
 *     четырнадцати старых бренд-адресах, которые уже в индексе.
 *     В `vercel.json` это `source: "/catalog/:path((?!.*\/brand\/).*)"`.
 *  2. Удаление самого параметра. Здесь оно на строке ниже; платформа же
 *     переносит исходную query-строку в цель сама, так что `?brand=` остаётся
 *     в адресе. Приложению он не виден — ISR всё равно срезает query до
 *     функции, — но именно из-за этого переноса и возникала петля.
 */
export default defineEventHandler((event) => {
  const url = getRequestURL(event)

  if (!url.pathname.startsWith('/catalog/'))
    return

  const brandSlug = url.searchParams.get('brand')
  if (!brandSlug)
    return

  // На адресе, который уже переведён на путь, параметр `brand` означал бы
  // что-то другое — не трогаем.
  const segments = url.pathname.replace(/^\/catalog\//, '').split('/')
  if (parseCatalogSlug(segments).brandSlug)
    return

  url.searchParams.delete('brand')
  const rest = url.searchParams.toString()
  const target = buildBrandLandingPath(url.pathname, brandSlug) + (rest ? `?${rest}` : '')

  return sendRedirect(event, target, 301)
})
