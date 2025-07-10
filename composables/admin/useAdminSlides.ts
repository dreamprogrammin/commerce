import { toast } from "vue-sonner";
import type { Database, SlideRow } from "~/types";

export function useAdminSlides() {
  const supabase = useSupabaseClient<Database>();

  const asyncData = useAsyncData(
    "admin-all-slides",
    async () => {
      const { data, error } = await supabase
        .from("slides")
        .select("*")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;

      return data;
    },
    { lazy: false },
  );

  const isFormOpen = ref(false);
  const selectedSlide = ref<SlideRow | null>(null);

  function openFormForNew() {
    selectedSlide.value = null;
    isFormOpen.value = true;
  }

  function openFormForEdit(slide: SlideRow) {
    selectedSlide.value = { ...slide };
    isFormOpen.value = true;
  }

  async function handleDelete(slide: SlideRow) {
    if (!confirm(`Вы уверены, что хотите удалить слайд "${slide.title}"?`)) {
      return;
    }

    const toastId = toast.loading("Удаление слайда...");

    try {
      if (slide.image_url) {
        const filePath = new URL(slide.image_url).pathname.split(
          "/slides-images/",
        )[1];
        if (filePath) {
          await supabase.storage.from("slides-images").remove([filePath]);
        }
      }

      const { error: dbError } = await supabase
        .from("slides")
        .delete()
        .eq("id", slide.id);
      if (dbError) throw dbError;

      toast.success("Слайд успешно удален!", { id: toastId });
      await asyncData.refresh();
    } catch (e: any) {
      toast.error("Ошибка при удалении", {
        id: toastId,
        description: e.message,
      });
    }
  }

  async function handleFormSaved() {
    isFormOpen.value = false;
    selectedSlide.value = null;
    await asyncData.refresh();
  }

  const isLoading = computed(() => asyncData.status.value === 'pending')

  return {
    slides: asyncData.data,
    isLoading,
    error: asyncData.error,
    isFormOpen,
    selectedSlide,
    openFormForNew,
    openFormForEdit,
    handleDelete,
    handleFormSaved,
  };
}
