import type { MaybeRefOrGetter } from 'vue'

/**
 * Директивы robots с оглядкой на то, индексируем ли сайт вообще.
 *
 * Зачем. Превью (`dev.uhti.kz`) закрыто от обхода через robots.txt, но
 * заголовок `X-Robots-Tag` там оставался разрешающим. Причина: страницы
 * прописывали `index, follow` жёстко, `@nuxtjs/robots` собирает заголовок
 * из этого значения при отрисовке и перебивал и правило маршрута, и серверный
 * плагин — оба способа были испробованы и отброшены.
 *
 * Поэтому значение спрашивается здесь, в одном месте. Новая страница, которая
 * позовёт эти композаблы вместо литералов, закроется автоматически.
 *
 * На боевой сборке `indexable` истинно и возвращается ровно то, что передали,
 * — поведение не меняется. Флаг приходит из `site.indexable` в nuxt.config,
 * который выключается на превью по `VERCEL_ENV`.
 */

const NOINDEX = 'noindex, nofollow'

/** Правило в форме, которую принимает `useRobotsRule`. */
export interface RobotsRule {
  index?: boolean
  noindex?: boolean
  follow?: boolean
  nofollow?: boolean
}

const NOINDEX_RULE: RobotsRule = { noindex: true, nofollow: true }

function isSiteIndexable(): boolean {
  // Именно useSiteConfig, а не runtimeConfig: ключа `site` в
  // runtimeConfig.public нет вовсе — проверено на собранном приложении, там
  // лежат только siteUrl, supabase и прочее. Первая версия читала оттуда,
  // всегда получала undefined и возвращала разрешающее значение.
  const site = useSiteConfig() as { indexable?: boolean | string } | undefined

  // Сравнение со строкой, а не приведение к boolean: значение приходит и из
  // конфига (boolean), и из переменной окружения NUXT_PUBLIC_SITE_INDEXABLE,
  // где непустая строка "false" истинна как раз наоборот.
  return String(site?.indexable ?? 'true') !== 'false'
}

/** Значение мета-тега `robots` для `useHead`/`useSeoMeta`. */
export function useRobotsContent(whenIndexable: string): string {
  return isSiteIndexable() ? whenIndexable : NOINDEX
}

/**
 * То же для `useRobotsRule` — второго механизма, которым страницы объявляют
 * свою индексируемость.
 *
 * Он нужен отдельно, потому что именно `useRobotsRule` ставит итоговый
 * мета-тег и заголовок, ПЕРЕБИВАЯ значение из `useHead`. Проверено 17 августа
 * на превью: страницы с жёстким `{ index: true, follow: true }` отдавали
 * `x-robots-tag: index, follow` при `robots.txt` с `Disallow: /` — по
 * `data-hint="useRobotsRule"` в разметке видно, чьё значение победило.
 *
 * Флаг читается СРАЗУ, а не внутри computed: computed вычисляется лениво,
 * уже вне setup-контекста, и `useSiteConfig` там падает. На этом же
 * спотыкался `/catalog` — отдавал 500, пока вызов не вынесли в setup.
 */
export function useIndexableRobotsRule(rule: MaybeRefOrGetter<RobotsRule>): void {
  const indexable = isSiteIndexable()

  useRobotsRule(computed(() => (indexable ? toValue(rule) : NOINDEX_RULE)))
}
