import type { Database, SlideRow } from '@/types'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'

const BUCKET_NAME = 'slides-images'

export function useAdminSlides() {
  const supabase = useSupabaseClient<Database>()
  const { removeFile } = useSupabaseStorage()

  const asyncData = useAsyncData(
    'admin-all-slides',
    async () => {
      const { data, error } = await supabase
        .from('slides')
        .select('*')
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (error)
        throw error

      return data
    },
    { lazy: false },
  )

  const isFormOpen = ref(false)
  const selectedSlide = ref<SlideRow | null>(null)

  function openFormForNew() {
    selectedSlide.value = null
    isFormOpen.value = true
  }

  function openFormForEdit(slide: SlideRow) {
    selectedSlide.value = { ...slide }
    isFormOpen.value = true
  }

  async function handleDelete(slideId: string) {
    // Находим слайд по ID
    const slide = asyncData.data.value?.find(s => s.id === slideId)

    if (!slide) {
      toast.error('Слайд не найден')
      return
    }

    if (!toast.warning(`Вы уверены, что хотите удалить слайд "${slide.title}"?`)) {
      return
    }

    const toastId = toast.loading('Удаление слайда...')

    try {
      // Удаляем изображение через useSupabaseStorage, если оно есть
      if (slide.image_url) {
        await removeFile(BUCKET_NAME, slide.image_url)
      }

      // Удаляем запись из базы данных
      const { error: dbError } = await supabase
        .from('slides')
        .delete()
        .eq('id', slide.id)

      if (dbError)
        throw dbError

      toast.success('Слайд успешно удален!', { id: toastId })
      await asyncData.refresh()
    }
    catch (e: any) {
      toast.error('Ошибка при удалении', {
        id: toastId,
        description: e.message,
      })
    }
  }

  async function handleFormSaved() {
    isFormOpen.value = false
    selectedSlide.value = null
    await asyncData.refresh()
  }

  const isLoading = computed(() => asyncData.status.value === 'pending')

  return {
    slides: asyncData.data,
    isLoading,
    error: asyncData.error,
    isFormOpen,
    selectedSlide,
    openFormForNew,
    openFormForEdit,
    handleDelete,
    handleFormSaved,
  }
}
