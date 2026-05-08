import { useQuery } from '@tanstack/vue-query'

export function usePopularCategories(limit = 6) {
  const supabase = useSupabaseClient()

  return useQuery({
    queryKey: ['popular-categories', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug')
        .eq('is_active', true)
        .not('parent_id', 'is', null) // Только подкатегории
        .order('created_at', { ascending: true })
        .limit(limit)

      if (error) throw error
      return data || []
    },
    staleTime: 60 * 60 * 1000, // 1 час
    gcTime: 2 * 60 * 60 * 1000, // 2 часа
  })
}
