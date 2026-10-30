/**
 * Стенд выбора модели для агента поставщиков: одни и те же посты — через
 * несколько моделей, рядом точность артикула и цены, время и токены.
 *
 * Шаг 1 плана агента (docs/HANDOFF.md): «тест модели на 20–30 реальных
 * постах, главный критерий — точность чтения артикула с фото».
 *
 * Посты — одно из двух:
 *  - экспорт канала из Telegram Desktop (папка с result.json и photos/):
 *    альбом (фото с одной секундой) — один пост; пост без подписи берёт текст
 *    соседнего сообщения в пределах 2 минут — как договорено с владельцем;
 *  - папка с подпапками: в каждой фото + необязательный caption.txt.
 *
 * Правильные ответы — `expected.json` в папке постов:
 *   { "<id поста>": [{ "article": "8493", "price": 8990 }, …] }
 * Первый прогон без него пишет `expected.template.json` с прочитанным первой
 * моделью — поправить руками и переименовать.
 *
 *   ~/.deno/bin/deno run -A scripts/supplier-vision/compare.ts \
 *     --posts=~/supplier-posts/channel1 \
 *     --models=anthropic/claude-haiku-5-5,anthropic/claude-sonnet-5-5,gemini/gemini-2.5-flash
 *
 * Ключи — переменными окружения (ANTHROPIC_API_KEY, GEMINI_API_KEY, …) или
 * файлами ~/.config/uhti-<провайдер>.key. Результат — в <posts>/results/.
 */
import type { ReadItem, ReadResult, SupplierPost } from '../../supabase/functions/_shared/supplierVision.ts'
import { DEFAULT_MODEL, parseModelSpec, pickPrice, PROVIDERS, readSupplierPost } from '../../supabase/functions/_shared/supplierVision.ts'

const args = Object.fromEntries(Deno.args.map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=')
  return [k, v.join('=')]
}))
const home = Deno.env.get('HOME') ?? ''
const postsDir = (args.posts ?? '').replace(/^~/, home)
if (!postsDir) {
  console.error('Нужен --posts=<папка>')
  Deno.exit(2)
}
const models = (args.models || Deno.env.get('VISION_MODEL') || DEFAULT_MODEL).split(',').map(s => s.trim()).filter(Boolean)
const limit = args.limit ? Number(args.limit) : Infinity

/** Ключ: переменная окружения, иначе ~/.config/uhti-<провайдер>.key */
function env(name: string): string | undefined {
  const fromEnv = Deno.env.get(name)
  if (fromEnv)
    return fromEnv
  const provider = Object.entries(PROVIDERS).find(([, c]) => c.keyEnv === name)?.[0]
  if (!provider)
    return undefined
  try {
    return Deno.readTextFileSync(`${home}/.config/uhti-${provider}.key`).trim() || undefined
  }
  catch {
    return undefined
  }
}

for (const spec of models) {
  const { provider, config } = parseModelSpec(spec)
  if (!env(config.keyEnv)) {
    console.error(`Нет ключа для ${spec}: переменная ${config.keyEnv} или файл ~/.config/uhti-${provider}.key`)
    Deno.exit(2)
  }
}

// ---------- посты ----------

interface LoadedPost extends SupplierPost { id: string, files: string[] }

const MEDIA: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
const mediaType = (f: string) => MEDIA[f.split('.').pop()!.toLowerCase()]

async function loadImage(path: string) {
  const bytes = await Deno.readFile(path)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { mediaType: mediaType(path)!, data: btoa(bin) }
}

interface TgMessage {
  id: number
  type: string
  date_unixtime?: string
  photo?: string
  file?: string
  mime_type?: string
  text?: string | (string | { text: string })[]
}

const tgText = (m: TgMessage) => (Array.isArray(m.text) ? m.text.map(t => typeof t === 'string' ? t : t.text).join('') : m.text ?? '').trim()

async function loadTelegramExport(dir: string): Promise<LoadedPost[]> {
  const { messages } = JSON.parse(await Deno.readTextFile(`${dir}/result.json`)) as { messages: TgMessage[] }
  const msgs = messages.filter(m => m.type === 'message')
  const imageOf = (m: TgMessage) => m.photo ?? (m.file && mediaType(m.file) ? m.file : undefined)
  const posts: { id: string, at: number, files: string[], caption: string | null }[] = []
  const usedText = new Set<number>()
  for (const m of msgs) {
    const img = imageOf(m)
    if (!img)
      continue
    const at = Number(m.date_unixtime ?? 0)
    const last = posts.at(-1)
    // Альбом: фото с той же секундой — один пост
    if (last && last.at === at) {
      last.files.push(img)
      last.caption ||= tgText(m) || null
    }
    else {
      posts.push({ id: String(m.id), at, files: [img], caption: tgText(m) || null })
    }
    if (tgText(m))
      usedText.add(m.id)
  }
  // Пост без подписи — текст соседнего сообщения (сначала следующего) в пределах 2 минут
  const texts = msgs.filter(m => !imageOf(m) && tgText(m))
  for (const p of posts.filter(p => !p.caption)) {
    const near = texts
      .filter(t => !usedText.has(t.id) && Math.abs(Number(t.date_unixtime ?? 0) - p.at) <= 120)
      .sort((a, b) => Number(Number(b.date_unixtime) >= p.at) - Number(Number(a.date_unixtime) >= p.at)
        || Math.abs(Number(a.date_unixtime) - p.at) - Math.abs(Number(b.date_unixtime) - p.at))[0]
    if (near) {
      p.caption = tgText(near)
      usedText.add(near.id)
    }
  }
  return Promise.all(posts.map(async p => ({
    id: p.id,
    files: p.files,
    caption: p.caption,
    images: await Promise.all(p.files.map(f => loadImage(`${dir}/${f}`))),
  })))
}

async function loadFolders(dir: string): Promise<LoadedPost[]> {
  const posts: LoadedPost[] = []
  const subdirs = [...Deno.readDirSync(dir)].filter(e => e.isDirectory && e.name !== 'results').map(e => e.name).sort()
  for (const name of subdirs) {
    const files = [...Deno.readDirSync(`${dir}/${name}`)].map(e => e.name).filter(f => mediaType(f)).sort()
    if (!files.length)
      continue
    let caption: string | null = null
    try {
      caption = (await Deno.readTextFile(`${dir}/${name}/caption.txt`)).trim() || null
    }
    catch { /* подписи нет */ }
    posts.push({ id: name, files, caption, images: await Promise.all(files.map(f => loadImage(`${dir}/${name}/${f}`))) })
  }
  return posts
}

const isExport = await Deno.stat(`${postsDir}/result.json`).then(() => true, () => false)
const posts = (isExport ? await loadTelegramExport(postsDir) : await loadFolders(postsDir)).slice(0, limit)
console.log(`постов: ${posts.length} (${isExport ? 'экспорт Telegram' : 'папки'}), фото: ${posts.reduce((n, p) => n + p.images.length, 0)}, моделей: ${models.length}`)
if (!posts.length)
  Deno.exit(1)

let expected: Record<string, { article: string | null, price: number | null }[]> | null = null
try {
  expected = JSON.parse(await Deno.readTextFile(`${postsDir}/expected.json`))
}
catch { /* ответов нет — будет шаблон */ }

// ---------- прогон ----------

/** Артикулы сравниваются без регистра, пробелов, дефисов и точек */
const norm = (s: string | null) => (s ?? '').toUpperCase().replace(/[\s\-–._/]/g, '')

interface PostRun { postId: string, result?: ReadResult, error?: string }
const runs: Record<string, PostRun[]> = {}

for (const spec of models) {
  runs[spec] = []
  for (const post of posts) {
    try {
      const result = await readSupplierPost(post, spec, env)
      runs[spec].push({ postId: post.id, result })
      console.log(`  ${spec} · пост ${post.id}: ${result.items.map(i => `${i.article ?? '—'} ${pickPrice(i).price ?? '—'}`).join('; ')} (${result.ms} мс)`)
    }
    catch (e) {
      runs[spec].push({ postId: post.id, error: (e as Error).message })
      console.log(`  ${spec} · пост ${post.id}: ОШИБКА ${(e as Error).message.slice(0, 160)}`)
    }
  }
}

// ---------- оценка ----------

function score(items: ReadItem[], want: { article: string | null, price: number | null }[]) {
  let articles = 0
  let prices = 0
  for (const w of want) {
    const hit = items.find(i => norm(i.article) && norm(i.article) === norm(w.article))
    if (hit)
      articles++
    const priced = hit ?? (want.length === 1 ? items[0] : undefined)
    if (priced && w.price !== null && pickPrice(priced).price === w.price)
      prices++
  }
  return { articles, prices, articlesTotal: want.filter(w => w.article).length, pricesTotal: want.filter(w => w.price !== null).length }
}

const summary = models.map((spec) => {
  const ok = runs[spec].filter(r => r.result)
  const s = { articles: 0, articlesTotal: 0, prices: 0, pricesTotal: 0 }
  if (expected) {
    for (const r of ok) {
      const want = expected[r.postId]
      if (!want)
        continue
      const one = score(r.result!.items, want)
      s.articles += one.articles
      s.articlesTotal += one.articlesTotal
      s.prices += one.prices
      s.pricesTotal += one.pricesTotal
    }
  }
  const sum = (f: (r: ReadResult) => number | null) => ok.reduce((n, r) => n + (f(r.result!) ?? 0), 0)
  return {
    model: spec,
    posts: ok.length,
    errors: runs[spec].length - ok.length,
    lowConfidence: ok.reduce((n, r) => n + r.result!.items.filter(i => i.confidence === 'low').length, 0),
    priceConflicts: ok.reduce((n, r) => n + r.result!.items.filter(i => pickPrice(i).conflict).length, 0),
    articleAccuracy: s.articlesTotal ? `${s.articles}/${s.articlesTotal}` : '—',
    priceAccuracy: s.pricesTotal ? `${s.prices}/${s.pricesTotal}` : '—',
    avgMs: ok.length ? Math.round(sum(r => r.ms) / ok.length) : null,
    inputTokens: sum(r => r.inputTokens),
    outputTokens: sum(r => r.outputTokens),
  }
})

const outDir = `${postsDir}/results`
await Deno.mkdir(outDir, { recursive: true })
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
await Deno.writeTextFile(`${outDir}/${stamp}.json`, JSON.stringify({ models, posts: posts.map(p => ({ id: p.id, files: p.files, caption: p.caption })), runs, summary }, null, 2))

if (!expected) {
  const first = runs[models[0]]
  const template = Object.fromEntries(first.map(r => [r.postId, (r.result?.items ?? []).map(i => ({ article: i.article, price: pickPrice(i).price, name: i.name }))]))
  await Deno.writeTextFile(`${postsDir}/expected.template.json`, JSON.stringify(template, null, 2))
  console.log(`\nОтветов нет: шаблон ${postsDir}/expected.template.json — поправить по фото и сохранить как expected.json`)
}

console.log('\nмодель | постов | ошибок | артикул | цена | неуверенно | цена текст≠фото | мс/пост | токены вход/выход')
for (const s of summary)
  console.log(`${s.model} | ${s.posts} | ${s.errors} | ${s.articleAccuracy} | ${s.priceAccuracy} | ${s.lowConfidence} | ${s.priceConflicts} | ${s.avgMs ?? '—'} | ${s.inputTokens}/${s.outputTokens}`)
console.log(`\nподробно: ${outDir}/${stamp}.json`)
