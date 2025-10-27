import type { Database, SlideRow } from '@/types'

export function useSlides() {
  const supabase = useSupabaseClient<Database>()
  const key = 'global-slides'

  const asyncData = useAsyncData<SlideRow[]>(
    key,
    async () => {
      const { data, error } = await supabase
        .from('slides')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true })

      if (error) {
        console.error('Ошибка при загрузке слайдов', error)
        throw createError({
          statusCode: 500,
          statusMessage: 'Не удалось загрузить слайды',
          fatal: false,
        })
      }

      return data || []
    },
    {
      lazy: true,
      default: () => [], // 👈 Добавьте default
    },
  )

  // 👇 Правильная проверка для lazy: true
  const isLoading = computed(() => asyncData.pending.value)

  return {
    slides: asyncData.data,
    error: asyncData.error,
    refresh: asyncData.refresh,
    isLoading,
  }
}
