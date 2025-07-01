import { handleError } from "vue";
import { toast } from "vue-sonner";
import Label from "~/components/ui/label/Label.vue";
import { useSupabaseStorage } from "~/composables/menuItems/useSupabaseStorage";
import { staticMainMenuItems } from "~/config/staticItems";
import { BUCKET_NAME } from "~/constants";
import type {
  Database,
  IParentSelectOption,
  MenuItemInsert,
  MenuItemRow,
  MenuItemUpdate,
} from "~/types";

export const useTopMenuItemsStore = defineStore("topMenuItemsStore", () => {
  const supabase = useSupabaseClient<Database>();

  // --State--
  const items = ref<MenuItemRow[]>([]);
  const isLoading = ref(false);
  const storeError = ref<string | null>(null);

  // --Getter--

  const parentSlugOptions = computed<IParentSelectOption[]>(() => {
    return staticMainMenuItems
      .filter((item) => item.isTrigger)
      .map((item) => ({
        value: item.slug,
        label: item.title,
      }));
  });

  function getChildren(parentSlug: string): MenuItemRow[] {
    if (!parentSlug) return [];
    return items.value
      .filter((item) => item.parent_slug === parentSlug)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  }

  // --Actions--

  async function fetchItems() {
    isLoading.value = true;
    storeError.value = null;

    try {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .order("parent_slug")
        .order("display_order");
      if (error) throw error;
      items.value = data || [];
    } catch (e) {
      storeError.value = handleSupabaseError(e, {
        operationName: "Загрузка под категорий",
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
      if (data) {
        items.value.push(data as MenuItemRow);
        toast.success("Успех", {
          description: `Подкатегория "${data.title}" добавлена.`,
        });
        return data as MenuItemRow;
      }
      return null;
    } catch (e) {
      storeError.value = handleSupabaseError(e, {
        operationName: "Добавление подкатегории",
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

      if (data) {
        const index = items.value.findIndex((item) => item.id === itemId);
        if (index !== -1) {
          items.value[index] = data as MenuItemRow;
        }
        toast.success("Успех", {
          description: `Подкатегория "${data.title}" обновлена.`,
        });
        return data as MenuItemRow;
      }
      return null;
    } catch (e) {
      storeError.value = handleSupabaseError(e, {
        operationName: "обновлении подкатегории",
      });
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  async function deleteItem(itemToDelete: MenuItemRow) {
    const conformation = confirm(
      `Вы уверены, что хотите удалить подкатегорию "${itemToDelete.title}"?`,
    );
    if (!conformation) return;

    isLoading.value = true;
    storeError.value = null;

    try {
      if (itemToDelete.image_url) {
        const { removeFile } = useSupabaseStorage();
        await removeFile(BUCKET_NAME, itemToDelete.image_url);
      }

      const { error } = await supabase
        .from("menu_items")
        .delete()
        .eq("id", itemToDelete.id);
      if (error) throw error;

      items.value = items.value.filter((item) => item.id !== itemToDelete.id);
      toast.success("Успех", {
        description: `Подкатегория "${itemToDelete.title}" удалена.`,
      });
    } catch (e) {
      storeError.value = handleSupabaseError(e, {
        operationName: "удалении подкатегории",
      });
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
    parentSlugOptions,
  };
});
