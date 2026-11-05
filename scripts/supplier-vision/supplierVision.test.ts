/**
 * Чтение поста против заглушки трёх провайдеров (2 ноября 2026): какие
 * параметры уходят в API и как модуль переживает отказ модели от параметра.
 *
 * Заглушка отказывает так, как отказывают настоящие API: устаревший
 * `max_tokens` не принимают модели o-серии OpenAI — заглушка считает так и
 * про GPT-5/6 (это допущение); модели без рассуждений не принимают
 * `reasoning_effort` (отвергнутый параметр OpenAI называет в `error.param`);
 * у Claude Haiku 4.5 нет `effort`. С настоящими ключами не проверено — это
 * делает стенд `compare.ts`.
 *
 *   ~/.deno/bin/deno test -A --no-lock scripts/supplier-vision/supplierVision.test.ts
 *
 * `--no-lock` — чтобы прогон не дописывал SDK с esm.sh в корневой deno.lock.
 */
import type { SupplierPost } from '../../supabase/functions/_shared/supplierVision.ts'
import assert from 'node:assert/strict'
import { normArticle, parseItems, readSupplierPost } from '../../supabase/functions/_shared/supplierVision.ts'

type Body = Record<string, any>

const ITEMS = { items: [{ name: 'Конструктор LEGO City', article: '60410', brand: 'LEGO', price_text: 6290, price_image: null, price_note: null, age: '5+', confidence: 'high', doubt: null }] }
const post: SupplierPost = { images: [{ mediaType: 'image/png', data: 'iVBORw0KGgo=' }], caption: 'LEGO 60410 — 6290' }

/** Есть ли у модели Anthropic уровень усилия — так отвечает их Models API */
const CLAUDE_EFFORT: Record<string, boolean> = { 'claude-haiku-5-5': true, 'claude-haiku-4-5': false }
function openaiReasons(model: string) {
  return /^(?:gpt-[56]|o\d)/.test(model)
}
/** Не настоящая модель: отвергает и строгую схему, и рассуждения — вся лестница отступлений */
const GEMINI_OLD = 'gemini-old'

const seen: { path: string, body: Body }[] = []
const reply = (status: number, body: unknown) => Response.json(body, { status })
function completion(body: Body) {
  return reply(200, {
    model: body.model,
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(ITEMS) } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  })
}

async function stub(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url)
  const body: Body = req.method === 'POST' ? await req.json() : {}
  seen.push({ path: pathname, body })

  if (pathname.startsWith('/anthropic/v1/models/')) {
    const id = pathname.split('/').pop()!
    const level = { supported: CLAUDE_EFFORT[id] }
    return reply(200, { type: 'model', id, display_name: id, capabilities: { image_input: { supported: true }, effort: { ...level, low: level, medium: level, high: level, max: level, xhigh: null } } })
  }
  if (pathname === '/anthropic/v1/messages') {
    if (body.output_config?.effort && !CLAUDE_EFFORT[body.model])
      return reply(400, { type: 'error', error: { type: 'invalid_request_error', message: 'This model does not support the effort parameter.' } })
    return reply(200, {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: body.model,
      stop_reason: 'end_turn',
      // У Claude 5.x рассуждения включены сами: текст ответа идёт вторым блоком
      content: [{ type: 'thinking', thinking: '', signature: 'test' }, { type: 'text', text: JSON.stringify(ITEMS) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    })
  }
  if (pathname === '/openai/v1/chat/completions') {
    const refused = openaiReasons(body.model)
      ? ('max_tokens' in body && 'max_tokens')
      : ('reasoning_effort' in body && 'reasoning_effort')
    if (refused)
      return reply(400, { error: { message: `Unsupported parameter: '${refused}' is not supported with this model.`, type: 'invalid_request_error', param: refused, code: 'unsupported_parameter' } })
    return completion(body)
  }
  if (pathname === '/gemini/chat/completions') {
    // Google отвечает массивом и параметр не называет
    if (body.model === GEMINI_OLD && (body.response_format?.type === 'json_schema' || 'reasoning_effort' in body))
      return reply(400, [{ error: { code: 400, message: 'Request contains an invalid argument.', status: 'INVALID_ARGUMENT' } }])
    return completion(body)
  }
  return reply(404, { error: { message: `нет ${pathname}` } })
}

Deno.test('чтение поста: параметры для каждого провайдера', async (t) => {
  const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen: () => {} }, stub)
  const base = `http://127.0.0.1:${server.addr.port}`
  const vars: Record<string, string> = {
    ANTHROPIC_API_KEY: 'test',
    OPENAI_API_KEY: 'test',
    GEMINI_API_KEY: 'test',
    ANTHROPIC_BASE_URL: `${base}/anthropic`,
    OPENAI_BASE_URL: `${base}/openai/v1`,
    GEMINI_BASE_URL: `${base}/gemini`,
  }
  const env = (name: string) => vars[name]
  const read = async (spec: string) => {
    const result = await readSupplierPost(post, spec, env)
    assert.equal(result.items[0]?.article, '60410')
    return result
  }
  const requests = (path: string) => seen.filter(s => s.path === path).map(s => s.body)

  try {
    await t.step('OpenAI, рассуждающая модель: max_completion_tokens и низкий уровень рассуждений', async () => {
      seen.length = 0
      await read('openai/gpt-6.1-terra')
      const sent = requests('/openai/v1/chat/completions')
      assert.equal(sent.length, 1)
      assert.equal(sent[0].max_completion_tokens, 16000)
      assert.equal('max_tokens' in sent[0], false)
      assert.equal(sent[0].reasoning_effort, 'low')
      assert.equal(sent[0].response_format.type, 'json_schema')
    })

    await t.step('OpenAI, модель без рассуждений: отказ от reasoning_effort — повтор без него, схема остаётся', async () => {
      seen.length = 0
      await read('openai/gpt-4.1')
      const sent = requests('/openai/v1/chat/completions')
      assert.equal(sent.length, 2)
      assert.equal('reasoning_effort' in sent[1], false)
      assert.equal(sent[1].response_format.type, 'json_schema')
      assert.equal(sent[1].max_completion_tokens, 16000)
    })

    await t.step('Gemini: прежний max_tokens с запасом и низкий уровень рассуждений', async () => {
      seen.length = 0
      await read('gemini/gemini-4-argon')
      const sent = requests('/gemini/chat/completions')
      assert.equal(sent.length, 1)
      assert.equal(sent[0].max_tokens, 16000)
      assert.equal('max_completion_tokens' in sent[0], false)
      assert.equal(sent[0].reasoning_effort, 'low')
    })

    await t.step('ответ 400 без названия параметра: сначала схема текстом, потом без рассуждений', async () => {
      seen.length = 0
      await read(`gemini/${GEMINI_OLD}`)
      const sent = requests('/gemini/chat/completions')
      assert.deepEqual(sent.map(b => [b.response_format.type, 'reasoning_effort' in b]), [
        ['json_schema', true],
        ['json_object', true],
        ['json_object', false],
      ])
      assert.match(sent[2].messages[0].content, /Ответь только JSON по схеме/)
    })

    await t.step('Claude с уровнем усилия: effort low рядом со схемой, справка о модели — один раз', async () => {
      seen.length = 0
      await read('anthropic/claude-haiku-5-5')
      await read('anthropic/claude-haiku-5-5')
      assert.equal(requests('/anthropic/v1/models/claude-haiku-5-5').length, 1)
      const sent = requests('/anthropic/v1/messages')
      assert.equal(sent.length, 2)
      for (const body of sent) {
        assert.equal(body.max_tokens, 16000)
        assert.equal(body.output_config.effort, 'low')
        assert.equal(body.output_config.format.type, 'json_schema')
      }
    })

    await t.step('Claude без уровня усилия (Haiku 4.5): effort не уходит, схема остаётся', async () => {
      seen.length = 0
      await read('anthropic/claude-haiku-4-5')
      const sent = requests('/anthropic/v1/messages')
      assert.equal(sent.length, 1)
      assert.equal('effort' in sent[0].output_config, false)
      assert.equal(sent[0].output_config.format.type, 'json_schema')
      assert.equal(sent[0].max_tokens, 16000)
    })
  }
  finally {
    await server.shutdown()
  }
})

/*
 * Сравнение артикулов на стенде (4 ноября 2026). На фото AmrToys «Арт.»
 * напечатано кириллицей, сам артикул — латиницей, и модель может переписать
 * его кириллицей: «Н08-13» на глаз — тот же «H08-13», ошибкой чтения это не
 * считается.
 */
Deno.test('артикул: буквы-двойники кириллицы равны латинским', () => {
  assert.equal(normArticle('Н08-13'), normArticle('H08-13'))
  assert.equal(normArticle('А1077В'), normArticle('A1077B'))
  assert.equal(normArticle('Р8019М-ЕРХ'), normArticle('P8019M-EPX'))
  assert.equal(normArticle('У347-9Р/11Р'), normArticle('Y347-9P/11P'))
  assert.equal(normArticle('К111-1В/5В'), normArticle('K111-1B/5B'))
  assert.equal(normArticle('zl 5801.1'), normArticle('ZL5801-1'))
  // Настоящая ошибка чтения остаётся ошибкой
  assert.notEqual(normArticle('H08-13'), normArticle('H08-16'))
  assert.notEqual(normArticle('FC-40'), normArticle('FC-4O'))
})

/**
 * Подпись продавца — не часть артикула (стенд 5.11.2026: Claude Haiku 5.5 на
 * посте 30472 «Оптом Игрушки Алматы» дважды из четырёх ответила «Арт.039» при
 * артикуле «039»). Латинское «ART-1234» без точки и двоеточия может быть самим
 * артикулом — его не трогаем.
 */
Deno.test('артикул: подпись продавца «Арт.» срезается, сам артикул — нет', () => {
  const read = (article: string) => parseItems(JSON.stringify({
    items: [{ name: 'Кукла', article, brand: null, price_text: null, price_image: 2400, price_note: null, age: null, confidence: 'high', doubt: null }],
  }))[0]!.article
  assert.equal(read('Арт.039'), '039')
  assert.equal(read('Арт. 039'), '039')
  assert.equal(read('АРТ.F603EG'), 'F603EG')
  assert.equal(read('Артикул: F603EG'), 'F603EG')
  assert.equal(read('арт039'), '039')
  assert.equal(read('Арт.: Y347-9P/11P'), 'Y347-9P/11P')
  assert.equal(read('Art. 8493'), '8493')
  assert.equal(read('Article: Н08-13'), 'Н08-13')
  assert.equal(read('№ 039'), '039')
  assert.equal(read('Код: 12345'), '12345')
  // Похоже на подпись, но может быть самим артикулом
  assert.equal(read('ART-1234'), 'ART-1234')
  assert.equal(read('ART1234'), 'ART1234')
  assert.equal(read('АРТ-5'), 'АРТ-5')
  assert.equal(read('Кодак-5'), 'Кодак-5')
  assert.equal(read('H08-13'), 'H08-13')
})

Deno.test('OpenAI и Google: зависший провайдер — ошибка тайм-аута, а не вечное ожидание', async () => {
  // Отвечает только через 5 с — дольше, чем ждёт модуль
  const hang = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen: () => {} }, () => new Promise(r => setTimeout(() => r(new Response('{}')), 5000)))
  const base = `http://127.0.0.1:${hang.addr.port}`
  const post: SupplierPost = { images: [{ mediaType: 'image/png', data: 'iVBORw0KGgo=' }], caption: 'Арт. 1' }
  const env = (name: string) => ({ OPENAI_API_KEY: 'sk-test', OPENAI_BASE_URL: base, VISION_TIMEOUT_MS: '300' } as Record<string, string>)[name]
  const started = Date.now()
  try {
    await assert.rejects(readSupplierPost(post, 'openai/gpt-6.1-terra', env), (e: Error) => e.name === 'TimeoutError')
    assert.ok(Date.now() - started < 3000, `ждал ${Date.now() - started} мс`)
  }
  finally {
    await hang.shutdown()
  }
})
