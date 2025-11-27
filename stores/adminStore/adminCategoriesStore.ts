import type { CategoryInsert, CategoryRow, EditableCategory } from '@/types'
import type { Database } from '@/types/supabase'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
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
  blur_placeholder: string | null // 🆕 Добавили blur
  icon_name: string | null
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
    blur_placeholder: item.blur_placeholder, // 🆕 Добавили blur
    icon_name: item.icon_name,
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
    blur_placeholder: item.blur_placeholder, // 🆕 Добавили blur
    icon_name: item.icon_name,
  }
}

export const useAdminCategoriesStore = defineStore('adminCategoriesStore', () => {
  const supabase = useSupabaseClient<Database>()
  const { uploadFile, removeFile } = useSupabaseStorage()

  const categoriesStore = useCategoriesStore()

  const allCategories = ref<CategoryRow[]>([])
  const isLoading = ref(false)
  const isSaving = ref(false)

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
      const originalItems = new Map(allCategories.value.map(c => [c.id, c]))

      async function processTree(items: EditableCategory[], parentId: string | null) {
        for (const [index, item] of items.entries()) {
          const originalItem = item.id ? originalItems.get(item.id) : null

          console.log(`🔍 Обработка item: ${item.name}`, {
            hasFile: !!item._imageFile,
            hasBlur: !!item._blurPlaceholder,
            blurLength: item._blurPlaceholder?.length,
          }) // 🔍 ЛОГ

          // 🆕 Обработка изображения с blur
          if (item._imageFile) {
            console.log(`📤 Загружаем файл для: ${item.name}`) // 🔍 ЛОГ

            // Удаляем старое изображение если оно было
            if (originalItem?.image_url) {
              await removeFile('category-images', originalItem.image_url)
            }

            // Загружаем новое изображение
            const newPath = await uploadFile(item._imageFile, {
              bucketName: 'category-images',
              filePathPrefix: `categories/${item.slug || 'new'}`,
            })

            // Сохраняем путь к изображению и blur
            item.image_url = newPath || null
            item.blur_placeholder = item._blurPlaceholder || null // 🆕 Сохраняем blur!

            console.log(`✅ Файл загружен для: ${item.name}`, {
              imagePath: item.image_url,
              hasBlur: !!item.blur_placeholder,
              blurLength: item.blur_placeholder?.length,
              blurPreview: item.blur_placeholder?.substring(0, 50),
            }) // 🔍 ЛОГ
          }
          else if (originalItem?.image_url && item.image_url === null) {
            // Если изображение было удалено
            await removeFile('category-images', originalItem.image_url)
            item.blur_placeholder = null // 🆕 Очищаем blur тоже
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
          }
          else if (item.id) {
            toUpdate.push(createUpdatePayload(item, parentId, index))
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

        const filesToDelete = toDelete.map(d => d.imageUrl).filter((url): url is string => !!url)
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
