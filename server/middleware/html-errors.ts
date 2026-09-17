/**
 * Страницы отвечают человеку разметкой, а не JSON — кто бы ни спросил.
 *
 * Nitro выбирает формат ошибки по заголовку `Accept`: есть `text/html` —
 * рисует страницу, нет — отдаёт JSON. Само по себе разумно, но на
 * `/catalog/products/**` стоит `swr: 3600`, и правило кеширует ЛЮБОЙ ответ,
 * включая 404. Дальше происходит вот что: первым по адресу приходит краулер
 * или мониторинг, не просящий разметку, получает JSON — и этот JSON ложится в
 * кеш на час всем остальным, включая браузеры.
 *
 * Поймано на бою 17 сентября 2026: `/catalog/products/net-takogo-tovara-12345`
 * отдавал браузеру `content-type: application/json` с `x-vercel-cache: HIT`.
 * То есть человек, пришедший из поиска на снятый товар, видел
 * `{"error": true, "statusCode": 404, …}` вместо страницы. Воспроизводится
 * двумя запросами подряд: сначала без `text/html` в Accept, потом браузерным.
 *
 * Чинить заголовком `Vary` бессмысленно: вариантов `Accept` столько же,
 * сколько клиентов, и кеш разлетится в пыль. Запретить кеширование ошибок
 * тоже не вышло — рендерер Nuxt ставит 404-ым `cache-control: no-cache`
 * поверх любого нашего заголовка. Поэтому чиним причину: у страничных адресов
 * ответ должен быть разметкой всегда, и тогда кеш безвреден.
 *
 * Чего НЕ трогаем: `/api/**` (там JSON — это контракт), служебные пути Nuxt
 * и всё, что похоже на файл (`robots.txt`, `sitemap.xml`, картинки).
 */
export default defineEventHandler((event) => {
  if (event.method !== 'GET')
    return

  const path = event.path.split('?')[0]
  if (path.startsWith('/api') || path.startsWith('/_') || path.includes('.'))
    return

  const accept = getRequestHeader(event, 'accept') ?? ''
  if (accept.includes('text/html'))
    return

  event.node.req.headers.accept = accept
    ? `text/html,${accept}`
    : 'text/html'
})
