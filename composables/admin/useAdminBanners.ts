import type { Banner, Database } from '@/types'
import { toast } from 'vue-sonner'

export function useAdminBanners() {
  const supabase = useSupabaseClient<Database>()

  const { data, pending, error, refresh } = useAsyncData(
    'admin-banners',
    async () => {
      const { data, error } = await supabase
        .from('banners')
        .select('*')
        .order('display_order', { ascending: true })

      if (error)
        throw error
      return data
    },
    { lazy: true },
  )

  const isFormOpen = ref(false)
  const selectedBanner = ref<Banner | null>(null)

  function openFormForNew() {
    selectedBanner.value = null
    isFormOpen.value = true
  }

  function openFormForEdit(banner: Banner) {
    selectedBanner.value = banner
    isFormOpen.value = true
  }

  async function handleDelete(id: string) {
    if (!toast.warning('Вы уверены, что хотите удалить этот баннер?'))
      return

    const { error } = await supabase.from('banners').delete().eq('id', id)

    if (error) {
      toast.error('Ошибка удаления', { description: error.message })
    }
    else {
      toast.success('Баннер удален')
      refresh()
    }
  }

  function handleFormSaved() {
    refresh()
  }

  return {
    banners: data, // ✅ Возвращаем data, а не query
    isLoading: pending,
    error,
    isFormOpen,
    selectedBanner,
    openFormForNew,
    openFormForEdit,
    handleDelete,
    handleFormSaved,
  }
}
