import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface ProductData {
  product_id: string
  name: string
  price: number
  description: string | null
  brand: string | null
  material: string | null
  country: string | null
  category: string | null
  min_age: number | null
  max_age: number | null
}

interface AIQuestion {
  question: string
  answer: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const productData: ProductData = await req.json()

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      console.error('ANTHROPIC_API_KEY not set')
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Формируем промпт для Claude
    const prompt = `Ты — помощник для интернет-магазина детских игрушек в Казахстане.

ТОВАР:
Название: ${productData.name}
Цена: ${productData.price} ₸ (это премиум-товар!)
Описание: ${productData.description || 'нет описания'}
Бренд: ${productData.brand || 'не указан'}
Материал: ${productData.material || 'не указан'}
Страна: ${productData.country || 'не указана'}
Категория: ${productData.category || 'не указана'}
Возраст: ${productData.min_age ? `от ${productData.min_age}` : ''}${productData.max_age ? ` до ${productData.max_age}` : ''} лет

ЗАДАЧА:
Сгенерируй 3-4 уникальных вопроса-ответа, которые помогут УБЕДИТЬ покупателя купить этот дорогой товар.

ТРЕБОВАНИЯ:
- Вопросы должны быть естественными (как задают реальные покупатели)
- Ответы должны подчеркивать ЦЕННОСТЬ и УНИКАЛЬНОСТЬ этого товара
- Используй конкретные детали (бренд, материал, особенности)
- Пиши на русском языке
- Тон: дружелюбный, но профессиональный
- НЕ повторяй базовые вопросы (доставка, возврат, возраст — они уже есть)

ФОКУС для премиум-товаров:
- Почему стоит такая цена?
- В чём преимущество перед дешёвыми аналогами?
- Какие уникальные возможности?
- Долговечность, качество материалов
- Развивающий эффект

ФОРМАТ ОТВЕТА (строго JSON):
{
  "questions": [
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."}
  ]
}

Генерируй только JSON без дополнительного текста.`

    // Запрос к Claude API
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text()
      console.error('Claude API error:', errorText)
      return new Response(JSON.stringify({ error: 'AI generation failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const anthropicData = await anthropicResponse.json()
    const aiText = anthropicData.content[0].text

    // Парсим JSON из ответа
    let questions: AIQuestion[]
    try {
      const parsed = JSON.parse(aiText)
      questions = parsed.questions
    }
    catch (parseError) {
      console.error('Failed to parse AI response:', aiText)
      return new Response(JSON.stringify({ error: 'Invalid AI response format' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Сохраняем вопросы в базу
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const insertData = questions.map(q => ({
      product_id: productData.product_id,
      user_id: null,
      question_text: q.question,
      answer_text: q.answer,
      is_auto_generated: true,
      answered_at: new Date().toISOString(),
    }))

    const { error: insertError } = await supabaseAdmin
      .from('product_questions')
      .insert(insertData)

    if (insertError) {
      console.error('Failed to insert questions:', insertError)
      return new Response(JSON.stringify({ error: 'Failed to save questions' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Generated ${questions.length} AI questions for product ${productData.name}`)

    return new Response(
      JSON.stringify({
        success: true,
        questions_count: questions.length,
        questions,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
  catch (err) {
    console.error('Error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
