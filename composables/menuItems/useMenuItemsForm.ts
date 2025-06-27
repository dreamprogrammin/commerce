import { useMenuItems } from "~/stores/menuItems/useMenuItems";
import type {
  Database,
  MenuItemRow,
  MenuItemInsert,
  MenuItemUpdate,
  IEditableMenuItem,
} from "~/types";
import { useSupabaseStorage } from "./useSupabaseStorage";
import { BUCKET_NAME, NO_PARENT_OPTION_NAME } from "~/constants";
import { toast } from "vue-sonner";
import { v4 as uuidv4 } from "uuid";

export function useMenuItemFormData(
  initialSelectItem: Ref<MenuItemRow | null>,
) {
  const menuItemsStore = useMenuItems();

  const {
    uploadFile: uploadStorageFile,
    removeFile: removeStorageFile,
    getPublicUrl: getStoragePublicUrl,
    isUploading: isImageUploading,
  } = useSupabaseStorage();

  const form = ref<IEditableMenuItem>({});
  const childrenForms = ref<IEditableMenuItem[]>([]);
  const imageFile = ref<File | null>(null);
  const imagePreviewUrl = ref<string | null>(null);

  const isProcessing = ref(false);

  watch(
    initialSelectItem,
    (item) => {
      resetFormState();
      if (item) {
        form.value = {
          ...item,
          _imagePreviewUrl: getStoragePublicUrl(BUCKET_NAME, item.image_url),
        } as IEditableMenuItem;
        const childrenFromStore = menuItemsStore.getChildren(item.slug);
        childrenForms.value = childrenFromStore.map(
          (children) =>
            ({
              ...children,
              href: children.href ?? NO_PARENT_OPTION_NAME,
              _imagePreviewUrl: getStoragePublicUrl(
                BUCKET_NAME,
                children.image_url,
              ),
            }) as IEditableMenuItem,
        );
      } else {
        form.value = {
          title: "",
          slug: "",
          item_type: "link",
          display_order: 0,
          _tempId: uuidv4(),
        } as IEditableMenuItem;
      }
    },
    { immediate: true, deep: true },
  );
  function resetFormState() {
    form.value = {
      _tempId: uuidv4(),
      title: "",
      slug: "",
      item_type: "link",
      display_order: 0,
    };
    childrenForms.value = [];
  }

  function addChild() {
    const newChild: IEditableMenuItem = {
      _tempId: uuidv4(),
      title: "",
      slug: "",
      item_type: "link",
      display_order: childrenForms.value.length,
      parent_slug: form.value.slug,
    };
    childrenForms.value.push(newChild);
  }

  function removeChild(indexOrTempId: number | string): void {
    if (typeof indexOrTempId === "number") {
      childrenForms.value.splice(indexOrTempId, 1);
    } else {
      childrenForms.value = childrenForms.value.filter(
        (childrenForm) => childrenForm._tempId !== indexOrTempId,
      );
    }
  }

  function handleItemChange(event: Event, itemForm: IEditableMenuItem): void {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      itemForm._imageFile = target.files[0];
      itemForm._imagePreviewUrl = URL.createObjectURL(target.files[0]);
    } else {
      itemForm._imageFile = null;
      itemForm._imagePreviewUrl = getStoragePublicUrl(
        BUCKET_NAME,
        itemForm.image_url || null,
      );
    }
    itemForm._isDirty = true;
  }

  async function removeItemImage(itemForm: IEditableMenuItem): Promise<void> {
    const imagePathRemove = itemForm.image_url;
    itemForm._imageFile = null;
    itemForm._imagePreviewUrl = null;
    itemForm.image_url = null;
    itemForm._isDirty = true;

    if (imagePathRemove && itemForm.id) {
      await removeStorageFile(BUCKET_NAME, imagePathRemove);
    }
  }

  function handleImageFileChange(event: Event) {
    const target = event.target as HTMLInputElement;

    if (target.files && target.files[0]) {
      imageFile.value = target.files[0];
      imagePreviewUrl.value = URL.createObjectURL(target.files[0]);
    } else {
      imageFile.value = null;
      imagePreviewUrl.value = form.value.image_url
        ? getStoragePublicUrl(BUCKET_NAME, form.value.image_url)
        : null;
    }
  }

  async function removeCurrentImage() {
    const imagePathRemove = initialSelectItem.value?.image_url;

    if (!imagePathRemove) {
      imageFile.value = null;
      imagePreviewUrl.value = null;
      form.value.image_url = null;
      toast.info("Изображение убрано из формы (Оно не было сохранено).");
      return;
    }

    if (isProcessing.value) return;

    const confirmDelete = confirm(
      "Вы уверены, что хотите удалить текущие изображение этого пункта меню из хранилища и базы данных?",
    );

    if (!confirmDelete) return;

    const successStorage = await removeStorageFile(
      BUCKET_NAME,
      imagePathRemove,
    );

    if (successStorage) {
      try {
        await menuItemsStore.updatedItem(initialSelectItem.value!.id, {
          image_url: null,
        });
        form.value.image_url = null;
        imageFile.value = null;
        imagePreviewUrl.value = null;

        if (initialSelectItem.value) initialSelectItem.value.image_url = null;
      } catch (dbError: any) {
        console.error(
          "Не удалось обнулить URL изображения в базе после удаления из Storage:",
          dbError,
        );
      }
    } else {
    }
  }


  async function submit(): Promise<boolean> {
    isProcessing.value = true;

    if (!form.value.title?.trim() || !form.value.slug?.trim()) {
      toast.error("Ошибка валидации основного пункта", {
        description: "Заголовок и Слаг обязательны!",
      });
      isProcessing.value = false;
      return false;
    }
    if (!initialSelectItem.value && !form.value.slug?.trim()) {
      toast.error("Ошибка валидации основного пункта", {
        description: "Слаг обязателен для нового пункта!",
      });
      isProcessing.value = false;
      return false;
    }

    for (const child of childrenForms.value) {
      if (!child.title?.trim() || !child.slug?.trim()) {
        toast.error("Ошибка валидации подпункта", {
          description: `Заголовок и Слаг для "${child.title || "Новый подпункт"}" обязательны!`,
        });
        isProcessing.value = false;
        return false;
      }
    }

    try {
      let finalMainImageUrl = form.value.image_url || null;
      if (form.value._imageFile) {
        if (form.value.image_url) {
          await removeStorageFile(BUCKET_NAME, form.value.image_url);
        }
        const path = await uploadStorageFile(form.value._imageFile, {
          bucketName: BUCKET_NAME,
          filePathPrefix: `menu/${form.value.slug || "new-main-item"}`,
        });
        if (!path) {
          isProcessing.value = false;
          return false;
        }
        finalMainImageUrl = path;
      } else if (form.value.image_url && initialSelectItem.value?.image_url) {
        await removeStorageFile(BUCKET_NAME, initialSelectItem.value.image_url);
        finalMainImageUrl = null;
      }

      let mainItemTypeCalculated: Database["public"]["Enums"]["menu_item_type_enum"] =
        form.value.item_type || "link";
      if (childrenForms.value.length > 0) {
        mainItemTypeCalculated =
          form.value.href && form.value.href?.trim() !== ""
            ? "trigger_and_link"
            : "trigger";
      } else {
        mainItemTypeCalculated =
          form.value.href && form.value.href.trim() !== "" ? "link" : "trigger";

        if (!form.value.href || form.value.href.trim() === "") {
          if (
            form.value.item_type === "trigger" ||
            form.value.item_type === "trigger_and_link"
          ) {
            mainItemTypeCalculated = form.value.item_type;
          } else {
            mainItemTypeCalculated = "link";
          }
        }
      }

      const mainItemPayload: Partial<MenuItemInsert | MenuItemUpdate> = {
        title: form.value.title,
        href: form.value.href?.trim() ? form.value.href?.trim() : null,
        description: form.value.description?.trim()
          ? form.value.description.trim()
          : null,
        item_type: mainItemTypeCalculated,
        parent_slug:
          form.value.parent_slug === NO_PARENT_OPTION_NAME
            ? null
            : form.value.parent_slug,
        display_order: form.value.display_order || 0,
        image_url: finalMainImageUrl,
        icon_name: form.value.icon_name?.trim()
          ? form.value.icon_name.trim()
          : null,
      };

      let savedMainItem: MenuItemRow | null = null;

      if (initialSelectItem.value?.id) {
        savedMainItem = await menuItemsStore.updatedItem(
          initialSelectItem.value.id,
          mainItemPayload as MenuItemUpdate,
        );
      } else {
        if (!form.value.slug)
          throw new Error("Slug is required for new main item");
        (mainItemPayload as MenuItemInsert).slug = form.value.slug;
        savedMainItem = await menuItemsStore.addItem(
          mainItemPayload as MenuItemInsert,
        );
      }

      if (!savedMainItem) {
        isProcessing.value = false;
        return false;
      }

      const existingDbChildren = initialSelectItem.value
        ? menuItemsStore.getChildren(initialSelectItem.value.slug)
        : [];
      const childrenInFormIdsAndTempIds = new Set(
        childrenForms.value.map((cf) => cf.id || cf._tempId),
      );

      for (const dbChild of existingDbChildren) {
        if (!childrenInFormIdsAndTempIds.has(dbChild.id)) {
          await menuItemsStore.deleteItem(dbChild);
        }
      }

      for (const childForm of childrenForms.value) {
        let finalChildImageUrl = childForm.image_url || null;
        if (childForm._imageFile) {
          if (childForm.image_url) {
            await removeStorageFile(BUCKET_NAME, childForm.image_url);
          }
          const childPath = await uploadStorageFile(childForm._imageFile, {
            bucketName: BUCKET_NAME,
            filePathPrefix: `menu/${savedMainItem.slug}/${childForm.slug || "child-item"}`,
          });
          if (!childPath) {
            continue;
          }
          finalChildImageUrl = childPath;
        } else if (
          childForm.image_url === null &&
          existingDbChildren.find((c) => c.id === childForm.id)?.image_url
        ) {
          const oldChildData = existingDbChildren.find(
            (c) => c.id === childForm.id,
          );
          if (oldChildData?.image_url)
            await removeStorageFile(BUCKET_NAME, oldChildData.image_url);
          finalChildImageUrl = null;
        }

        const childItemType: Database["public"]["Enums"]["menu_item_type_enum"] =
          childForm.href && childForm.href.trim() !== ""
            ? "link"
            : "trigger_and_link";

        const childDbPayload: Partial<MenuItemInsert | MenuItemUpdate> = {
          title: childForm.title,
          slug: childForm.slug,
          href: childForm.href?.trim() ? childForm.href.trim() : null,
          description: childForm.description?.trim()
            ? childForm.description?.trim()
            : null,
          item_type: childItemType,
          parent_slug: savedMainItem.slug,
          display_order: childForm.display_order || 0,
          image_url: finalChildImageUrl,
          icon_name: childForm.icon_name?.trim()
            ? childForm.icon_name.trim()
            : null,
        };

        if (childForm.id && !childForm._tempId) {
          await menuItemsStore.updatedItem(
            childForm.id,
            childDbPayload as MenuItemUpdate,
          );
        } else {
          if (!childForm.slug)
            throw new Error("Slug is required for new child item");
          (childDbPayload as MenuItemInsert).slug = childForm.slug;
          await menuItemsStore.addItem(childDbPayload as MenuItemInsert);
        }
      }

      await menuItemsStore.fetchItems();
      resetFormAndSelection();
      isProcessing.value = false;
      return true;
    } catch (e: any) {
      console.error("Критическая ошибка при отправке формы:", e);
      if (!(menuItemsStore.error && menuItemsStore.error.includes(e.message))) {
        toast.error("Критическая ошибка формы", {
          description: e.message || "Неизвестная ошибка",
        });
      }
      isProcessing.value = false;
      return false;
    }
  }

  function resetFormAndSelection() {
    initialSelectItem.value = null;
  }

  return {
    form,
    addChild,
    removeChild,
    handleItemChange,
    removeItemImage,
    childrenForms,
    imageFile,
    imagePreviewUrl,
    isProcessing,
    handleImageFileChange,
    removeCurrentImage,
    submitForm: submit,
    resetFormFields: resetFormAndSelection,
    getStoragePublicUrl,
  };
}
