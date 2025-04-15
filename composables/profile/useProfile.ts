import { useAuthStore } from "~/stores/auth";
import type { Database } from "~/types/supabase";
import type { IProfile, ProfileUpdate } from "~/types/type";

export function useProfile() {
  const supabase = useSupabaseClient<Database>();
  const authStore = useAuthStore()

  const displayProfile = ref<IProfile>({
    id: "",
    email: null,
    first_name: null,
    last_name: null,
    phone: null,
  });

  const editProfile = ref<IProfile>({ ...displayProfile.value });

  const isLoading = ref(true);
  const isSaving = ref(false);

  async function useEmptyProfile() {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .or("first_name.is.null, last_name.is.null, email.is.null");

      if (error) {
        throw error;
      }
    } catch (error) {
      throw error;
    }
  }

  async function loadProfile() {
    try {
      isLoading.value = true;
      const user = await supabase.auth.getUser();
      if (!user.data?.user) {
        throw new Error("Пользователь не найден");
      }
      const userId = user.data.user?.id;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (error) {
        throw error;
      }
      displayProfile.value = data;
      editProfile.value = { ...data };
    } catch (error) {
      throw error;
    } finally {
      isLoading.value = false;
    }
  }
  async function updateProfile(profiles: ProfileUpdate) {
    isSaving.value = true;
    try {
      if (!profiles.id) {
        throw new Error("ID профиля не может быть пустым");
      }
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: profiles.first_name ?? null,
          last_name: profiles.last_name ?? null,
          phone: profiles.phone ?? null,
        })
        .eq("id", profiles.id);
      if (error) {
        throw error;
      }
      alert("Профиль успешно");
      displayProfile.value = { ...editProfile.value };
    } catch (error) {
      alert(error + "Ошибка");
    } finally {
      isSaving.value = false;
    }
  }
  return {
    displayProfile,
    editProfile,
    updateProfile,
    loadProfile,
    useEmptyProfile,
    isLoading,
    isSaving,
  };
}
