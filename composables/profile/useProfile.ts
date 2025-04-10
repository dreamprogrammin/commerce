import type { Database } from "~/types/supabase";
import type { IProfile } from "~/types/type";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export function useProfile() {
  const supabase = useSupabaseClient<Database>();
  const profile = ref<IProfile>({
    id: "",
    first_name: null,
    last_name: null,
  });
  async function useEmptyProfile() {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .or("first_name.is.null, last_name.is.null");

      if (error) {
        throw error;
      }
    } catch (error) {
      throw error;
    }
  }

  async function loadProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (error) {
        throw error;
      }
      profile.value = data;
    } catch (error) {
      throw error;
    }
  }
  async function updateProfile(profiles: ProfileUpdate) {
    try {
      if (!profiles.id) {
        throw new Error("ID профиля не может быть пустым");
      }
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: profiles.first_name ?? null,
          last_name: profiles.last_name ?? null,
        })
        .eq("id", profiles.id);
      if (error) {
        throw error;
      }
      alert("Профиль успешно");
    } catch (error) {
      alert(error + "Ошибка");
    }
  }
  return {
    profile,
    updateProfile,
    loadProfile,
    useEmptyProfile,
  };
}
