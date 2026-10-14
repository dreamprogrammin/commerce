import { sortKeysInPlace } from '@/utils/stableKeyOrder'

/**
 * Ключи данных страницы — в одном и том же порядке при каждом рендере.
 *
 * Nuxt кладёт `payload.data[ключ]` и `payload._errors[ключ]` в момент, когда
 * `useAsyncData` завершился, — в порядке ответов, а не объявления. На
 * прогретом сервере подвал (`footer-categories`, из кеша) отвечает раньше
 * товаров раздела, на холодном — позже, и HTML одной и той же страницы
 * расходится в 78 байтах порядка ключей. Vercel списывает запись ISR при любой
 * разнице, а пересборка часто попадает на холодный экземпляр функции. Замер
 * 13 октября 2026: «Куклы» и «Батарейки» расходились на каждом холодном
 * старте, главная — нет.
 *
 * `app:rendered` срабатывает до того, как Nuxt пишет payload и в HTML, и в
 * `_payload.json` (`@nuxt/nitro-server`, handlers/renderer.mjs). В браузере
 * порядок ключей ни на что не влияет — данные достаются по ключу.
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hooks.hook('app:rendered', () => {
    sortKeysInPlace(nuxtApp.payload.data)
    sortKeysInPlace(nuxtApp.payload._errors as Record<string, unknown> | undefined)
  })
})
