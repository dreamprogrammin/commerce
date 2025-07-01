import { useTopMenuItemsStore } from "~/stores/menuItems/useTopMenuItems";
import type {
  IEditableMenuItem,
  MenuItemInsert,
  MenuItemRow,
  MenuItemUpdate,
} from "~/types";
import { useSupabaseStorage } from "./useSupabaseStorage";
import { BUCKET_NAME } from "~/constants";
import { slugify } from "~/utils/slugify";
import { staticMainMenuItems } from "~/config/staticItems";
import { toast } from "vue-sonner";

export function useMenuItemForm(initialSelectedItem: Ref<MenuItemRow | null>) {
  const topMenuStore = useTopMenuItemsStore();
  const { uploadFile, removeFile, getPublicUrl } = useSupabaseStorage();

  const form = ref<IEditableMenuItem>({});
  const isProcessing = computed(() => topMenuStore.isLoading);

  function updateSlugAndHrefFromTitle(newTitle: string) {
    if (initialSelectedItem.value || !form.value.parent_slug) return;

    const parentInfo = staticMainMenuItems.find(
      (p) => p.slug === form.value.parent_slug,
    );

    if (!parentInfo) {
      console.warn(
        `Не удалось найти статического родителя с slug: ${form.value.parent_slug}`,
      );
      return;
    }

    const parentHref = parentInfo.href;

    const newSlugPart = slugify(newTitle);
    form.value.slug = `${form.value.parent_slug}-${newSlugPart}`;
    form.value.href = `${parentHref}/${newSlugPart}`;
  }

  watch(
    initialSelectedItem,
    (item) => {
      if (item) {
        form.value = {
          ...item,
          _imageFile: null,
          _imagePreviewUrl: getPublicUrl(BUCKET_NAME, item.image_url),
        };
      } else {
        form.value = {
          title: "",
          slug: "",
          href: "",
          parent_slug: "",
          display_order: 0,
        };
      }
    },
    { immediate: true, deep: true },
  );

  watch(
    () => form.value.parent_slug,
    (newParentSlug) => {
      if (!initialSelectedItem.value) {
        updateSlugAndHrefFromTitle(form.value.title || "");
      }
    },
  );

  watch(
    () => form.value.title,
    (newTitle) => {
      if (!initialSelectedItem.value) {
        updateSlugAndHrefFromTitle(newTitle || "");
      }
    },
  );

  function handleImageChange(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      form.value._imageFile = target.files[0];
      form.value._imagePreviewUrl = URL.createObjectURL(target.files[0]);
    }
  }

  async function removeCurrentImage() {
    const imagePathRemove = form.value.image_url;
    form.value._imageFile = null;
    form.value._imagePreviewUrl = null;
    form.value.image_url = null;

    if (imagePathRemove) {
      await removeFile(BUCKET_NAME, imagePathRemove);
    }
  }

  async function submit(): Promise<boolean> {
    if (
      !form.value.title?.trim() ||
      !form.value.slug?.trim() ||
      !form.value.parent_slug?.trim()
    ) {
      toast.error("Ошибка валидации", {
        description: "Заголовок, Слаг и Родительский пункт обязательны!",
      });
      return false;
    }

    let finalImagePath = form.value.image_url || null;

    if (form.value._imageFile) {
      if (form.value.image_url) {
        await removeFile(BUCKET_NAME, form.value.image_url);
      }

      const path = await uploadFile(form.value._imageFile, {
        bucketName: BUCKET_NAME,
        filePathPrefix: `${form.value.parent_slug}/${form.value.slug}`,
      });

      if (!path) return false;
      finalImagePath = path;
    }

    const payload: Partial<MenuItemInsert | MenuItemUpdate> = {
      title: form.value.title,
      slug: form.value.slug,
      href: form.value.href,
      description: form.value.description || null,
      parent_slug: form.value.parent_slug,
      display_order: form.value.display_order,
      image_url: finalImagePath,
      icon_name: form.value.icon_name || null,
    };

    try {
      if (form.value.id) {
        delete (payload as Partial<MenuItemRow>).slug;
        await topMenuStore.updateItem(form.value.id, payload as MenuItemUpdate);
      } else {
        await topMenuStore.addItem(payload as MenuItemInsert);
      }
      resetForm();
      return true;
    } catch (e) {
      return false;
    }
  }

  function resetForm() {
    initialSelectedItem.value = null;
  }

  return {
    form,
    submit,
    resetForm,
    handleImageChange,
    removeCurrentImage,
    isProcessing,
    getPublicUrl,
  };
}
