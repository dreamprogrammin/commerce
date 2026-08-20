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

/**
 * Директивы предпросмотра для индексируемых страниц.
 *
 * Зачем. Без них Google показывает в выдаче маленькую квадратную миниатюру
 * вместо крупной картинки, режет сниппет и не берёт видео. Для магазина
 * игрушек, где продаёт именно картинка, это прямая потеря.
 *
 * Почему добавляется здесь, а не по страницам. Значение по умолчанию у
 * `@nuxtjs/robots` (`robotsEnabledValue`) эти директивы УЖЕ содержит, поэтому
 * страницы, которые про robots не объявляют ничего, получали правильную
 * строку: на 20 августа это были ровно `/brands`, `/privacy-policy` и
 * `/returns`. А остальные 307 адресов объявляли `'index, follow'` — и своим
 * объявлением значение по умолчанию УХУДШАЛИ. Проверено переобходом карты:
 * три адреса с директивами против 307 без них.
 *
 * Поэтому строка и правило собираются в одном месте: страницы по-прежнему
 * говорят «индексировать», а чем именно это разворачивается — решается тут.
 */
const PREVIEW_SUFFIX = 'max-image-preview:large, max-snippet:-1, max-video-preview:-1'

const PREVIEW_RULE = {
  'max-image-preview': 'large',
  'max-snippet': -1,
  'max-video-preview': -1,
} as const

/** Правило в форме, которую принимает `useRobotsRule`. */
export interface RobotsRule {
  'index'?: boolean
  'noindex'?: boolean
  'follow'?: boolean
  'nofollow'?: boolean
  'max-image-preview'?: 'none' | 'standard' | 'large'
  'max-snippet'?: number
  'max-video-preview'?: number
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
  if (!isSiteIndexable())
    return NOINDEX

  // Закрытым страницам предпросмотр не нужен, и `noindex` с
  // `max-image-preview` в одной строке выглядит противоречиво.
  if (whenIndexable.includes('noindex'))
    return whenIndexable

  if (whenIndexable.includes('max-image-preview'))
    return whenIndexable

  return `${whenIndexable}, ${PREVIEW_SUFFIX}`
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

  useRobotsRule(computed(() => {
    if (!indexable)
      return NOINDEX_RULE

    const value = toValue(rule)

    // Именно это правило побеждает и в мета-теге, и в заголовке, поэтому
    // директивы предпросмотра дописываются здесь же — иначе строка из
    // `useRobotsContent` будет перебита урезанной.
    return value.noindex ? value : { ...value, ...PREVIEW_RULE }
  }))
}
