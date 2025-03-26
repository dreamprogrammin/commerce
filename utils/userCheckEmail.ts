export async function checkEmail (email:string) {
    const supabase = useSupabaseClient()
    const {data, error} = await supabase.from('auth.users').select('email').eq('email', email)
    console.log(data)
}