import type { Database, IProductFilters, Product } from "@/types";

export const useProductsStore = defineStore('productsStore', () => {
  const supabase = useSupabaseClient<Database>();
  
  const products = ref<Product[]>([]);
  const isLoading = ref(false);

  async function fetchProducts(filters: IProductFilters) {
    isLoading.value = true;
    products.value = [];
    try {
      const { data, error } = await supabase.rpc('get_filtered_products', {
        p_category_slug: filters.categorySlug,
        p_subcategory_ids: filters.subCategoryIds,
        p_price_min: filters.priceMin,
        p_price_max: filters.priceMax,
        p_sort_by: filters.sortBy,
      });

      if (error) throw error;
      products.value = data || [];
    } catch (e) {
      console.error(`Ошибка при загрузке отфильтрованных товаров:`, e);
    } finally {
      isLoading.value = false;
    }
  }
  
  return { products, isLoading, fetchProducts };
});