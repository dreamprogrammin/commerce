export async function useEmptyProfile() {
  const supabase = useSupabaseClient();
  const { data, error } = await supabase
    .from("profile")
    .select("*")
    .or("first_name.is.null, last_name.is.null");

  if (error) {
    throw error;
  }

  return data;
}

// ~/composables/useProfiles.ts
export async function updateProfile(profile: any) {
  const supabase = useSupabaseClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: profile.first_name,
      last_name: profile.last_name,
    })
    .eq("id", profile.id);

  if (error) {
    console.error("Ошибка при обновлении профиля:", error.message);
    throw error;
  }
}
