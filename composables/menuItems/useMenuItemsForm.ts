import { useMenuItems } from "~/stores/menuItems/useMenuItems";
import type { Database, MenuItemRow, MenuItemInsert, MenuItemUpdate } from "~/types";
import { useSupabaseStorage } from "./useSupabaseStorage";
import { BUCKET_NAME } from "~/constants";
import { toast } from "vue-sonner";

type MenuItemFormData = Omit<Partial<MenuItemRow>, 'created_id' | 'updated_id'>

export function useMenuItemFormData (initialSelectItem : Ref<MenuItemRow | null>) {
    const menuItemsStore = useMenuItems()

    const {
        uploadFile: uploadStorageFile,
        removeFile: removeStorageFile,
        getPublicUrl: getStoragePublicUrl,
        isUploading: isImageUploading 
    } = useSupabaseStorage()

    const form = ref<MenuItemFormData>({})
    const imageFile = ref<File | null>(null)
    const imagePreviewUrl = ref<string | null>(null)

    const isProcessing = computed(() => menuItemsStore.isLoading || isImageUploading.value)

    watch(initialSelectItem, (item) => {
        if (item) {
            form.value = {
                id: item.id,
                slug: item.slug,
                title: item.title,
                href: item.href,
                description: item.description,
                item_type: item.item_type,
                parent_slug: item.parent_slug,
                display_order: item.display_order,
                image_url: item.image_url,
                icon_name: item.icon_name
            }
            imagePreviewUrl.value = getStoragePublicUrl(BUCKET_NAME, item.image_url)
        } else {
            form.value = {
                id: undefined,
                title: '',
                slug: '',
                item_type: 'link',
                display_order: 0,
                href: null,
                description: null,
                parent_slug: null,
                image_url: null,
                icon_name: null
            }
            imagePreviewUrl.value = null
        }
        imageFile.value = null
    }, {immediate: true, deep: true})

    function handleImageFileChange(event : Event) {
        const target = event.target as HTMLInputElement

        if (target.files && target.files[0]) {
            imageFile.value = target.files[0]
            imagePreviewUrl.value = URL.createObjectURL(target.files[0])
        } else {
            imageFile.value = null
            imagePreviewUrl.value = form.value.image_url ? getStoragePublicUrl(BUCKET_NAME, form.value.image_url) : null
        }
    }

    async function removeCurrentImage() {
        const imagePathRemove = initialSelectItem.value?.image_url

        if (!imagePathRemove) {
            imageFile.value = null
            imagePreviewUrl.value = null
            form.value.image_url = null
            toast.info('Изображение убрано из формы (Оно не было сохранено).')
            return
        }

        if (isProcessing.value) return

        const confirmDelete = confirm('Вы уверены, что хотите удалить текущие изображение этого пункта меню из хранилища и базы данных?')

        if (!confirmDelete) return

        const successStorage = await removeStorageFile(BUCKET_NAME, imagePathRemove)

        if (successStorage) {
            try {
                await menuItemsStore.updatedItem(initialSelectItem.value!.id, {image_url: null})
                form.value.image_url = null
                imageFile.value = null
                imagePreviewUrl.value = null

                if (initialSelectItem.value) initialSelectItem.value.image_url = null

            } catch (dbError: any) {
                console.error("Не удалось обнулить URL изображения в базе после удаления из Storage:", dbError)
            }
        } else {

        }
    }

    async function submit(): Promise<boolean> {
        if (!form.value?.title?.trim() || !form.value?.slug?.trim()) {
            toast.error('Ошибка валидации', {
                description: 'Заголовок и Слаг обязательны!'
            })
            return false
        }

        if (initialSelectItem.value === null && !form.value?.slug?.trim()) {
            toast.error('Ошибка валидации', {
                description: 'Слаг обязателен для нового пункта!'
            })
            return false
        }

        let finalImagePath = form.value.image_url || null

        if (imageFile.value) {

            if (initialSelectItem.value?.image_url) {
                await removeStorageFile(BUCKET_NAME, initialSelectItem.value.image_url)
            }

            const uploadedPath = await uploadStorageFile(imageFile.value, {
                bucketName: BUCKET_NAME,
                filePathPrefix: form.value.slug || 'menu-item',
            });

            if (!uploadedPath) { 
                return false;
            }

            finalImagePath = uploadedPath
        } else if (form.value.image_url === null && initialSelectItem.value?.image_url) {
            // Если image_url в форме был обнулен (но файл не выбран),
            // а у исходного элемента был image_url, значит, пользователь хочет удалить изображение.
            // Это уже должно было быть обработано через removeCurrentImage, но на всякий случай.
            // Если removeCurrentImage не вызывался, а просто стерли URL и выбрали новый файл - это покроет imageFile.value.
            // Если просто стерли URL и не выбрали новый файл - finalImagePath уже будет null.
            // Если было старое изображение, и мы его не меняли (imageFile.value === null) и не удаляли (form.value.image_url не null),
            // то finalImagePath останется старым form.value.image_url.
        }

        const dataToSubmit = {...form.value, image_url: finalImagePath}

        try {
            if (initialSelectItem.value?.id) {

                const updatePayload:MenuItemUpdate = {
                    title: dataToSubmit.title,
                    href: dataToSubmit.href,
                    description: dataToSubmit.description,
                    item_type: dataToSubmit.item_type as Database['public']['Enums']['menu_item_type_enum'],
                    parent_slug: dataToSubmit.parent_slug || null,
                    display_order: dataToSubmit.display_order,
                    image_url: dataToSubmit.image_url || null,
                    icon_name: dataToSubmit.icon_name || null
                }
                await menuItemsStore.updatedItem(initialSelectItem.value.id, updatePayload)
            } else {
                const insertPayload: MenuItemInsert = {
                    slug: dataToSubmit.slug!,
                    title: dataToSubmit.title!,
                    item_type: dataToSubmit.item_type as Database['public']['Enums']['menu_item_type_enum'] || 'link',
                    href: dataToSubmit.href || null,
                    description: dataToSubmit.description || null,
                    parent_slug: dataToSubmit.parent_slug || null,
                    display_order: dataToSubmit.display_order || 0,
                    image_url:dataToSubmit.image_url || null,
                    icon_name: dataToSubmit.icon_name || null
                }
                await menuItemsStore.addItem(insertPayload)
            }
            return true
        } catch (e) {
            console.error('Ошибка при отправке формы', e)

            if (!(e instanceof Error && menuItemsStore.error === e.message)) {
                toast.error("Ошибка при отправке формы" , {
                    description: (e as Error).message || "Неизвестная ошибка"
                })
            }
            return false
        }
    }

    function resetFormAndSelection() {
        initialSelectItem.value = null
    }

    return {
        form,
        imageFile,
        imagePreviewUrl,
        isProcessing,
        handleImageFileChange,
        removeCurrentImage,
        submitForm: submit,
        resetFormFields: resetFormAndSelection,
        getStoragePublicUrl
    }
}