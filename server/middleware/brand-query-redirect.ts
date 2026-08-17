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
