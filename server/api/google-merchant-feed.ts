import { serverSupabaseClient } from '#supabase/server'
import { feedItemGroups, feedItemXml } from '~/utils/merchantFeed'
import { formatAgeRange, productAgeMonths } from '~/utils/productAge'
import { attributeSpecRows } from '~/utils/productSpecRows'

/*
 * Фид для Google Merchant Center: /api/google-merchant-feed.
 *
 * Что и почему отдаётся в каждом поле — в utils/merchantFeed.ts, там же
 * тесты. Здесь только выборка и сборка документа.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)

  const { data: products, error } = await supabase
    .from('products')
    .select(`
      id,
      name,
      slug,
      description,
      price,
      final_price,
      discount_percentage,
      stock_quantity,
      barcode,
      gender,
      min_age_months,
      max_age_months,
      min_age_years,
      max_age_years,
      model_group_id,
      brand:brands(name),
      category:categories(name, seo_h1),
      material:materials(name),
      country:countries(name),
      product_images(image_url, display_order),
      product_attribute_values(option_id, numeric_value, attributes(name, slug, display_type, unit, attribute_options(id, value)))
    `)
    .eq('is_active', true)
    .gt('price', 0)
    .order('name', { ascending: true })

  if (error) {
    console.error('Supabase query error:', error)
    throw createError({ statusCode: 500, message: error.message })
  }

  const baseUrl = 'https://uhti.kz'

  /*
   * Вариант `_lg`, а не `_md`: md — 600–800 px, lg — до 1440 px (замер
   * 22 сентября 2026 по 40 товарам). Merchant Center с 31 января 2027
   * требует не меньше 500×500 и просит не отдавать уменьшенные копии.
   */
  const imageUrlOf = (path: string) => {
    const url = path.startsWith('http')
      ? path
      : `https://gvsdevsvzgcivpphcuai.supabase.co/storage/v1/object/public/product-images/${path}`
    return /\.(?:webp|jpg|jpeg|png)$/i.test(url) ? url : `${url}_lg.webp`
  }

  // Характеристики — те же строки, что видны на карточке (utils/productSpecRows.ts)
  const specsOf = (product: any) => attributeSpecRows({
    values: product.product_attribute_values,
    categoryId: null,
    categoryHref: null,
  })

  const groups = feedItemGroups((products || []).map((product: any) => ({
    id: product.id,
    groupId: product.model_group_id ?? null,
    color: specsOf(product).find(r => r.key === 'attr-color')?.value ?? null,
  })))

  const items = (products || [])
    .map((product: any) => {
      // Фото по display_order; без фото товар в фид не идёт.
      const images = [...(product.product_images ?? [])]
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
        .filter(i => i.image_url)
      if (!images.length)
        return null
      const imageUrl = imageUrlOf(images[0].image_url)

      const specs = specsOf(product)
      const age = productAgeMonths(product)
      const ageText = formatAgeRange(age.min, age.max)
      const details = [
        ...specs.map(r => ({ name: r.label, value: r.value })),
        ...(ageText ? [{ name: 'Возраст', value: ageText }] : []),
        ...(product.material?.name ? [{ name: 'Материал', value: product.material.name }] : []),
        ...(product.country?.name ? [{ name: 'Страна производства', value: product.country.name }] : []),
      ]

      return feedItemXml({
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        price: product.price,
        final_price: product.final_price,
        discount_percentage: product.discount_percentage,
        stock_quantity: product.stock_quantity,
        barcode: product.barcode,
        brandName: product.brand?.name ?? null,
        // Читаемое имя раздела: в `name` у части разделов дательный падеж.
        categoryName: product.category?.seo_h1 || product.category?.name || null,
        imageUrl,
        additionalImageUrls: images.slice(1).map(i => imageUrlOf(i.image_url)),
        minAgeMonths: age.min,
        gender: product.gender ?? null,
        color: specs.find(r => r.key === 'attr-color')?.value ?? null,
        details,
        itemGroupId: groups.get(product.id) ?? null,
      }, baseUrl)
    })
    .filter(Boolean)
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Ухтышка - Интернет-магазин игрушек</title>
    <link>${baseUrl}</link>
    <description>Широкий ассортимент качественных игрушек</description>
${items}
  </channel>
</rss>`

  setResponseHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  setResponseHeader(event, 'Cache-Control', 'public, max-age=3600')

  return xml
})
