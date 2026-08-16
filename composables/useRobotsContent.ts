/**
 * Значение мета-тега `robots` с оглядкой на то, индексируем ли сайт вообще.
 *
 * Зачем. Превью (`dev.uhti.kz`) закрыто от обхода через robots.txt, но
 * заголовок `X-Robots-Tag` там оставался разрешающим. Причина: одиннадцать
 * страниц прописывали `index, follow` жёстко, `@nuxtjs/robots` собирает
 * заголовок из этого мета-тега при отрисовке и перебивал и правило маршрута,
 * и серверный плагин — оба способа были испробованы и отброшены.
 *
 * Поэтому значение спрашивается здесь, в одном месте. Новая страница,
 * которая позовёт этот композабл вместо строкового литерала, закроется
 * автоматически.
 *
 * На боевой сборке `indexable` истинно и возвращается ровно то, что передали,
 * — поведение не меняется. Флаг приходит из `site.indexable` в nuxt.config,
 * который выключается на превью по `VERCEL_ENV`.
 */
const NOINDEX = 'noindex, nofollow'

export function useRobotsContent(whenIndexable: string): string {
  // Именно useSiteConfig, а не runtimeConfig: ключа `site` в
  // runtimeConfig.public нет вовсе — проверено на собранном приложении, там
  // лежат только siteUrl, supabase и прочее. Первая версия читала оттуда,
  // всегда получала undefined и возвращала разрешающее значение.
  const site = useSiteConfig() as { indexable?: boolean | string } | undefined

  // Сравнение со строкой, а не приведение к boolean: значение приходит и из
  // конфига (boolean), и из переменной окружения NUXT_PUBLIC_SITE_INDEXABLE,
  // где непустая строка "false" истинна как раз наоборот.
  const indexable = String(site?.indexable ?? 'true') !== 'false'

  return indexable ? whenIndexable : NOINDEX
}
