/**
 * Колонки категорий для публичной части — всё, кроме `seo_text` и подложек.
 *
 * Раньше здесь стоял `select('*')`, и на КАЖДУЮ страницу сайта уезжали
 * SEO-тексты всех 64 категорий: 76 КБ в базе, а в payload Nuxt — 115 КБ
 * (63 строки вида `<h2 data-icon=…>` примерно по 1.8 КБ). Публично это поле
 * не выводится нигде: единственный его читатель — форма в админке, а она
 * работает через adminCategoriesStore со своим запросом.
 *
 * По той же причине здесь нет `blur_placeholder` и `blur_data_url`.
 * Замерено на превью: data:URI составляли 50-56% сжатого веса КАЖДОГО
 * документа (`/catalog/boys` — 78.5 КБ brotli против 39.2 КБ без них,
 * главная — 55.9 против 24.6), и подложки всех 51 категории с картинкой
 * уезжали на каждую страницу сайта. При этом в первой отрисовке они не
 * участвуют нигде: сетка `/catalog` рисует картинки внутри `ClientOnly` и
 * только при `!isMobile`, `HomePopularCategories` монтируется по
 * `requestIdleCallback`, а `components/category/CategoryDescription.vue`
 * (третий читатель поля) вообще ни на одной странице не подключён.
 * Поэтому подложки догружаются на клиенте — `loadCategoryBlurPlaceholders`.
 *
 * `blur_data_url` — отдельная история: у категорий поле не заполнено ни в
 * одной строке и не читается ни одним компонентом. Это поле баннеров и
 * слайдов, здесь оно оказалось по недоразумению.
 *
 * Перечислено списком, а не вычитанием: PostgREST не умеет «всё кроме», а
 * `select('*')` вернул бы поле обратно при любом изменении схемы.
 *
 * Список лежит здесь, а не в сторе, потому что читателей два: сам стор и
 * серверный обработчик `server/api/categories.get.ts`, который кеширует
 * выборку. Нитро не может импортировать из `stores/` — там Pinia и
 * композаблы приложения.
 */
export const PUBLIC_CATEGORY_COLUMNS = [
  'id',
  'name',
  'slug',
  'href',
  'description',
  'parent_id',
  'is_root_category',
  'display_in_menu',
  'display_order',
  'image_url',
  'icon_name',
  'created_at',
  'updated_at',
  'is_featured',
  'featured_order',
  'seo_title',
  'seo_h1',
  'seo_keywords',
  'allowed_brand_ids',
  'allowed_product_line_ids',
  'meta_title',
  'meta_description',
  'meta_keywords',
  'seo_description',
  'canonical_url',
  'og_title',
  'og_description',
  'og_image',
].join(', ')
