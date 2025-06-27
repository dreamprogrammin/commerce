import { toast } from "vue-sonner";
import { BUCKET_NAME, NO_PARENT_SLUG_VALUE_FOR_SELECT } from "~/constants";
import type {
  Database,
  MenuItemRow,
  MenuItemInsert,
  MenuItemUpdate,
  IParentSelectOption,
  IStaticMainMenuItem,
} from "~/types";
import { handleSupabaseError } from "~/utils/supabaseErrorHandler";

export const useMenuItems = defineStore("menu-items", () => {
  const supabase = useSupabaseClient<Database>();

  //state
  const menuItems = ref<MenuItemRow[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);


const staticMainMenuItems: IStaticMainMenuItem[] = [
  { slug: "stocks", title: "Акции", href: "/stocks", isTrigger: false },
  { slug: "new-items", title: "Новинки", href: "/new", isTrigger: false },
  {
    slug: "boys",
    title: "Мальчикам",
    href: "/catalog/boys",
    isTrigger: true,
    iconName: "lucide:user",
  }, // slug 'boys' будет parent_slug для его детей
  {
    slug: "girls",
    title: "Девочкам",
    href: "/catalog/girls",
    isTrigger: true,
    iconName: "lucide:female",
  }, // slug 'girls'
  {
    slug: "kiddy",
    title: "Малышам",
    href: "/catalog/kiddy",
    isTrigger: true,
    iconName: "lucide:baby",
  }, // slug 'kiddy'
  {
    slug: "games",
    title: "Игры",
    href: "/catalog/games",
    isTrigger: true,
    iconName: "lucide:gamepad-2",
  }, // slug 'games'
  {
    slug: "holidays",
    title: "Отдых",
    href: "/catalog/holidays",
    isTrigger: true,
    iconName: "lucide:sun",
  }, // slug 'holidays'
];

  //getter
  const parentSlugOptions = computed<IParentSelectOption[]>(() => {
    const options : IParentSelectOption[] = [
      {
        value: NO_PARENT_SLUG_VALUE_FOR_SELECT,
        label: '--- Нет родителя (Верхний уровень) ---'
      }
    ]

    staticMainMenuItems.forEach(staticItem => {
      if (staticItem.isTrigger) {
        options.push({
          value: staticItem.slug,
          label: `[Статический] ${staticItem.title}`,
          type: 'static'
        })
      }
    })

    menuItems.value.forEach(itemFromDb => {
      if (itemFromDb.item_type === 'trigger' || itemFromDb.item_type === 'trigger_and_link') {
        options.push({
          value: itemFromDb.slug,
          label: `${itemFromDb.title} (Динамический: ${itemFromDb.slug})`,
          type: 'dynamic'
        })
      }
    })
    return options
  });

  const topLevelItems = computed(() =>
    menuItems.value
      .filter((item) => !item.parent_slug)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0)),
  );

  function getChildren(parentSlug: string): MenuItemRow[] {
    return menuItems.value
      .filter((item) => item.parent_slug === parentSlug)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  }

  //actions

  async function fetchItems() {
    isLoading.value = true;
    error.value = null;
    try {
      const { data, error: fetchError } = await supabase
        .from("menu_items")
        .select("*")
        .order("parent_slug", { nullsFirst: true })
        .order("display_order", { nullsFirst: true });

      if (fetchError) throw fetchError;

      menuItems.value = data || [];
    } catch (e) {
      error.value = handleSupabaseError(e, {
        operationName: "Ошибка при загрузке",
      });
    } finally {
      isLoading.value = false;
    }
  }

  async function addItem(
    newItem: Omit<MenuItemInsert, "id" | "created_id" | "updated_id">,
  ): Promise<MenuItemRow | null> {
    isLoading.value = true;
    error.value = null;
    try {
      const parentItem: MenuItemInsert = {
        ...newItem,
        href: newItem.href || null,
        description: newItem.description || null,
        parent_slug: newItem.parent_slug || null,
        image_url: newItem.image_url || null,
        icon_name: newItem.icon_name || null,
      };
      const { data, error } = await supabase
        .from("menu_items")
        .insert(parentItem)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        await fetchItems();

        toast.success("Успех", {
          description: `Элемент ${data.title} меню успешно добавлен.`,
        });
        return data as MenuItemRow;
      }
      return null;
    } catch (e) {
      error.value = handleSupabaseError(e, {
        operationName: "Ошибка при добавлении элемента меню",
      });

      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  async function updatedItem(
    itemId: string,
    updates: MenuItemUpdate,
  ): Promise<MenuItemRow | null> {
    isLoading.value = true;
    error.value = null;
    try {
      const preparedUpdated: MenuItemUpdate = { ...updates };
      if (updates.href === "") preparedUpdated.href = null;
      if (updates.description === "") preparedUpdated.description = null;
      if (updates.parent_slug === "") preparedUpdated.parent_slug = null;
      if (updates.image_url === "") preparedUpdated.image_url = null;
      if (updates.icon_name === "") preparedUpdated.icon_name = null;

      const { id, ...restOfUpdates } = preparedUpdated as any;

      const { data, error } = await supabase
        .from("menu_items")
        .update(restOfUpdates)
        .eq("id", itemId)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        const index = menuItems.value.findIndex((item) => item.id === itemId);

        if (index !== -1) {
          menuItems.value[index] = data as MenuItemRow;
        } else {
          await fetchItems();
        }

        toast.success("Успех", {
          description: `Элемент ${data.title} меню успешно обновлен`,
        });
        return data as MenuItemRow;
      }
      return null;
    } catch (e) {
      error.value = handleSupabaseError(e, {
        operationName: "Ошибка при обновление",
      });
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  async function deletedAssociatedImage(imageUrl: string | null) {
    if (!imageUrl) return;
    try {
      const { error: imageError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([imageUrl]);

      if (imageError) {
        console.warn(
          `Не удалось удалить изображение ${imageUrl} из Storage`,
          imageError.message,
        );
        toast.warning("Предупреждение", {
          description: `Изображение ${imageUrl} не было удалено`,
        });
      } else {
        console.log(`Изображение ${imageUrl} было удалено`);
      }
    } catch (e) {
      const message =
        (e as Error).message ||
        `Произошла неизвестная ошибка при удаление ${imageUrl} из Storage`;
      console.warn(message);
      toast.warning("Предупреждение", {
        description: message,
      });
    }
  }

  async function deleteItem(itemDelete: MenuItemRow) {
    const confirmation = `Вы уверены что хотите удалить ${itemDelete.title} ? все дочерние элементы будут удалены`;
    if (!confirmation) return;

    isLoading.value = true;
    error.value = null;

    try {
      const { error } = await supabase
        .from("menu_items")
        .delete()
        .eq("id", itemDelete.id);

      if (error) throw error;

      await fetchItems();

      toast.success("Успех", {
        description: `Элемент ${itemDelete.title} успешно удален.`,
      });
    } catch (e) {
      error.value = handleSupabaseError(e, {
        operationName: "Удаление пункта меню",
      });
      toast.error("Ошибка", {
        description: error.value,
      });

      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  return {
    menuItems,
    isLoading,
    staticMainMenuItems,
    error,
    fetchItems,
    addItem,
    updatedItem,
    deleteItem,
    deletedAssociatedImage,
    getChildren,
    parentSlugOptions,
    topLevelItems,
  };
});
