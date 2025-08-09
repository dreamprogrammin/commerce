import type {
  CategoryInsert,
  CategoryRow,
  CategoryUpdate,
  Database,
  EditableCategory,
} from '@/types'
import { toast } from 'vue-sonner'

export const useAdminCategoriesStore = defineStore(
  'adminCategoriesStore',
  () => {
    const supabase = useSupabaseClient<Database>()
    const allCategories = ref<CategoryRow[]>([])
    const isLoading = ref(false)

    async function fetchAllCategories(force = false) {
      if (allCategories.value.length > 0 && !force)
        return
      isLoading.value = true
      try {
        const { data, error } = await supabase
          .from('categories')
          .select('*')
          .order('display_order')
        if (error)
          throw error
        allCategories.value = data || []
      }
      catch (e) {
        toast.error('Ошибка загрузки категорий', {
          description: (e as Error).message,
        })
      }
      finally {
        isLoading.value = false
      }
    }

    function buildCategoryTree(
      parentId: string | null = null,
    ): EditableCategory[] {
      const children = allCategories.value
        .filter(c => c.parent_id === parentId)
        .map(c => ({
          ...c,
          children: buildCategoryTree(c.id),
        }))
      return children
    }

    async function saveChanges(itemsToSave: EditableCategory[]) {
      const itemsToInsert: CategoryInsert[] = []
      const itemsToUpdate: { updates: CategoryUpdate, id: string }[] = []
      const itemsToDelete: string[] = []

      function collectChanges(
        items: EditableCategory[],
        parentId: string | null = null,
      ) {
        items.forEach((item, index) => {
          const currentItem = {
            ...item,
            parent_id: parentId,
            display_order: index,
          }

          if (item._isDeleted && item.id) {
            itemsToDelete.push(item.id)
          }
          else if (item._isNew) {
            const {
              id,
              created_at,
              updated_at,
              children,
              _tempId,
              _isNew,
              _isDeleted,
              ...insertData
            } = currentItem
            itemsToInsert.push(insertData)
          }
          else if (item.id) {
            const {
              id,
              created_at,
              updated_at,
              children,
              _tempId,
              _isNew,
              _isDeleted,
              ...updateData
            } = currentItem
            itemsToUpdate.push({ updates: updateData, id: item.id })
          }

          if (item.children?.length) {
            collectChanges(item.children, item.id)
          }
        })
      }

      collectChanges(itemsToSave)

      try {
        if (itemsToDelete.length > 0) {
          const { error } = await supabase
            .from('categories')
            .delete()
            .in('id', itemsToDelete)
          if (error)
            throw error
        }
        if (itemsToInsert.length > 0) {
          const { error } = await supabase
            .from('categories')
            .insert(itemsToInsert)
          if (error)
            throw error
        }
        if (itemsToUpdate.length > 0) {
          for (const { updates, id } of itemsToUpdate) {
            const { error } = await supabase
              .from('categories')
              .update(updates)
              .eq('id', id)
            if (error)
              throw error
          }
        }

        toast.success('Категории успешно сохранены!')
        await fetchAllCategories(true) // Перезагружаем данные
        return true
      }
      catch (e) {
        toast.error('Ошибка сохранения категорий', {
          description: (e as Error).message,
        })
        return false
      }
    }

    return {
      allCategories,
      isLoading,
      fetchAllCategories,
      buildCategoryTree,
      saveChanges,
    }
  },
)
