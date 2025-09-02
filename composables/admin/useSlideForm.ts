import type { Database, SlideInsert, SlideRow, SlideUpdate } from '@/types'
import slugify from 'slugify'
import { v4 as uuidv4 } from 'uuid'
import { toast } from 'vue-sonner'

interface UseSlideFromOptions {
  onSuccess?: () => void
}

export function useSlideForm(
  initialData: Ref<SlideRow | null>,
  options: UseSlideFromOptions,
) {
  const supabase = useSupabaseClient<Database>()

  const isSaving = ref(false)
  const imageFile = ref<File | null>(null)
  const imagePreviewUrl = ref<string | null>(null)
  const formData = ref<SlideInsert | SlideUpdate>({})

  const isEditMode = computed(() => !!initialData.value)

  function initialize() {
    imageFile.value = null
    imagePreviewUrl.value = null

    if (isEditMode.value && initialData.value) {
      formData.value = {
        ...initialData.value,
      }
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
      let finalImageUrl = formData.value.image_url

      if (imageFile.value) {
        const sanitizedFileName = slugify(imageFile.value.name, {
          lower: true,
          strict: true,
          locale: 'ru',
        })
        const fileName = `${uuidv4()}-${sanitizedFileName}`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('slides-images')
          .upload(fileName, imageFile.value, { upsert: isEditMode.value })

        if (uploadError)
          throw uploadError

        finalImageUrl = supabase.storage
          .from('slides-images')
          .getPublicUrl(uploadData.path)
          .data
          .publicUrl
      }

      const dataToSave = { ...formData.value, image_url: finalImageUrl }

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
