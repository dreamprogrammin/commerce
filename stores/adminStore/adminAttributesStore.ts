import type { Attribute, AttributeInsert, AttributeOptionInsert, CategoryRow, Database, SimpleAttributeOption } from '@/types'
import { toast } from 'vue-sonner'

export const useAdminAttributesStore = defineStore('adminAttributesStore', () => {
  const supabase = useSupabaseClient<Database>()

  const attributes = ref<Attribute[]>([])
  const categories = ref<CategoryRow[]>([])
  const isLoading = ref(false)

  // -- АТРИБУТЫ --

  async function fetchAllCategories() {
    try {
      const { data, error } = await supabase.from('categories').select('*').order('name')
      if (error)
        throw error
      categories.value = data || []
    }
    catch (error: any) {
      toast.error('Ошибка загрузки категорий', { description: error.message })
    }
  }

  async function fetchAttributeById(id: number): Promise<Attribute | null> {
    try {
      const { data, error } = await supabase
        .from('attributes')
        .select('*')
        .eq('id', id)
        .single()
      if (error)
        throw error
      return data
    }
    catch (error: any) {
      console.error('Ошибка загрузки атрибута по ID', error)
      return null
    }
  }

  async function fetchAttributes() {
    isLoading.value = true
    try {
      const { data, error } = await supabase
        .from('attributes')
        .select('*')
        .order('name')
      if (error)
        throw error
      attributes.value = data || []
    }
    catch (error: any) {
      toast.error('Ошибка загрузки атрибутов', { description: error.message })
    }
    finally {
      isLoading.value = false
    }
  }

  async function createAttribute(attributeData: AttributeInsert): Promise<Attribute | null> {
    try {
      const { data, error } = await supabase
        .from('attributes')
        .insert(attributeData)
        .select()
        .single()
      if (error)
        throw error
      toast.success(`Атрибут "${data.name}" создан.`)
      await fetchAttributes() // Обновляем список
      return data
    }
    catch (error: any) {
      toast.error('Ошибка создания атрибута', { description: error.message })
      return null
    }
  }

  // -- ОПЦИИ АТРИБУТОВ (значения для select) --

  async function fetchOptionsForAttribute(attributeId: number): Promise<SimpleAttributeOption[]> {
    try {
      const { data, error } = await supabase
        .from('attribute_options')
        .select('*')
        .eq('attribute_id', attributeId)
        .order('value')
      if (error)
        throw error
      return (data as unknown as SimpleAttributeOption[]) || []
    }
    catch (error: any) {
      toast.error('Ошибка загрузки опций', { description: error.message })
      return []
    }
  }

  async function addOptionToAttribute(optionData: AttributeOptionInsert): Promise<SimpleAttributeOption | null> {
    try {
      const { data, error } = await supabase
        .from('attribute_options')
        .insert(optionData)
        .select()
        .single()
      if (error)
        throw error
      toast.success(`Опция "${data.value}" добавлена.`)
      return data as unknown as SimpleAttributeOption
    }
    catch (error: any) {
      toast.error('Ошибка добавления опции', { description: error.message })
      return null
    }
  }
  async function getLinkedCategoryIds(attributeId: number): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('category_attributes')
        .select('category_id')
        .eq('attribute_id', attributeId)
      if (error)
        throw error
      return data.map(item => item.category_id)
    }
    catch (error: any) {
      toast.error('Ошибка загрузки связанных категорий', { description: error.message })
      return []
    }
  }

  async function updateLinkedCategories(attributeId: number, categoryIds: string[]) {
    try {
      // 1. Сначала удаляем все старые связи для этого атрибута
      const { error: deleteError } = await supabase
        .from('category_attributes')
        .delete()
        .eq('attribute_id', attributeId)
      if (deleteError)
        throw deleteError

      // 2. Затем вставляем новые, если они есть
      if (categoryIds.length > 0) {
        const linksToInsert = categoryIds.map(catId => ({
          attribute_id: attributeId,
          category_id: catId,
        }))
        const { error: insertError } = await supabase
          .from('category_attributes')
          .insert(linksToInsert)
        if (insertError)
          throw insertError
      }

      toast.success('Связи с категориями успешно обновлены.')
    }
    catch (error: any) {
      toast.error('Ошибка обновления связей', { description: error.message })
    }
  }

  async function deleteOption(optionId: number): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('attribute_options')
        .delete()
        .eq('id', optionId)
      if (error)
        throw error

      toast.success('Опция успешно удалена.')
      return true
    }
    catch (error: any) {
      toast.error('Ошибка удаления опции', { description: error.message })
      return false
    }
  }

  async function updateAttribute(attributeId: number, updates: Partial<AttributeInsert>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('attributes')
        .update(updates)
        .eq('id', attributeId)
      if (error)
        throw error

      return true
    }
    catch (error: any) {
      toast.error('Ошибка обновления атрибута', { description: error.message })
      return false
    }
  }

  return {
    attributes,
    isLoading,
    fetchAttributes,
    fetchAttributeById,
    createAttribute,
    updateAttribute,
    fetchOptionsForAttribute,
    addOptionToAttribute,
    categories,
    fetchAllCategories,
    getLinkedCategoryIds,
    updateLinkedCategories,
    deleteOption,
  }
})
