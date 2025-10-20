import type { ChildrenInsert, ChildrenRow, ChildrenUpdate, Database } from '@/types'
import { toast } from 'vue-sonner'
import { usePersonalizationStore } from '../core/personalizationStore'

export const useChildrenStore = defineStore('childrenStore', () => {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  const personalizationStore = usePersonalizationStore()

  const children = ref<ChildrenRow[]>([])
  const isLoading = ref(false)

  async function fetchChildren() {
    if (!user.value)
      return
    isLoading.value = true
    try {
      const { data, error } = await supabase
        .from('children')
        .select('*')
        .eq('user_id', user.value.id)
        .order('created_at', { ascending: true })
      if (error)
        throw error
      children.value = data || []
    }
    catch (e: any) {
      toast.error('Ошибка при загрузке данных о детях', { description: e.message })
    }
    finally {
      isLoading.value = false
    }
  }

  async function addChild(childrenData: ChildrenInsert) {
    isLoading.value = true
    try {
      const payload = { ...childrenData, user_id: user.value.id }
      const { error } = await supabase.from('children').insert(payload)
      if (error)
        throw error

      toast.success('Данные о ребенке успешно добавлены!')
      await fetchChildren()

      personalizationStore.invalidate()
    }
    catch (e: any) {
      toast.error('Не удалось добавить ребенка', { description: e.message })
    }
    finally {
      isLoading.value = false
    }
  }

  async function updateChild(id: string, updatedData: ChildrenUpdate) {
    isLoading.value = true
    try {
      const { error } = await supabase.from('children').update(updatedData).eq('id', id)
      if (error)
        throw error

      toast.success('Данные о ребенке успешно обновлены!')
      await fetchChildren()

      personalizationStore.invalidate()
    }
    catch (e: any) {
      toast.error('Не удалось обновить данные', { description: e.message })
    }
    finally {
      isLoading.value = false
    }
  }

  async function deleteChild(id: string) {
    isLoading.value = true
    try {
      const { error } = await supabase.from('children').delete().eq('id', id)
      if (error)
        throw error

      toast.success('Данные о ребенке успешно удалены!')
      await fetchChildren()

      personalizationStore.invalidate()
    }
    catch (e: any) {
      toast.error('Не удалось удалить данные', { description: e.message })
    }
    finally {
      isLoading.value = false
    }
  }

  return {
    isLoading,
    children,
    fetchChildren,
    addChild,
    updateChild,
    deleteChild,
  }
})
