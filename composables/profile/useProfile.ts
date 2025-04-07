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
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .or("first_name.is.null, last_name.is.null");

    if (error) {
      throw error;
    }

    return data;
  }

  async function loadProfile() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .single();
    if (error) {
      throw error;
    }

    return data;
  }
  async function updateProfile(profiles: ProfileUpdate) {
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
  }
  return {
    profile,
    updateProfile,
    loadProfile,
    useEmptyProfile,
  };
}
