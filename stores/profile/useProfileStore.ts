import type { Database } from "@/types";
import type { ProfileRow, ProfileUpdate } from "@/types/type";
export const useProfileStore = defineStore("profileStore", () => {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  const displayProfile = ref<ProfileRow | null>(null)
  const editProfile = ref<ProfileRow | null>(null);

  const bonusBalance = computed(() => displayProfile.value?.bonus_balance ?? 0)

  const isLoading = ref(false);
  const isSaving = ref(false);

  async function useEmptyProfile() {
    try {
      const { error } = await supabase
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
      if (!user.value) {
        clearProfile()
        return
      }

      isLoading.value = true;

      const userId = user.value.id;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (error) {
        console.warn(`Предупреждение при загрузке профиля: ${error.message}`);
      }
      displayProfile.value = data;
      editProfile.value = data ? {...data} : null
    } catch (e: any) {
      console.error("Критическая ошибка в loadProfile:", e);
      clearProfile()
    } finally {
      isLoading.value = false;
    }
  }
  async function updateProfile(profiles: ProfileUpdate) {
    if (!displayProfile.value) return
    isSaving.value = true;
    try {
      const profileId = displayProfile.value?.id
      if (!profileId) {
        throw new Error("ID профиля не может быть пустым");
      }
      const { error } = await supabase
        .from("profiles")
        .update(profiles)
        .eq("id", profileId);
      if (error) {
        console.error("Ошибка обновления профиля:", error);
      } else {
        alert("Профиль успешно");
        await loadProfile()
      }
    } catch (e: any) {
      console.error("Критическая ошибка при обновлении профиля:", e);
      alert(`Произошла непредвиденная ошибка: ${e.message}`);
    } finally {
      isSaving.value = false;
    }
  }

  function clearProfile () {
    displayProfile.value = null
    editProfile.value = null
  }
  return {
    displayProfile,
    editProfile,
    updateProfile,
    loadProfile,
    useEmptyProfile,
    isLoading,
    isSaving,
    bonusBalance,
    clearProfile
  };
});
