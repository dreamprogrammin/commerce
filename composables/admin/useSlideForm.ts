import type { Database, SlideInsert, SlideRow, SlideUpdate } from '@/types'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'

const BUCKET_NAME = 'slides-images'

interface UseSlideFromOptions {
  onSuccess?: () => void
}

export function useSlideForm(
  initialData: Ref<SlideRow | null>,
  options: UseSlideFromOptions,
) {
  const supabase = useSupabaseClient<Database>()
  const { uploadFile, removeFile } = useSupabaseStorage()

  const isSaving = ref(false)
  const imageFile = ref<File | null>(null)
  const imagePreviewUrl = ref<string | null>(null)
  const oldImagePath = ref<string | null>(null)
  const formData = ref<SlideInsert | SlideUpdate>({})

  const isEditMode = computed(() => !!initialData.value)

  function initialize() {
    imageFile.value = null
    imagePreviewUrl.value = null
    oldImagePath.value = null

    if (isEditMode.value && initialData.value) {
      formData.value = {
        ...initialData.value,
      }
      // Сохраняем старый путь к изображению для последующего удаления
      oldImagePath.value = initialData.value.image_url || null
    }
    else {
      formData.value = {
        title: '',
        description: '',
        image_url: null,
        cta_link: '',
        cta_text: '',
        is_active: true,
        display_order: 0,
      }
    }
  }

  function removeImage() {
    imageFile.value = null
    imagePreviewUrl.value = null

    if (formData.value.image_url) {
      formData.value.image_url = null
    }
  }

  function handleImageChange(event: Event) {
    const target = event.target as HTMLInputElement
    if (target.files && target.files[0]) {
      imageFile.value = target.files[0]
      imagePreviewUrl.value = URL.createObjectURL(target.files[0])
    }
  }

  async function handleSubmit() {
    isSaving.value = true
    const toastId = toast.loading('Сохранение данных...')

    try {
      let finalImagePath = formData.value.image_url

      // Если выбран новый файл изображения
      if (imageFile.value) {
        // Загружаем новое изображение через useSupabaseStorage
        const uploadedPath = await uploadFile(imageFile.value, {
          bucketName: BUCKET_NAME,
          filePathPrefix: '', // Без префикса, файлы в корне бакета
          upsert: false, // Всегда создаем новый файл с уникальным именем
        })

        if (!uploadedPath) {
          throw new Error('Не удалось загрузить изображение')
        }

        finalImagePath = uploadedPath

        // Если это редактирование и было старое изображение, удаляем его
        if (isEditMode.value && oldImagePath.value && oldImagePath.value !== finalImagePath) {
          await removeFile(BUCKET_NAME, oldImagePath.value)
        }
      }

      const dataToSave = { ...formData.value, image_url: finalImagePath }

      if (isEditMode.value) {
        const { error } = await supabase
          .from('slides')
          .update(dataToSave)
          .eq('id', initialData.value!.id)

        if (error)
          throw error
        toast.success('Слайд успешно обновлен!', { id: toastId })
      }
      else {
        const { error } = await supabase
          .from('slides')
          .insert(dataToSave as SlideInsert)
        if (error)
          throw error
        toast.success('Слайд успешно создан!', { id: toastId })
      }

      options.onSuccess?.()
    }
    catch (e: any) {
      toast.error('Ошибка при сохранении', {
        id: toastId,
        description: e.message,
      })
    }
    finally {
      isSaving.value = false
    }
  }

  const ctaTextValue = computed({
    get: () => formData.value.cta_text as string,
    set: (value: string) => {
      formData.value.cta_text = value
    },
  })

  const ctaLinkValue = computed({
    get: () => formData.value.cta_link as string,
    set: (value: string) => {
      formData.value.cta_link = value
    },
  })

  const descriptionValue = computed({
    get: () => formData.value.description as string,
    set: (value: string) => {
      formData.value.description = value
    },
  })

  watch(initialData, initialize, { immediate: true })

  return {
    formData,
    isSaving,
    isEditMode,
    imagePreviewUrl,
    handleSubmit,
    removeImage,
    handleImageChange,
    ctaTextValue,
    ctaLinkValue,
    descriptionValue,
  }
}
