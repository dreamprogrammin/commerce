import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log('send-broadcast v1 initialized')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!botToken) {
      return new Response(JSON.stringify({ error: 'Bot token not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    // Аутентификация — проверяем JWT из заголовка
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    })

    // Проверяем что пользователь — админ
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      })
    }

    const { message, title, link } = await req.json()
    if (!message || !message.trim()) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    console.log('Starting broadcast from admin:', user.id)

    // Получаем всех подписчиков
    const { data: subscribers, error: subError } = await supabase
      .from('profiles')
      .select('telegram_chat_id')
      .not('telegram_chat_id', 'is', null)

    if (subError) {
      console.error('Error fetching subscribers:', subError)
      return new Response(JSON.stringify({ error: 'Failed to fetch subscribers' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    if (!subscribers || subscribers.length === 0) {
      // Нет Telegram-подписчиков, но всё равно отправляем in-app уведомления
      let notifiedCount = 0
      const { data: allUsers } = await supabase
        .from('profiles')
        .select('id')
        .neq('role', 'admin')

      if (allUsers?.length) {
        const notificationRows = allUsers.map((u: { id: string }) => ({
          user_id: u.id,
          type: 'promotion',
          title: title || 'Новая акция!',
          body: message.trim(),
          link: link || null,
          is_read: false,
        }))

        const { error: notifError } = await supabase
          .from('notifications')
          .insert(notificationRows)

        if (!notifError) {
          notifiedCount = allUsers.length
        }
      }

      return new Response(JSON.stringify({ sent_count: 0, failed_count: 0, notified_count: notifiedCount }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Sending broadcast to ${subscribers.length} subscribers`)

    let sentCount = 0
    let failedCount = 0

    // Отправляем сообщения
    for (const sub of subscribers) {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: sub.telegram_chat_id,
              text: message.trim(),
            }),
          }
        )

        const result = await response.json()

        if (response.ok) {
          sentCount++
        } else {
          failedCount++
          console.error(`Failed to send to ${sub.telegram_chat_id}:`, result.description)

          // Если пользователь заблокировал бота — очищаем chat_id
          if (result.error_code === 403) {
            await supabase
              .from('profiles')
              .update({ telegram_chat_id: null })
              .eq('telegram_chat_id', sub.telegram_chat_id)
            console.log(`Removed blocked chat_id: ${sub.telegram_chat_id}`)
          }
        }

        // Задержка между сообщениями (Telegram rate limit: ~30 msg/sec)
        await new Promise(resolve => setTimeout(resolve, 35))
      } catch (err) {
        failedCount++
        console.error(`Error sending to ${sub.telegram_chat_id}:`, err)
      }
    }

    // Записываем результат в историю
    await supabase.from('telegram_broadcasts').insert({
      admin_id: user.id,
      message: message.trim(),
      sent_count: sentCount,
      failed_count: failedCount,
    })

    // In-app уведомления для всех зарегистрированных пользователей
    let notifiedCount = 0
    const { data: allUsers } = await supabase
      .from('profiles')
      .select('id')
      .neq('role', 'admin')

    if (allUsers?.length) {
      const notificationRows = allUsers.map((u: { id: string }) => ({
        user_id: u.id,
        type: 'promotion',
        title: title || 'Новая акция!',
        body: message.trim(),
        link: link || null,
        is_read: false,
      }))

      const { error: notifError } = await supabase
        .from('notifications')
        .insert(notificationRows)

      if (notifError) {
        console.error('Error inserting notifications:', notifError)
      } else {
        notifiedCount = allUsers.length
      }
    }

    console.log(`Broadcast complete: sent=${sentCount}, failed=${failedCount}, notified=${notifiedCount}`)

    return new Response(
      JSON.stringify({ sent_count: sentCount, failed_count: failedCount, notified_count: notifiedCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('send-broadcast error:', error)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
