import type { Database } from "~/types";

export function useAdminSlides() {
    const supabase = useSupabaseClient<Database>()
    
}