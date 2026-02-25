import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const { token } = await readBody<{ token: string }>(event)

  if (!token || typeof token !== 'string' || token.length !== 64) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid token' })
  }

  const config = useRuntimeConfig()                          // ← так читаем конфиг
  const supabaseUrl = process.env.SUPABASE_URL || ''
  const supabaseServiceKey = config.supabaseServiceRoleKey  // ← не process.env напрямую

  if (!supabaseUrl || !supabaseServiceKey) {
    throw createError({ statusCode: 500, statusMessage: 'Server configuration error' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Проверяем токен: не expired, не использован
  const { data: magicLink, error: fetchError } = await supabase
    .from('magic_links')
    .select('id, user_id, redirect_path, expires_at, used_at')
    .eq('token', token)
    .single()

  if (fetchError || !magicLink) {
    throw createError({ statusCode: 404, statusMessage: 'Link not found or expired' })
  }

  if (magicLink.used_at) {
    throw createError({ statusCode: 410, statusMessage: 'Link already used' })
  }

  if (new Date(magicLink.expires_at) < new Date()) {
    throw createError({ statusCode: 410, statusMessage: 'Link expired' })
  }

  // Отмечаем как использованный СРАЗУ (одноразовый)
  await supabase
    .from('magic_links')
    .update({ used_at: new Date().toISOString() })
    .eq('id', magicLink.id)

  // Получаем email пользователя
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(magicLink.user_id)

  if (userError || !userData?.user?.email) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  // Генерируем Supabase auth link (magiclink type)
  const redirectTo = `https://uhti.kz${magicLink.redirect_path || '/'}`
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: userData.user.email,
    options: {
      redirectTo,
    },
  })

  if (linkError || !linkData?.properties?.action_link) {
    console.error('generateLink error:', linkError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to generate auth link' })
  }

  return {
    action_link: linkData.properties.action_link,
    redirect_path: magicLink.redirect_path,
  }
})
