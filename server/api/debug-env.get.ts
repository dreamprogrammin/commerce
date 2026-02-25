// server/api/debug-env.get.ts
export default defineEventHandler(() => {
    const config = useRuntimeConfig()
    return {
        // Все способы чтения
        viaProcessEnv: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        viaConfig: !!config.supabaseServiceRoleKey,
        viaConfigRaw: !!config['supabaseServiceRoleKey'],

        // Проверим все ключи runtimeConfig что есть
        configKeys: Object.keys(config),

        // Первые символы разными способами
        prefixViaEnv: process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 5) || 'MISSING',
        prefixViaConfig: config.supabaseServiceRoleKey?.substring(0, 5) || 'MISSING',
    }
})