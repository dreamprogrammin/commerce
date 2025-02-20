import {supabase} from "~/utils/supabase"

export async function signIn(email: string, password: string) {
    const {data, error} = await supabase.auth.signInWithPassword({email, password})
    if (error) {
        console.error(error.message)
    }
    return data.user
}
export async function signUp(email: string, password: string) {
    const {data, error} = await supabase.auth.signUp({email, password})
    if (error) {
        console.error(error.message)
    }
    return data.user
}

export async function signOut() {
    await supabase.auth.signOut()
}