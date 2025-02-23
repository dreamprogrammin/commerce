import {supabase} from "~/utils/supabase"
import type {User} from "@supabase/supabase-js"

export async function signIn(email: string, password: string) {
    const {data, error} = await supabase.auth.signInWithPassword({email, password})
    if (error) {
        console.error(error.message)
    }
    return data.user as User
}
export async function signUp(email: string, password: string) {
    const {data, error} = await supabase.auth.signUp({email, password})
    if (error) {
        console.error(error.message)
    }
    return data.user as User
}

export async function signOut() {
    await supabase.auth.signOut()
}