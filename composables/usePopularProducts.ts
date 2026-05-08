import { useQuery } from '@tanstack/vue-query'

export function usePopularProducts(limit = 5) {
  const supabase = useSupabaseClient()

  return useQuery({
    queryKey: ['popular-products-footer', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, slug, price, final_price')
        .eq('is_active', true)
        .gt('stock_quantity', 0)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data || []
    },
    staleTime: 60 * 60 * 1000, // 1 час
    gcTime: 2 * 60 * 60 * 1000, // 2 часа
  })
}
