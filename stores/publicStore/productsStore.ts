import type {
  AccessoryProduct,
  AttributeWithValue,
  Brand,
  BrandForFilter,
  Country,
  Database,
  FullProduct,
  IProductFilters,
  Material,
  ProductLine,
  ProductRow,
  ProductWithGallery,
  ProductWithImages,
  SimpleBrand,
} from "@/types";
import { toast } from "vue-sonner";

export const useProductsStore = defineStore("productsStore", () => {
  const supabase = useSupabaseClient<Database>();

  // ============================================
  // 🔥 STATE - КЭШИРОВАНИЕ МЕТАДАННЫХ
  // ============================================
  const brands = ref<Brand[]>([]);
  const brandsByCategory = ref<Record<string, BrandForFilter[]>>({});
  const productLinesByCategory = ref<Record<string, ProductLine[]>>({});
  const attributesByCategory = ref<Record<string, AttributeWithValue[]>>({});
  const allMaterials = ref<Material[]>([]);
  const allCountries = ref<Country[]>([]);
  const priceRangeByCategory = ref<
    Record<string, { min_price: number; max_price: number }>
  >({});
  const pieceCountRangeByCategory = ref<
    Record<string, { min_count: number; max_count: number }>
  >({});
  const numericAttributeRangesByCategory = ref<
    Record<string, Record<number, { min: number; max: number }>>
  >({});

  // ============================================
  // 📦 МЕТОДЫ С КЭШИРОВАНИЕМ
  // ============================================

  async function fetchAllBrands() {
    if (brands.value.length > 0) {
      console.warn("✅ All brands from cache");
      return;
    }
    try {
      const { data, error } = await supabase
        .from("brands")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      brands.value = data || [];
    } catch (error: any) {
      toast.error("Ошибка при загрузке брендов", {
        description: error.message,
      });
    }
  }

  async function fetchBrandsForCategory(
    categorySlug: string,
  ): Promise<BrandForFilter[]> {
    if (!categorySlug || categorySlug === "all") return [];

    // Проверяем кэш
    if (brandsByCategory.value[categorySlug]) {
      console.warn("✅ Brands from cache:", categorySlug);
      return brandsByCategory.value[categorySlug];
    }

    console.warn("🌐 Fetching brands from server:", categorySlug);

    try {
      const { data, error } = await supabase.rpc(
        "get_brands_by_category_slug",
        {
          p_category_slug: categorySlug,
        },
      );
      if (error) throw error;

      brandsByCategory.value[categorySlug] = data || [];
      return data || [];
    } catch (error: any) {
      console.error("Ошибка загрузки брендов для категории:", error);
      return [];
    }
  }

  // Очистить кеш линеек продуктов
  function clearProductLinesCache(categorySlug?: string) {
    if (categorySlug) {
      delete productLinesByCategory.value[categorySlug];
      console.log("🗑️ Cleared product lines cache for:", categorySlug);
    } else {
      productLinesByCategory.value = {};
      console.log("🗑️ Cleared all product lines cache");
    }
  }

  async function fetchProductLinesForCategory(
    categorySlug: string,
    forceRefresh = false,
  ): Promise<ProductLine[]> {
    if (!categorySlug || categorySlug === "all") return [];

    // Проверяем кэш (если не форсируем обновление)
    if (!forceRefresh && productLinesByCategory.value[categorySlug]) {
      console.warn("✅ Product lines from cache:", categorySlug);
      return productLinesByCategory.value[categorySlug];
    }

    console.warn("🌐 Fetching product lines from server:", categorySlug);

    try {
      const { data, error } = await supabase.rpc(
        "get_product_lines_by_category_slug",
        {
          p_category_slug: categorySlug,
        },
      );

      if (error) throw error;

      // Преобразуем результат RPC в ProductLine[]
      const productLines: ProductLine[] = (data || []).map((line: any) => ({
        id: line.id,
        brand_id: line.brand_id,
        name: line.name,
        slug: line.slug,
        description: line.description || null,
        logo_url: line.logo_url || null,
        seo_description: null,
        seo_keywords: null,
        created_at: "",
        updated_at: "",
      }));

      productLinesByCategory.value[categorySlug] = productLines;
      return productLines;
    } catch (error: any) {
      console.error("Ошибка загрузки линеек для категории:", error);
      return [];
    }
  }

  async function fetchAttributesForCategory(
    categorySlug: string,
  ): Promise<AttributeWithValue[]> {
    if (!categorySlug || categorySlug === "all") return [];

    // Проверяем кэш
    if (attributesByCategory.value[categorySlug]) {
      console.warn("✅ Attributes from cache:", categorySlug);
      return attributesByCategory.value[categorySlug];
    }

    console.warn("🌐 Fetching attributes from server:", categorySlug);

    try {
      const { data: categoryData, error: categoryError } = await supabase
        .from("categories")
        .select("id")
        .eq("slug", categorySlug)
        .maybeSingle();

      if (categoryError) {
        console.error("Error fetching category:", categoryError);
        return [];
      }

      if (!categoryData) {
        console.warn(`Category not found: ${categorySlug}`);
        // Кэшируем пустой результат, чтобы не делать повторные запросы
        attributesByCategory.value[categorySlug] = [];
        return [];
      }

      const { data, error } = await supabase
        .from("attributes")
        .select(
          "*, attribute_options(*), category_attributes!inner(category_id)",
        )
        .eq("category_attributes.category_id", categoryData.id)
        .order("name");

      if (error) throw error;

      attributesByCategory.value[categorySlug] = data || [];
      return data || [];
    } catch (error: any) {
      console.error("Ошибка загрузки атрибутов для фильтров:", error);
      return [];
    }
  }

  async function fetchAllMaterials(): Promise<Material[]> {
    if (allMaterials.value.length > 0) {
      console.warn("✅ Materials from cache");
      return allMaterials.value;
    }

    console.warn("🌐 Fetching materials from server");

    try {
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .order("name");
      if (error) throw error;
      allMaterials.value = data || [];
      return data || [];
    } catch (error: any) {
      toast.error("Ошибка при загрузке материалов", {
        description: error.message,
      });
      return [];
    }
  }

  async function fetchAllCountries(): Promise<Country[]> {
    if (allCountries.value.length > 0) {
      console.warn("✅ Countries from cache");
      return allCountries.value;
    }

    console.warn("🌐 Fetching countries from server");

    try {
      const { data, error } = await supabase
        .from("countries")
        .select("*")
        .order("name");
      if (error) throw error;
      allCountries.value = data || [];
      return data || [];
    } catch (error: any) {
      toast.error("Ошибка при загрузке стран", { description: error.message });
      return [];
    }
  }

  async function fetchPriceRangeForCategory(
    categorySlug: string,
  ): Promise<{ min_price: number; max_price: number }> {
    if (!categorySlug || categorySlug === "all") {
      return { min_price: 0, max_price: 50000 };
    }

    // Проверяем кэш
    if (priceRangeByCategory.value[categorySlug]) {
      console.warn("✅ Price range from cache:", categorySlug);
      return priceRangeByCategory.value[categorySlug];
    }

    console.warn("🌐 Fetching price range from server:", categorySlug);

    try {
      const { data, error } = await supabase
        .rpc("get_category_price_range", { p_category_slug: categorySlug })
        .overrideTypes<{ min_price: number; max_price: number }[]>();

      if (error) throw error;

      const range = data && data.length > 0 ? data[0] : null;
      const result = {
        min_price: Number(range?.min_price || 0),
        max_price: Number(range?.max_price || 50000),
      };

      priceRangeByCategory.value[categorySlug] = result;
      return result;
    } catch (error: any) {
      console.error("Ошибка при получении диапазона цен:", error);
      toast.error("Ошибка при загрузке диапазона цен", {
        description: error.message,
      });
      return { min_price: 0, max_price: 50000 };
    }
  }

  async function fetchPieceCountRangeForCategory(
    categorySlug: string,
  ): Promise<{ min_count: number; max_count: number } | null> {
    if (!categorySlug || categorySlug === "all") {
      return null;
    }

    // Проверяем кэш
    if (pieceCountRangeByCategory.value[categorySlug]) {
      return pieceCountRangeByCategory.value[categorySlug];
    }

    try {
      const { data, error } = await supabase
        .rpc("get_category_piece_count_range", {
          p_category_slug: categorySlug,
        })
        .overrideTypes<{ min_count: number; max_count: number }[]>();

      if (error) throw error;

      const range = data && data.length > 0 ? data[0] : null;

      // Если нет товаров с piece_count в категории - возвращаем null
      if (!range || (range.min_count === null && range.max_count === null)) {
        return null;
      }

      const result = {
        min_count: Number(range.min_count || 0),
        max_count: Number(range.max_count || 1000),
      };

      pieceCountRangeByCategory.value[categorySlug] = result;
      return result;
    } catch (error: any) {
      console.error("Ошибка при получении диапазона деталей:", error);
      return null;
    }
  }

  async function fetchNumericAttributeRange(
    categorySlug: string,
    attributeId: number,
  ): Promise<{ min: number; max: number } | null> {
    if (!categorySlug || categorySlug === "all") {
      return null;
    }

    // Проверяем кэш
    const cached =
      numericAttributeRangesByCategory.value[categorySlug]?.[attributeId];
    if (cached) {
      console.warn(
        "✅ Numeric attribute range from cache:",
        categorySlug,
        attributeId,
      );
      return cached;
    }

    console.warn(
      "🌐 Fetching numeric attribute range from server:",
      categorySlug,
      attributeId,
    );

    try {
      const { data, error } = await supabase.rpc(
        "get_numeric_attribute_range",
        {
          p_category_slug: categorySlug,
          p_attribute_id: attributeId,
        },
      );

      if (error) throw error;

      const range = data && data.length > 0 ? data[0] : null;

      // Если нет товаров с этим числовым атрибутом - возвращаем null
      if (!range || (range.min_value === null && range.max_value === null)) {
        return null;
      }

      const result = {
        min: Number(range.min_value || 0),
        max: Number(range.max_value || 1000),
      };

      // Кэшируем результат
      if (!numericAttributeRangesByCategory.value[categorySlug]) {
        numericAttributeRangesByCategory.value[categorySlug] = {};
      }
      numericAttributeRangesByCategory.value[categorySlug][attributeId] =
        result;

      return result;
    } catch (error: any) {
      console.error(
        "Ошибка при получении диапазона числового атрибута:",
        error,
      );
      return null;
    }
  }

  // ============================================
  // 🧹 УПРАВЛЕНИЕ КЭШЕМ
  // ============================================

  function clearCache() {
    brandsByCategory.value = {};
    productLinesByCategory.value = {};
    attributesByCategory.value = {};
    allMaterials.value = [];
    allCountries.value = [];
    priceRangeByCategory.value = {};
    pieceCountRangeByCategory.value = {};
    numericAttributeRangesByCategory.value = {};
    brands.value = [];
    console.warn("🧹 All cache cleared");
  }

  function clearCategoryCache(categorySlug: string) {
    delete brandsByCategory.value[categorySlug];
    delete productLinesByCategory.value[categorySlug];
    delete attributesByCategory.value[categorySlug];
    delete priceRangeByCategory.value[categorySlug];
    delete pieceCountRangeByCategory.value[categorySlug];
    delete numericAttributeRangesByCategory.value[categorySlug];
    console.warn("🧹 Cache cleared for category:", categorySlug);
  }

  function invalidateProductLinesCache() {
    productLinesByCategory.value = {};
    console.warn("🧹 Product lines cache invalidated");
  }

  function invalidateBrandsCache() {
    brandsByCategory.value = {};
    brands.value = [];
    console.warn("🧹 Brands cache invalidated");
  }

  function invalidateMaterialsCache() {
    allMaterials.value = [];
    console.warn("🧹 Materials cache invalidated");
  }

  function invalidateCountriesCache() {
    allCountries.value = [];
    console.warn("🧹 Countries cache invalidated");
  }

  // ============================================
  // 📊 МЕТОДЫ БЕЗ КЭШИРОВАНИЯ (товары)
  // ============================================

  async function fetchProducts(
    filters: IProductFilters,
    currentPage = 1,
    pageSize = 12,
  ): Promise<{ products: ProductWithGallery[]; hasMore: boolean }> {
    try {
      const { data: rpcResponse, error } = await supabase.rpc(
        "get_filtered_products",
        {
          p_category_slug: filters.categorySlug,
          p_subcategory_ids: filters.subCategoryIds,
          p_brand_ids: filters.brandIds,
          p_price_min: filters.priceMin,
          p_price_max: filters.priceMax,
          p_sort_by: filters.sortBy,
          p_page_size: pageSize,
          p_page_number: currentPage,
          p_country_ids: filters.countryIds,
          p_material_ids: filters.materialIds,
          p_attributes: filters.attributes,
          p_product_line_ids: filters.productLineIds,
          p_piece_count_min: filters.pieceCountMin,
          p_piece_count_max: filters.pieceCountMax,
        },
      );

      if (error) throw error;

      const newProducts = (rpcResponse || []).map((p) => {
        return {
          ...p,
          product_images: Array.isArray(p.product_images)
            ? p.product_images
            : [],
          brands: p.brand_name
            ? ({
              id: p.brand_id,
              name: p.brand_name,
              slug: p.brand_slug,
            } as SimpleBrand)
            : null,
        };
      }) as unknown as ProductWithGallery[];

      const hasMore = newProducts.length === pageSize;
      return { products: newProducts, hasMore };
    } catch (error: any) {
      toast.error("Ошибка при загрузке товаров", {
        description: error.message,
      });
      return { products: [], hasMore: false };
    }
  }

  async function fetchProductBySlug(slug: string): Promise<FullProduct | null> {
    const { data, error } = await supabase
      .from("products")
      .select(
        `
        *,
        categories(name, slug),
        product_images(*),
        brands(*),
        product_lines(*),
        countries(*),
        materials(*),
        product_attribute_values(*, attributes(*, attribute_options(*)))
      `,
      )
      .eq("slug", slug)
      .eq("is_active", true)
      .order("display_order", {
        referencedTable: "product_images",
        ascending: true,
      })
      .single();

    // Товар не найден — возвращаем null (вызывающий код покажет 404)
    if (error && error.code === "PGRST116") return null;

    // Ошибка сети/Supabase — пробрасываем наверх (НЕ глотаем)
    if (error) throw error;

    return data as FullProduct | null;
  }

  async function fetchProductsByIds(
    ids: string[],
  ): Promise<ProductWithImages[]> {
    if (!ids || ids.length === 0) return [];
    try {
      const { data, error } = await supabase
        .from("products")
        .select(
          "*, product_images(*), categories(name, slug), brands(id, name, slug, logo_url)",
        )
        .in("id", ids)
        .eq("is_active", true)
        .order("display_order", {
          referencedTable: "product_images",
          ascending: true,
        });

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      toast.error("Ошибка загрузки связанных товаров", {
        description: error.message,
      });
      return [];
    }
  }

  async function fetchFeaturedProducts(
    limit: number = 5,
  ): Promise<FullProduct[]> {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name, slug), product_images(*)")
        .eq("is_active", true)
        .eq("is_featured", true) // 🎯 Только избранные
        .order("featured_order", { ascending: true }) // 🎯 По порядку
        .order("display_order", {
          referencedTable: "product_images",
          ascending: true,
        })
        .limit(limit);

      if (error) throw error;

      // 🔄 Fallback: если избранных нет - берём по бонусам
      if (!data || data.length === 0) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("products")
          .select("*, categories(name, slug), product_images(*)")
          .eq("is_active", true)
          .order("bonus_points_award", { ascending: false })
          .order("display_order", {
            referencedTable: "product_images",
            ascending: true,
          })
          .limit(limit);

        if (fallbackError) throw fallbackError;
        return (fallbackData as FullProduct[]) || [];
      }

      return (data as FullProduct[]) || [];
    } catch (error: any) {
      toast.error("Ошибка при загрузке товаров дня", {
        description: error.message,
      });
      return [];
    }
  }

  async function fetchNewestProducts(
    limit: number = 10,
  ): Promise<ProductWithGallery[]> {
    const { products } = await fetchProducts(
      {
        categorySlug: "all",
        sortBy: "newest",
      },
      1,
      limit,
    );
    return products;
  }

  async function fetchPopularProducts(
    limit: number = 10,
  ): Promise<ProductWithGallery[]> {
    const { products } = await fetchProducts(
      {
        categorySlug: "all",
        sortBy: "popularity",
      },
      1,
      limit,
    );
    return products;
  }

  async function fetchSimilarProducts(
    categoryId: string | null,
    excludeIds: string[],
    limit?: number,
  ): Promise<AccessoryProduct[]> {
    if (!categoryId || !Array.isArray(excludeIds) || excludeIds.length === 0) {
      return [];
    }

    try {
      let query = supabase
        .from("products")
        .select("*, product_images(*)")
        .eq("category_id", categoryId)
        .eq("is_active", true)
        .not("id", "in", `(${excludeIds.join(",")})`)
        .order("display_order", {
          referencedTable: "product_images",
          ascending: true,
        });

      if (limit && limit > 0) {
        query = query.limit(limit);
      }
      const { data, error } = await query;
      if (error) throw error;

      return data || [];
    } catch (error: any) {
      toast.error("Ошибка при загрузке похожих товаров", {
        description: error.message,
      });
      return [];
    }
  }

  async function getProductById(productId: string): Promise<ProductRow | null> {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Ошибка загрузки продукта по ID", error);
      return null;
    }
  }

  /**
   * Поиск товаров по имени и описанию
   * @param query - поисковый запрос
   * @param page - номер страницы
   * @param pageSize - количество товаров на странице
   * @returns объект с товарами и флагом hasMore
   */
  async function searchProductsByQuery(
    query: string,
    page: number = 1,
    pageSize: number = 24,
  ): Promise<{
    products: ProductWithGallery[];
    hasMore: boolean;
    total: number;
  }> {
    if (!query.trim()) {
      return { products: [], hasMore: false, total: 0 };
    }

    try {
      const offset = (page - 1) * pageSize;

      // Сначала получаем общее количество
      const { count, error: countError } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`);

      if (countError) throw countError;

      // Затем получаем товары для текущей страницы
      const { data, error } = await supabase
        .from("products")
        .select(
          `
        *,
        product_images(id, image_url, blur_placeholder, display_order, alt_text),
        brands(id, name, slug),
        categories(name, slug)
      `,
        )
        .eq("is_active", true)
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
        .order("sales_count", { ascending: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) throw error;

      const products = (data || []).map((product) => ({
        ...product,
        product_images: Array.isArray(product.product_images)
          ? product.product_images.sort(
            (a, b) => a.display_order - b.display_order,
          )
          : [],
        brands: product.brands as SimpleBrand | null,
      })) as unknown as ProductWithGallery[];

      const total = count || 0;
      const hasMore = offset + pageSize < total;

      return { products, hasMore, total };
    } catch (error: any) {
      console.error("Ошибка поиска товаров:", error);
      toast.error("Ошибка при поиске товаров", { description: error.message });
      return { products: [], hasMore: false, total: 0 };
    }
  }

  /**
   * Получение популярных поисковых запросов
   * (можно реализовать через таблицу search_analytics или возвращать статичные)
   */
  function getPopularSearchQueries(): string[] {
    return [
      "LEGO",
      "мягкие игрушки",
      "конструктор",
      "кукла",
      "машинка",
      "пазлы",
      "настольные игры",
    ];
  }

  /**
   * Автодополнение для поиска (suggestions)
   * Возвращает товары и бренды, подходящие под запрос
   */
  async function getSearchSuggestions(query: string, limit: number = 5) {
    if (!query.trim() || query.length < 2) {
      return { products: [], brands: [] };
    }

    try {
      // Поиск товаров
      const { data: products, error: productsError } = await supabase
        .from("products")
        .select("id, name, slug, price")
        .eq("is_active", true)
        .ilike("name", `%${query}%`)
        .order("sales_count", { ascending: false })
        .limit(limit);

      if (productsError) throw productsError;

      // Поиск брендов
      const { data: brands, error: brandsError } = await supabase
        .from("brands")
        .select("id, name, slug")
        .ilike("name", `%${query}%`)
        .limit(3);

      if (brandsError) throw brandsError;

      return {
        products: products || [],
        brands: brands || [],
      };
    } catch (error: any) {
      console.error("Ошибка получения подсказок:", error);
      return { products: [], brands: [] };
    }
  }

  // ============================================
  // 📤 RETURN
  // ============================================

  return {
    // State
    brands,
    brandsByCategory,
    productLinesByCategory,
    attributesByCategory,
    allMaterials,
    allCountries,
    priceRangeByCategory,
    pieceCountRangeByCategory,
    numericAttributeRangesByCategory,

    // Методы
    fetchAllBrands,
    fetchProducts,
    fetchProductBySlug,
    fetchFeaturedProducts,
    fetchNewestProducts,
    fetchPopularProducts,
    fetchSimilarProducts,
    fetchProductsByIds,
    fetchBrandsForCategory,
    fetchProductLinesForCategory,
    clearProductLinesCache,
    fetchAttributesForCategory,
    getProductById,
    fetchPriceRangeForCategory,
    fetchPieceCountRangeForCategory,
    fetchNumericAttributeRange,
    fetchAllMaterials,
    fetchAllCountries,
    searchProductsByQuery,
    getPopularSearchQueries,
    getSearchSuggestions,

    // Управление кэшем
    clearCache,
    clearCategoryCache,
    invalidateBrandsCache,
    invalidateProductLinesCache,
    invalidateMaterialsCache,
    invalidateCountriesCache,
  };
});
