import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface QuestionPayload {
  user_id: string
  question_id: string
  product_name: string
  product_slug: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload: QuestionPayload = await req.json()
    const { user_id, question_id, product_name, product_slug } = payload

    console.log('Creating in-app notification for user:', user_id)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Создаём in-app уведомление
    const notificationLink = `/catalog/products/${product_slug}#question-${question_id}`
    const { error: notifError } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id,
        type: 'question_answered',
        title: 'Ответ на ваш вопрос',
        body: `На ваш вопрос о товаре "${product_name}" получен ответ`,
        link: notificationLink,
      })

    if (notifError) {
      console.error('Failed to create notification:', notifError)
      return new Response(JSON.stringify({ error: 'Failed to create notification' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('Notification created successfully')
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
