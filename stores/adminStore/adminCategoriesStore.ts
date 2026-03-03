import type { CategoryInsert, CategoryRow, EditableCategory } from '@/types'
import type { Database } from '@/types/supabase'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_OPTIMIZATION_ENABLED, IMAGE_VARIANTS } from '@/config/images'
import { generateImageVariants } from '@/utils/imageOptimizer'
import { useCategoriesStore } from '../publicStore/categoriesStore'

interface CategoryUpsertPayload {
  id: string
  name: string
  slug: string
  href: string
  description: string | null
  parent_id: string | null
  is_root_category: boolean
  display_in_menu: boolean
  display_order: number
  image_url: string | null
  blur_placeholder: string | null
  icon_name: string | null
  // 🆕 SEO поля
  seo_title: string | null
  seo_h1: string | null
  seo_text: string | null
  seo_keywords: string[] | null
  // 🆕 Meta-теги для поисковых систем
  meta_title: string | null
  meta_description: string | null
  meta_keywords: string[] | null
  // 🆕 Фильтры по брендам и линейкам
  allowed_brand_ids: string[] | null
  allowed_product_line_ids: string[] | null
}

// Хелпер для нормализации полей-массивов (строка -> массив)
function normalizeArrayField(value: any): string[] | null {
  if (!value) return null
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    // Разбиваем строку по запятым и очищаем
    const items = value.split(',').map(s => s.trim()).filter(s => s.length > 0)
    return items.length > 0 ? items : null
  }
  return null
}

function createInsertPayload(item: EditableCategory, parentId: string | null, displayOrder: number): CategoryInsert {
  return {
    name: item.name,
    slug: item.slug,
    href: item.href,
    description: item.description,
    parent_id: parentId,
    is_root_category: item.is_root_category,
    display_in_menu: item.display_in_menu,
    display_order: displayOrder,
    image_url: item.image_url,
    blur_placeholder: item.blur_placeholder,
    icon_name: item.icon_name,
    // 🆕 SEO поля
    seo_title: item.seo_title || null,
    seo_h1: item.seo_h1 || null,
    seo_text: item.seo_text || null,
    seo_keywords: normalizeArrayField(item.seo_keywords),
    // 🆕 Meta-теги для поисковых систем
    meta_title: item.meta_title || null,
    meta_description: item.meta_description || null,
    meta_keywords: normalizeArrayField(item.meta_keywords),
    // 🆕 Фильтры
    allowed_brand_ids: normalizeArrayField(item.allowed_brand_ids),
    allowed_product_line_ids: normalizeArrayField(item.allowed_product_line_ids),
  }
}

function createUpdatePayload(item: EditableCategory, parentId: string | null, displayOrder: number): CategoryUpsertPayload {
  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    href: item.href,
    description: item.description,
    parent_id: parentId,
    is_root_category: item.is_root_category,
    display_in_menu: item.display_in_menu,
    display_order: displayOrder,
    image_url: item.image_url,
    blur_placeholder: item.blur_placeholder,
    icon_name: item.icon_name,
    // 🆕 SEO поля
    seo_title: item.seo_title || null,
    seo_h1: item.seo_h1 || null,
    seo_text: item.seo_text || null,
    seo_keywords: normalizeArrayField(item.seo_keywords),
    // 🆕 Meta-теги для поисковых систем
    meta_title: item.meta_title || null,
    meta_description: item.meta_description || null,
    meta_keywords: normalizeArrayField(item.meta_keywords),
    // 🆕 Фильтры
    allowed_brand_ids: normalizeArrayField(item.allowed_brand_ids),
    allowed_product_line_ids: normalizeArrayField(item.allowed_product_line_ids),
  }
}

export const useAdminCategoriesStore = defineStore('adminCategoriesStore', () => {
  const supabase = useSupabaseClient<Database>()
  const { uploadFile, removeFile, generateSeoFileName } = useSupabaseStorage()

  function _isLegacyPath(url: string): boolean {
    return /\.\w{3,4}$/.test(url)
  }

  function _getVariantPaths(url: string): string[] {
    if (_isLegacyPath(url)) {
      return [url]
    }
    return Object.values(IMAGE_VARIANTS).map(v => `${url}${v.suffix}.webp`)
  }

  const categoriesStore = useCategoriesStore()

  const allCategories = ref<CategoryRow[]>([])
  const isLoading = ref(false)
  const isSaving = ref(false)

  // --- SEO: Уведомление поисковиков о изменениях категорий ---
  async function notifySearchEngines(categorySlugs: string[]) {
    if (categorySlugs.length === 0)
      return
    try {
      const urls = categorySlugs.map(slug => `/catalog/${slug}`)
      await $fetch('/api/seo/notify-indexing', {
        method: 'POST',
        body: { urls, type: 'updated' },
      })
    }
    catch {
      // Не блокируем основной флоу если SEO уведомление не прошло
    }
  }

  async function fetchAllCategories(force = false) {
    if (allCategories.value.length > 0 && !force)
      return
    isLoading.value = true
    try {
      const { data, error } = await supabase.from('categories').select('*').order('display_order')
      if (error)
        throw error
      allCategories.value = data || []
    }
    catch (e: any) {
      toast.error('Ошибка загрузки категорий', { description: e.message })
    }
    finally {
      isLoading.value = false
    }
  }

  function buildCategoryTree(parentId: string | null = null): EditableCategory[] {
    return allCategories.value
      .filter(c => c.parent_id === parentId)
      .map(c => ({
        ...c,
        children: buildCategoryTree(c.id),
      }))
  }

  function updateFeaturedStatus(categoryIds: string[], isFeatured: boolean) {
    allCategories.value.forEach((cat, index) => {
      if (categoryIds.includes(cat.id)) {
        allCategories.value[index] = {
          ...cat,
          is_featured: isFeatured,
        }
      }
    })
  }

  async function saveFeaturedChanges(): Promise<boolean> {
    const featuredIds = allCategories.value
      .filter(cat => cat.is_featured)
      .map(cat => cat.id)

    const notFeaturedIds = allCategories.value
      .filter(cat => !cat.is_featured)
      .map(cat => cat.id)

    try {
      const setFeaturedPromise = supabase
        .from('categories')
        .update({ is_featured: true })
        .in('id', featuredIds)

      const setNotFeaturedPromise = supabase
        .from('categories')
        .update({ is_featured: false })
        .in('id', notFeaturedIds)

      const [featuredResult, notFeaturedResult] = await Promise.all([
        setFeaturedPromise,
        setNotFeaturedPromise,
      ])

      if (featuredResult.error)
        throw featuredResult.error
      if (notFeaturedResult.error)
        throw notFeaturedResult.error
      return true
    }
    catch (error: any) {
      toast.error('Ошибка при сохранении популярных категорий', { description: error.message })
      return false
    }
  }

  async function saveChanges(tree: EditableCategory[]) {
    isSaving.value = true
    try {
      const toInsert: CategoryInsert[] = []
      const toUpdate: CategoryUpsertPayload[] = []
      const toDelete: { id: string, imageUrl: string | null }[] = []
      const changedSlugs: string[] = [] // 🔍 SEO: Собираем slugs изменённых категорий
      const originalItems = new Map(allCategories.value.map(c => [c.id, c]))

      async function processTree(items: EditableCategory[], parentId: string | null) {
        for (const [index, item] of items.entries()) {
          const originalItem = item.id ? originalItems.get(item.id) : null

          // Обработка изображения с вариантами (sm/md/lg)
          if (item._imageFile) {
            // Удаляем все варианты старого изображения
            if (originalItem?.image_url) {
              await removeFile('category-images', _getVariantPaths(originalItem.image_url))
            }

            const seoName = item.name ? `category-${item.name}` : undefined
            const filePathPrefix = `categories/${item.slug || 'new'}`

            if (IMAGE_OPTIMIZATION_ENABLED) {
              // Платный тариф: загружаем оригинал
              const newPath = await uploadFile(item._imageFile, {
                bucketName: 'category-images',
                filePathPrefix,
                seoName,
              })
              item.image_url = newPath || null
              item.blur_placeholder = item._blurPlaceholder || null
            }
            else {
              // Бесплатный тариф: генерируем 3 варианта
              const variants = await generateImageVariants(item._imageFile)
              const baseSeoName = generateSeoFileName(item._imageFile, seoName).replace(/\.[^.]+$/, '')

              const uploadResults = await Promise.all(
                (['sm', 'md', 'lg'] as const).map(variant =>
                  uploadFile(variants[variant], {
                    bucketName: 'category-images',
                    filePathPrefix,
                    customFileName: `${baseSeoName}${IMAGE_VARIANTS[variant].suffix}.webp`,
                  }),
                ),
              )

              if (uploadResults[0]) {
                item.image_url = `${filePathPrefix}/${baseSeoName}`
              }
              else {
                item.image_url = null
              }
              item.blur_placeholder = variants.blurPlaceholder || item._blurPlaceholder || null
            }
          }
          else if (originalItem?.image_url && item.image_url === null) {
            // Удаляем все варианты при удалении изображения
            await removeFile('category-images', _getVariantPaths(originalItem.image_url))
            item.blur_placeholder = null
          }
          else if (!item._imageFile && item._blurPlaceholder) {
            // 🆕 ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: Если blur есть, но файл не загружался (редактирование существующей категории)
            item.blur_placeholder = item._blurPlaceholder
          }

          if (item._isDeleted && item.id) {
            toDelete.push({ id: item.id, imageUrl: originalItem?.image_url || null })
            const queue = [...(item.children || [])]
            while (queue.length > 0) {
              const current = queue.shift()
              if (current?.id) {
                const originalChild = originalItems.get(current.id)
                toDelete.push({ id: current.id, imageUrl: originalChild?.image_url || null })
              }
              if (current?.children)
                queue.push(...current.children)
            }
            continue
          }

          if (item._isNew) {
            if (!item.name || !item.slug || !item.href)
              throw new Error(`Новая категория должна иметь название, слаг и ссылку.`)
            toInsert.push(createInsertPayload(item, parentId, index))
            changedSlugs.push(item.slug) // 🔍 SEO
          }
          else if (item.id) {
            toUpdate.push(createUpdatePayload(item, parentId, index))
            changedSlugs.push(item.slug) // 🔍 SEO
          }

          if (item.children?.length) {
            await processTree(item.children, item.id)
          }
        }
      }

      await processTree(tree, null)

      if (toDelete.length > 0) {
        const idsToDelete = toDelete.map(d => d.id)
        const { error } = await supabase.from('categories').delete().in('id', idsToDelete)
        if (error)
          throw error

        const filesToDelete = toDelete
          .map(d => d.imageUrl)
          .filter((url): url is string => !!url)
          .flatMap(url => _getVariantPaths(url))
        if (filesToDelete.length > 0) {
          await removeFile('category-images', filesToDelete)
        }
      }

      if (toUpdate.length > 0) {
        const { error } = await supabase.from('categories').upsert(toUpdate)
        if (error)
          throw error
      }

      if (toInsert.length > 0) {
        const { error } = await supabase.from('categories').insert(toInsert)
        if (error)
          throw error
      }

      toast.success('Категории успешно сохранены!')
      await fetchAllCategories(true)
      await categoriesStore.forceRefetch()

      // 🔍 SEO: Уведомляем поисковики об изменённых категориях
      if (changedSlugs.length > 0) {
        notifySearchEngines(changedSlugs)
      }

      return true
    }
    catch (e: any) {
      toast.error('Ошибка сохранения категорий', { description: e.message })
      return false
    }
    finally {
      isSaving.value = false
    }
  }

  return {
    allCategories,
    isLoading,
    isSaving,
    fetchAllCategories,
    updateFeaturedStatus,
    saveFeaturedChanges,
    buildCategoryTree,
    saveChanges,
  }
})
