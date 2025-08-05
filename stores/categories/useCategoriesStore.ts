import type { CategoryMenuItem, Database } from "@/types"

export const useCategoriesStore = defineStore('categories', () => {
    const supabase = useSupabaseClient<Database>()

    const menuTree = ref<CategoryMenuItem[]>([])
    const isLoading = ref(false)

    async function fetchMenuTree() {
        if (menuTree.value.length > 0) return

        isLoading.value = true

   try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('display_in_menu', true) // Выбираем только те, что нужно показывать
        .order('display_order', { ascending: true });

      if (error) throw error;
      
      const categoryMap = new Map<string, CategoryMenuItem>();
      const rootItems: CategoryMenuItem[] = [];

      data.forEach(item => {
        const categoryItem: CategoryMenuItem = { ...item, children: [] };
        categoryMap.set(item.id, categoryItem);
        if (item.is_root_category) {
          rootItems.push(categoryItem);
        }
      });

      data.forEach(item => {
        if (item.parent_id) {
          const parent = categoryMap.get(item.parent_id);
          parent?.children?.push(categoryMap.get(item.id)!);
        }
      });
      
      menuTree.value = rootItems;

    } catch (e) {
      console.error("Ошибка при загрузке дерева меню:", e);
    } finally {
      isLoading.value = false;
    }
  }

  return { menuTree, isLoading, fetchMenuTree };
})