import { productSlugRedirectFor } from '~/constants/productSlugRedirects'

/**
 * Карточки, сменившие адрес, — постоянным редиректом на живую страницу.
 *
 * Зачем 301: адрес сменился навсегда. Старые URL продолжают получать показы
 * (самый крупный — 165 за 90 дней на позиции 4.8) и отдают 404, то есть весь
 * накопленный вес пропадает, а человек упирается в пустую страницу.
 *
 * ВАЖНО: на бою работает не этот обработчик, а `redirects` в `vercel.json`.
 * Правило `'/catalog/products/**': { swr: 3600 }` заворачивает запрос в
 * функцию раньше, чем сюда дойдёт очередь, — ровно та же история, что с
 * бренд-редиректом рядом. Обработчик оставлен, чтобы `pnpm dev` и локальная
 * сборка вели себя как бой: без него разработчик видел бы 404 там, где на
 * сайте редирект. Список у обоих общий — `constants/productSlugRedirects.ts`,
 * и тест `tests/utils/productSlugRedirects.test.ts` следит, чтобы `vercel.json`
 * от него не отстал.
 */
export default defineEventHandler((event) => {
  const target = productSlugRedirectFor(getRequestURL(event).pathname)
  if (target)
    return sendRedirect(event, target, 301)
})
