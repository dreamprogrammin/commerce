import { v4 as uuidv4 } from "uuid";
import type {
  IEditableMenuItem,
  IItemToDelete,
  MenuItemInsert,
  MenuItemRow,
  MenuItemUpdate,
} from "~/types/type";
import { toast } from "vue-sonner";
import { slugify } from "~/utils/slugify";
import { useMenuAdminStore } from "~/stores/menuItems/useTopMenuItems";
import { useSupabaseStorage } from "./useSupabaseStorage";
import { BUCKET_NAME } from "~/constants";

export function useRecursiveMenuForm(initialParentSlug: Ref<string | null>) {
  const menuAdminStore = useMenuAdminStore();
  const { uploadFile, removeFile, getPublicUrl } = useSupabaseStorage();

  const formTree = ref<IEditableMenuItem[]>([]);
  const isSaving = ref(false);

  function buildFormTree(parentSlug: string | null): IEditableMenuItem[] {
    if (!parentSlug) return [];
    const childrenFromStore = menuAdminStore.getChildren(parentSlug);
    return childrenFromStore.map((child) => ({
      ...child,
      children: buildFormTree(child.slug),
      _imageFile: null,
      _imagePreviewUrl: getPublicUrl(BUCKET_NAME, child.image_url) || undefined,
    }));
  }

  watch(
    initialParentSlug,
    (newParentSlug) => {
      if (menuAdminStore.items.length === 0) {
        menuAdminStore.fetchItems().then(() => {
          formTree.value = buildFormTree(newParentSlug);
        });
      } else {
        formTree.value = buildFormTree(newParentSlug);
      }
    },
    { immediate: true },
  );

  function addChildTo(parentItem: IEditableMenuItem) {
    if (!parentItem.slug) {
      toast.error("Невозможно добавить подпункт", {
        description:
          "Сначала сохраните родительский пункт, чтобы он получил слаг.",
      });
      return;
    }
    const newChild: IEditableMenuItem = {
      _tempId: uuidv4(),
      title: "",
      slug: "",
      href: "",
      parent_slug: parentItem.slug,
      display_order: parentItem.children.length,
      children: [],
    };
    parentItem.children.push(newChild);
  }

  async function saveNodeAndChildren(
    node: IEditableMenuItem,
    parentSlug: string | null,
  ) {
    let finalImageUrl = node.image_url || null;
    if (node._imageFile) {
      if (node.image_url) await removeFile(BUCKET_NAME, node.image_url);
      const path = await uploadFile(node._imageFile, {
        bucketName: BUCKET_NAME,
        filePathPrefix: `menu/${node.slug || "new-item"}`,
      });
      if (!path)
        throw new Error(`Ошибка загрузки изображения для "${node.title}"`);
      finalImageUrl = path;
    }

    if (parentSlug === null) {
      throw new Error(
        `Попытка сохранить "${node.title}" без родительского слага. Это не должно происходить в этой логике.`,
      );
    }

    const payload: Partial<MenuItemInsert | MenuItemUpdate> = {
      title: node.title,
      slug: node.slug,
      href: node.href,
      description: node.description,
      parent_slug: parentSlug,
      display_order: node.display_order,
      image_url: finalImageUrl,
      icon_name: node.icon_name,
    };

    let savedNode: MenuItemRow | null;
    if (node.id) {
      savedNode = await menuAdminStore.updateItem(
        node.id,
        payload as MenuItemUpdate,
      );
    } else {
      savedNode = await menuAdminStore.addItem(payload as MenuItemInsert);
    }

    if (!savedNode)
      throw new Error(`Не удалось сохранить пункт меню "${node.title}"`);

    if (node.children && node.children.length > 0) {
      for (const childNode of node.children) {
        await saveNodeAndChildren(childNode, savedNode.slug);
      }
    }
  }

  async function deleteOrphanedChildren(
    originalTree: IEditableMenuItem[],
    currentFormTree: IEditableMenuItem[],
  ) {
    const formIds = new Set(
      currentFormTree.map((item) => item.id).filter(Boolean),
    );
    for (const originalNode of originalTree) {
      if (originalNode.id && !formIds.has(originalNode.id)) {
        await menuAdminStore.deleteItem(originalNode as IItemToDelete);
      }
      if (originalNode.children && originalNode.children.length > 0) {
        const childrenInForm =
          currentFormTree.find((item) => item.id === originalNode.id)
            ?.children || [];
        await deleteOrphanedChildren(originalNode.children, childrenInForm);
      }
    }
  }
  async function saveAllChanges(): Promise<boolean> {
    isSaving.value = true;
    const originalTree = buildFormTree(initialParentSlug.value);

    try {
      await deleteOrphanedChildren(originalTree, formTree.value);
      for (const topLevelNode of formTree.value) {
        await saveNodeAndChildren(topLevelNode, initialParentSlug.value);
      }
      await menuAdminStore.fetchItems();
      toast.success("Все изменения в меню успешно сохранены!");
      isSaving.value = false;
      return true;
    } catch (e: any) {
      toast.error("Ошибка при сохранении меню", { description: e.message });
      console.error("Error saving menu tree:", e);
      isSaving.value = false;
      return false;
    }
  }

  function autoFill(
    item: IEditableMenuItem,
    parentHref: string,
    parentSlug: string,
  ) {
    if (!item.id && item.title) {
      const newSlugPart = slugify(item.title);
      item.slug = `${parentSlug}-${newSlugPart}`;
      item.href = `${parentHref}/${newSlugPart}`;
    }
  }

  function handleImageChange(event: Event, itemForm: IEditableMenuItem) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      itemForm._imageFile = target.files[0];
      itemForm._imagePreviewUrl = URL.createObjectURL(target.files[0]);
    }
  }

  function removeItemImage(itemForm: IEditableMenuItem) {
    itemForm._imageFile = null;
    itemForm._imagePreviewUrl = undefined;
    itemForm.image_url = null;
  }

  return {
    formTree,
    isSaving,
    addChildTo,
    saveAllChanges,
    autoFill,
    handleImageChange,
    removeItemImage,
    getPublicUrl,
  };
}
