import { toast } from "vue-sonner";
import { useSupabaseStorage } from "~/composables/menuItems/useSupabaseStorage";
import type {
  Database,
  IItemToDelete,
  MenuItemInsert,
  MenuItemRow,
  MenuItemUpdate,
} from "~/types";

export const useMenuAdminStore = defineStore("menuAdminStore", () => {
  const supabase = useSupabaseClient<Database>();
  const { removeFile } = useSupabaseStorage();
  const BUCKET_NAME = "menu-item-images";

  const items = ref<MenuItemRow[]>([]);
  const isLoading = ref(false);
  const storeError = ref<string | null>(null);

  function getChildren(parentSlug: string | null): MenuItemRow[] {
    if (!parentSlug) return [];
    return items.value
      .filter((item) => item.parent_slug === parentSlug)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  }

  async function fetchItems() {
    isLoading.value = true;
    storeError.value = null;
    try {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw error;
      items.value = data || [];
    } catch (e) {
      storeError.value = handleSupabaseError(e, {
        operationName: "загрузке списка меню",
      });
    } finally {
      isLoading.value = false;
    }
  }

  async function addItem(newItem: MenuItemInsert): Promise<MenuItemRow | null> {
    isLoading.value = true;
    storeError.value = null;
    try {
      const { data, error } = await supabase
        .from("menu_items")
        .insert(newItem)
        .select()
        .single();
      if (error) throw error;
      if (data)
        toast.success("Успех", {
          description: `Пункт меню "${data.title}" добавлен.`,
        });
      return data as MenuItemRow;
    } catch (e) {
      storeError.value = handleSupabaseError(e, {
        operationName: "добавлении пункта меню",
      });
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  async function updateItem(
    itemId: string,
    updates: MenuItemUpdate,
  ): Promise<MenuItemRow | null> {
    isLoading.value = true;
    storeError.value = null;
    try {
      const { data, error } = await supabase
        .from("menu_items")
        .update(updates)
        .eq("id", itemId)
        .select()
        .single();
      if (error) throw error;
      if (data)
        toast.success("Успех", {
          description: `Пункт меню "${data.title}" обновлен.`,
        });
      return data as MenuItemRow;
    } catch (e) {
      storeError.value = handleSupabaseError(e, {
        operationName: "обновлении пункта меню",
      });
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  async function deleteItem(itemToDelete: IItemToDelete) {
    if (!confirm(`Вы уверены, что хотите удалить "${itemToDelete.title}"?`))
      return;
    isLoading.value = true;
    storeError.value = null;
    try {
      if (itemToDelete.image_url) {
        await removeFile(BUCKET_NAME, itemToDelete.image_url);
      }
      const { error } = await supabase
        .from("menu_items")
        .delete()
        .eq("id", itemToDelete.id);
      if (error) throw error;
      await fetchItems();
      toast.success("Успех", {
        description: `Элемент "${itemToDelete.title}" удален.`,
      });
    } catch (e) {
      storeError.value = handleSupabaseError(e, {
        operationName: "удалении пункта меню",
      });
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  return {
    items,
    isLoading,
    storeError,
    fetchItems,
    addItem,
    updateItem,
    deleteItem,
    getChildren,
  };
});
