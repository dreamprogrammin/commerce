import type { Banner, Database } from '@/types'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_VARIANTS_WIDE } from '@/config/images'
import { BUCKET_NAME_BANNERS } from '@/constants'

export function useAdminBanners() {
  const supabase = useSupabaseClient<Database>()
  const { removeFile } = useSupabaseStorage()

  function _getVariantPaths(url: string): string[] {
    if (/\.\w{3,4}$/.test(url)) {
      return [url]
    }
    return Object.values(IMAGE_VARIANTS_WIDE).map(v => `${url}${v.suffix}.webp`)
  }

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

    // Находим баннер для удаления файлов из Storage
    const bannerToDelete = data.value?.find(b => b.id === id)
    if (bannerToDelete?.image_url) {
      await removeFile(BUCKET_NAME_BANNERS, _getVariantPaths(bannerToDelete.image_url))
    }

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
