import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface ProductData {
  entity_type?: 'product' | 'category' | 'brand' | 'product_line' | 'material' | 'country'
  product_id?: string
  category_id?: string
  brand_id?: string
  product_line_id?: string
  material_id?: number
  country_id?: number
  name: string
  price?: number
  description: string | null
  brand?: string | null
  brand_name?: string | null
  material?: string | null
  country?: string | null
  category?: string | null
  parent_category?: string | null
  min_age?: number | null
  max_age?: number | null
  products_count?: number
  min_price?: number
  max_price?: number
  brands_count?: number
  categories_count?: number
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
    const data: ProductData = await req.json()
    const entityType = data.entity_type || 'product'

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      console.error('ANTHROPIC_API_KEY not set')
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Формируем промпт в зависимости от типа сущности
    let prompt = ''

    if (entityType === 'product') {
      prompt = `Ты — помощник для интернет-магазина детских игрушек в Казахстане. Мы продаем ТОЛЬКО игрушки, никакой одежды или других товаров.

ИГРУШКА:
Название: ${data.name}
Цена: ${data.price} ₸ (это премиум-товар!)
Описание: ${data.description || 'нет описания'}
Бренд: ${data.brand || 'не указан'}
Материал: ${data.material || 'не указан'}
Страна производства: ${data.country || 'не указана'}
Категория: ${data.category || 'не указана'}
Возраст: ${data.min_age ? `от ${data.min_age}` : ''}${data.max_age ? ` до ${data.max_age}` : ''} лет

ЗАДАЧА:
Сгенерируй 3-4 уникальных вопроса-ответа об этой игрушке, которые помогут УБЕДИТЬ покупателя купить этот премиум-товар.

ТРЕБОВАНИЯ:
- Вопросы должны быть естественными (как задают реальные покупатели об игрушках)
- Ответы должны подчеркивать ЦЕННОСТЬ и УНИКАЛЬНОСТЬ этой игрушки
- Используй конкретные детали (бренд, материал, особенности игрушки)
- Пиши на русском языке
- Тон: дружелюбный, но профессиональный
- НЕ упоминай доставку, возврат, одежду
- НЕ повторяй базовые вопросы (возраст, цена, бренд — они уже есть)

ФОКУС для премиум-игрушек:
- Почему эта игрушка стоит такую цену?
- В чём преимущество перед дешёвыми аналогами?
- Какие уникальные игровые возможности?
- Долговечность и качество материалов игрушки
- Развивающий и образовательный эффект для ребенка
- Безопасность игрушки для детей

ФОРМАТ ОТВЕТА (строго JSON):
{
  "questions": [
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."}
  ]
}

Генерируй только JSON без дополнительного текста.`
    }
    else if (entityType === 'category') {
      prompt = `Ты — помощник для интернет-магазина детских игрушек в Казахстане. Мы продаем ТОЛЬКО игрушки, никакой одежды или других товаров.

КАТЕГОРИЯ ИГРУШЕК:
Название: ${data.name}
Описание: ${data.description || 'нет описания'}
Родительская категория: ${data.parent_category || 'нет'}
Количество игрушек: ${data.products_count || 0}
Диапазон цен: ${data.min_price ? `от ${data.min_price}` : ''}${data.max_price ? ` до ${data.max_price}` : ''} ₸
Количество брендов: ${data.brands_count || 0}
Популярные бренды: ${data.top_brands || 'не указаны'}

ЗАДАЧА:
Сгенерируй 3-4 уникальных вопроса-ответа о категории игрушек, которые помогут покупателю понять её особенности и выбрать подходящую игрушку.

ТРЕБОВАНИЯ:
- Вопросы должны быть естественными (как задают реальные покупатели об игрушках)
- Ответы должны быть информативными и полезными
- Упоминай конкретные бренды и линейки игрушек, если они указаны
- Пиши на русском языке
- Тон: дружелюбный, но профессиональный
- НЕ упоминай доставку, возврат, одежду
- НЕ повторяй базовые вопросы (что входит, бренды, цены, возраст — они уже есть)

ФОКУС для категорий игрушек:
- Для каких случаев и возрастов подходят игрушки из этой категории?
- Какие популярные игрушки и бренды в этой категории?
- Как выбрать правильную игрушку из этой категории для ребенка?
- Какие развивающие возможности дают игрушки этой категории?
- В чем особенности и преимущества игрушек этой категории?

ФОРМАТ ОТВЕТА (строго JSON):
{
  "questions": [
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."}
  ]
}

Генерируй только JSON без дополнительного текста.`
    }
    else if (entityType === 'brand') {
      prompt = `Ты — помощник для интернет-магазина детских игрушек в Казахстане. Мы продаем ТОЛЬКО игрушки, никакой одежды или других товаров.

БРЕНД ИГРУШЕК:
Название: ${data.name}
Описание: ${data.description || 'нет описания'}
Количество игрушек: ${data.products_count || 0}
Диапазон цен: ${data.min_price ? `от ${data.min_price}` : ''}${data.max_price ? ` до ${data.max_price}` : ''} ₸
Количество категорий: ${data.categories_count || 0}
Количество линеек: ${data.product_lines_count || 0}
Популярные линейки: ${data.top_product_lines || 'не указаны'}
Страна производства: ${data.country || 'не указана'}

ЗАДАЧА:
Сгенерируй 3-4 уникальных вопроса-ответа о бренде игрушек, которые помогут покупателю понять его особенности и преимущества.

ТРЕБОВАНИЯ:
- Вопросы должны быть естественными (как задают реальные покупатели об игрушках)
- Ответы должны подчеркивать качество и надежность бренда игрушек
- Упоминай конкретные линейки продуктов, если они указаны
- Пиши на русском языке
- Тон: дружелюбный, но профессиональный
- НЕ упоминай доставку, возврат, одежду
- НЕ повторяй базовые вопросы (категории, линейки, страна, цены — они уже есть)

ФОКУС для брендов игрушек:
- Чем известен этот бренд в мире игрушек?
- Какое качество и безопасность игрушек этого бренда?
- Почему стоит выбрать игрушки этого бренда для ребенка?
- Какие популярные игрушки и линейки у бренда?
- Для какого возраста подходят игрушки бренда?
- Какие развивающие возможности дают игрушки этого бренда?

ФОРМАТ ОТВЕТА (строго JSON):
{
  "questions": [
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."}
  ]
}

Генерируй только JSON без дополнительного текста.`
    }
    else if (entityType === 'product_line') {
      prompt = `Ты — помощник для интернет-магазина детских игрушек в Казахстане. Мы продаем ТОЛЬКО игрушки, никакой одежды или других товаров.

ЛИНЕЙКА ИГРУШЕК:
Название: ${data.name}
Описание: ${data.description || 'нет описания'}
Бренд: ${data.brand_name || 'не указан'}
Количество игрушек: ${data.products_count || 0}
Диапазон цен: ${data.min_price ? `от ${data.min_price}` : ''}${data.max_price ? ` до ${data.max_price}` : ''} ₸

ЗАДАЧА:
Сгенерируй 3-4 уникальных вопроса-ответа о линейке игрушек, которые помогут покупателю понять её особенности и выбрать подходящую игрушку.

ТРЕБОВАНИЯ:
- Вопросы должны быть естественными (как задают реальные покупатели об игрушках)
- Ответы должны подчеркивать уникальность и популярность линейки игрушек
- Упоминай бренд-производитель, если указан
- Пиши на русском языке
- Тон: дружелюбный, но профессиональный
- НЕ упоминай доставку, возврат, одежду
- НЕ повторяй базовые вопросы (цены, бренд, возраст — они уже есть)

ФОКУС для линеек игрушек:
- Чем известна эта линейка игрушек среди детей?
- Какие популярные игрушки в этой линейке?
- Какие развивающие возможности дает линейка?
- Какие особенности и уникальные игровые возможности?
- Почему дети любят играть с игрушками этой линейки?
- Можно ли собрать коллекцию из игрушек этой линейки?

ФОРМАТ ОТВЕТА (строго JSON):
{
  "questions": [
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."}
  ]
}

Генерируй только JSON без дополнительного текста.`
    }
    else if (entityType === 'material') {
      prompt = `Ты — помощник для интернет-магазина детских игрушек в Казахстане. Мы продаем ТОЛЬКО игрушки, никакой одежды или других товаров.

МАТЕРИАЛ ИГРУШЕК:
Название: ${data.name}
Количество игрушек: ${data.products_count || 0}
Диапазон цен: ${data.min_price ? `от ${data.min_price}` : ''}${data.max_price ? ` до ${data.max_price}` : ''} ₸
Популярные бренды: ${data.top_brands || 'не указаны'}

ЗАДАЧА:
Сгенерируй 3-4 уникальных вопроса-ответа о материале игрушек, которые помогут покупателю понять его особенности, безопасность и преимущества.

ТРЕБОВАНИЯ:
- Вопросы должны быть естественными (как задают реальные покупатели об игрушках)
- Ответы должны подчеркивать безопасность и качество материала для детских игрушек
- Упоминай конкретные бренды, если они указаны
- Пиши на русском языке
- Тон: дружелюбный, но профессиональный
- НЕ упоминай доставку, возврат, одежду
- НЕ повторяй базовые вопросы (безопасность, цены, бренды — они уже есть)

ФОКУС для материалов игрушек:
- Какие преимущества у игрушек из этого материала для развития ребенка?
- Как ухаживать за игрушками из этого материала?
- Долговечность и прочность игрушек из этого материала
- Какие известные бренды используют этот материал для игрушек?
- Экологичность и безопасность для детей
- Какие типы игрушек лучше всего делать из этого материала?

ФОРМАТ ОТВЕТА (строго JSON):
{
  "questions": [
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."}
  ]
}

Генерируй только JSON без дополнительного текста.`
    }
    else if (entityType === 'country') {
      prompt = `Ты — помощник для интернет-магазина детских игрушек в Казахстане. Мы продаем ТОЛЬКО игрушки, никакой одежды или других товаров.

СТРАНА ПРОИЗВОДСТВА ИГРУШЕК:
Название: ${data.name}
Количество игрушек: ${data.products_count || 0}
Диапазон цен: ${data.min_price ? `от ${data.min_price}` : ''}${data.max_price ? ` до ${data.max_price}` : ''} ₸
Количество брендов: ${data.brands_count || 0}
Популярные бренды: ${data.top_brands || 'не указаны'}

ЗАДАЧА:
Сгенерируй 3-4 уникальных вопроса-ответа о стране-производителе игрушек, которые помогут покупателю понять качество и особенности продукции.

ТРЕБОВАНИЯ:
- Вопросы должны быть естественными (как задают реальные покупатели об игрушках)
- Ответы должны подчеркивать качество и надежность производства игрушек
- Упоминай конкретные бренды игрушек, если они указаны
- Пиши на русском языке
- Тон: дружелюбный, но профессиональный
- НЕ упоминай доставку, возврат, одежду
- НЕ повторяй базовые вопросы (количество, качество, бренды, цены — они уже есть)

ФОКУС для стран-производителей игрушек:
- Какие преимущества у игрушек из этой страны для развития детей?
- Какие известные бренды и линейки игрушек производятся в этой стране?
- Почему стоит выбрать игрушки из этой страны для ребенка?
- Соответствие международным стандартам безопасности детских игрушек
- Какие типы и категории игрушек особенно хорошо производятся в этой стране?
- История и традиции производства игрушек в этой стране

ФОРМАТ ОТВЕТА (строго JSON):
{
  "questions": [
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."}
  ]
}

Генерируй только JSON без дополнительного текста.`
    }

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

    // Определяем таблицу и ID поле в зависимости от типа сущности
    let tableName: string
    let idField: string
    let idValue: string | number | undefined

    if (entityType === 'product') {
      tableName = 'product_questions'
      idField = 'product_id'
      idValue = data.product_id
    }
    else if (entityType === 'category') {
      tableName = 'category_questions'
      idField = 'category_id'
      idValue = data.category_id
    }
    else if (entityType === 'brand') {
      tableName = 'brand_questions'
      idField = 'brand_id'
      idValue = data.brand_id
    }
    else if (entityType === 'product_line') {
      tableName = 'product_line_questions'
      idField = 'product_line_id'
      idValue = data.product_line_id
    }
    else if (entityType === 'material') {
      tableName = 'material_questions'
      idField = 'material_id'
      idValue = data.material_id
    }
    else if (entityType === 'country') {
      tableName = 'country_questions'
      idField = 'country_id'
      idValue = data.country_id
    }
    else {
      return new Response(JSON.stringify({ error: 'Invalid entity type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!idValue) {
      return new Response(JSON.stringify({ error: 'Missing ID for entity' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const insertData = questions.map(q => ({
      [idField]: idValue,
      user_id: null,
      question_text: q.question,
      answer_text: q.answer,
      is_auto_generated: true,
      answered_at: new Date().toISOString(),
    }))

    const { error: insertError } = await supabaseAdmin
      .from(tableName)
      .insert(insertData)

    if (insertError) {
      console.error('Failed to insert questions:', insertError)
      return new Response(JSON.stringify({ error: 'Failed to save questions' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Generated ${questions.length} AI questions for ${entityType} ${data.name}`)

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
