import { dropPriceValidUntilWithoutStart } from '@/utils/offerSchema'

/**
 * Срок цены (`priceValidUntil`) в разметке — только вместе с её началом
 * (`validFrom`). Search Console отмечает «Отсутствует поле validFrom» на любом
 * Offer, где срок есть, а начала нет; разбор — utils/offerSchema.ts.
 *
 * Граф `nuxt-schema-org` (карточка товара) достраивает `@unhead/schema-org`:
 * Offer без срока получает «конец следующего года». Здесь срок снимается у
 * Offer без начала — уже в готовом JSON. Хуки head идут по порядку
 * подключения, граф собирается в `tags:resolve` плагина `nuxt-schema-org:init`,
 * поэтому `dependsOn`. Только сервер — как и сам граф: в сборке с SSR модуль
 * ставит `reactive: false`, и `nuxt-schema-org:init` в браузере не
 * подключается (в `pnpm dev` — подключается, там срок у товара без скидки
 * останется, на бой это не влияет).
 */
export default defineNuxtPlugin({
  name: 'schema-org-offer-validity',
  dependsOn: ['nuxt-schema-org:init'],
  setup() {
    injectHead().hooks.hook('tags:resolve', (ctx) => {
      for (const tag of ctx.tags) {
        if (tag.tag === 'script' && tag.props.type === 'application/ld+json' && typeof tag.innerHTML === 'string')
          tag.innerHTML = dropPriceValidUntilWithoutStart(tag.innerHTML)
      }
    })
  },
})
