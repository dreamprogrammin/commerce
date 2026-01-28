import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface QuestionPayload {
  user_id: string
  question_id: string
  question_text: string
  answer_text: string
  product_name: string
  product_slug: string
  trigger_secret?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload: QuestionPayload = await req.json()

    // Проверка секретного токена для вызовов из триггера БД
    const expectedSecret = Deno.env.get('TRIGGER_SECRET') || 'uhti-internal-trigger-2026'
    if (payload.trigger_secret !== expectedSecret) {
      console.error('Invalid trigger secret. Expected:', expectedSecret, 'Got:', payload.trigger_secret)
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('Trigger secret validated successfully')
    const { user_id, question_id, question_text, answer_text, product_name, product_slug } = payload

    // Задержка 2 минуты для обновления кеша
    console.log('Waiting 2 minutes before sending notification...')
    await new Promise(resolve => setTimeout(resolve, 2 * 60 * 1000))
    console.log('Delay complete, sending notification...')

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Создаём in-app уведомление после задержки
    const productUrl = `/catalog/products/${product_slug}#question-${question_id}`
    const { error: notifError } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id,
        type: 'question_answered',
        title: 'Ответ на ваш вопрос',
        body: `На ваш вопрос о товаре "${product_name}" получен ответ`,
        link: productUrl,
      })

    if (notifError) {
      console.error('Failed to create in-app notification:', notifError)
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(user_id)
    if (userError || !userData?.user?.email) {
      console.error('Could not get user email:', userError)
      return new Response(JSON.stringify({ error: 'User email not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const email = userData.user.email
    const siteUrl = Deno.env.get('SITE_URL') || 'https://uhti.kz'
    const productUrl = `${siteUrl}/catalog/products/${product_slug}#question-${question_id}`

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not set')
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="color: #2563eb;">Ответ на ваш вопрос</h2>
  <p>Вы задавали вопрос о товаре <strong>${product_name}</strong>:</p>
  <blockquote style="border-left: 3px solid #ddd; padding-left: 12px; color: #666; margin: 16px 0;">
    ${question_text}
  </blockquote>
  <p><strong>Ответ:</strong></p>
  <p style="background: #f0f7ff; padding: 12px; border-radius: 8px;">
    ${answer_text}
  </p>
  <a href="${productUrl}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 8px;">
    Перейти к товару
  </a>
  <p style="margin-top: 24px; font-size: 12px; color: #999;">
    Ухтышка — uhti.kz
  </p>
</body>
</html>`

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Ухтышка <noreply@uhti.kz>',
        to: [email],
        subject: `Ответ на ваш вопрос о "${product_name}"`,
        html: htmlBody,
      }),
    })

    const resendData = await resendRes.json()
    console.log('Resend response:', resendData)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
