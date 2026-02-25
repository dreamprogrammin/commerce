// server/api/auth/magic-link.post.ts
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const { token } = await readBody<{ token: string }>(event)

  if (!token || typeof token !== 'string' || token.length !== 64) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid token' })
  }

  const supabaseUrl = process.env.SUPABASE_URL || ''
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!supabaseUrl || !supabaseServiceKey) {
    throw createError({ statusCode: 500, statusMessage: 'Server configuration error' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { data: magicLink, error: fetchError } = await supabase
    .from('magic_links')
    .select('id, user_id, redirect_path, expires_at, used_at')
    .eq('token', token)
    .single()

  if (fetchError || !magicLink) {
    throw createError({ statusCode: 404, statusMessage: 'Link not found or expired' })
  }

  // ✅ ИСПРАВЛЕНИЕ 1: Grace period 60 секунд для Telegram preload
  if (magicLink.used_at) {
    const usedAt = new Date(magicLink.used_at)
    const now = new Date()
    const secondsSinceUsed = (now.getTime() - usedAt.getTime()) / 1000

    if (secondsSinceUsed > 60) {
      throw createError({ statusCode: 410, statusMessage: 'Link already used' })
    }
    // Токен использован менее 60 сек назад — это повторный запрос браузера,
    // продолжаем выполнение и возвращаем тот же результат
  }

  if (new Date(magicLink.expires_at) < new Date()) {
    throw createError({ statusCode: 410, statusMessage: 'Link expired' })
  }

  // Отмечаем как использованный (если ещё не отмечен)
  if (!magicLink.used_at) {
    await supabase
      .from('magic_links')
      .update({ used_at: new Date().toISOString() })
      .eq('id', magicLink.id)
  }

  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(magicLink.user_id)

  if (userError || !userData?.user?.email) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  // ✅ ИСПРАВЛЕНИЕ 3: Проверяем провайдеров пользователя
  // Если пользователь входил только через Google — email provider может быть отключён
  const userIdentities = userData.user.identities || []
  const hasEmailIdentity = userIdentities.some(i => i.provider === 'email')
  const hasGoogleIdentity = userIdentities.some(i => i.provider === 'google')

  let actionLink: string

  if (!hasEmailIdentity && hasGoogleIdentity) {
    // Пользователь только с Google — используем OTP вместо magiclink
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: userData.user.email,
      options: {
        redirectTo: `https://uhti.kz${magicLink.redirect_path || '/'}`,
      },
    })

    if (linkError || !linkData?.properties?.action_link) {
      // Фоллбек: генерируем сессию напрямую через admin API
      console.error('generateLink error for Google user:', linkError)
      throw createError({
        statusCode: 500,
        statusMessage: 'Auth provider conflict: user registered via Google only'
      })
    }

    actionLink = linkData.properties.action_link
  } else {
    const redirectTo = `https://uhti.kz${magicLink.redirect_path || '/'}`
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: userData.user.email,
      options: { redirectTo },
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error('generateLink error:', linkError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to generate auth link' })
    }

    actionLink = linkData.properties.action_link
  }

  return {
    action_link: actionLink,
    redirect_path: magicLink.redirect_path,
  }
})