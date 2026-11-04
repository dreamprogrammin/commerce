/**
 * Посты открытого канала поставщика → папка для стенда `compare.ts`
 * (4 ноября 2026). Открытый канал читается без аккаунта на
 * `t.me/s/<канал>` — по 20 постов на страницу, дальше `?before=<id>`;
 * экспорт из Telegram Desktop для него не нужен.
 *
 *   ~/.deno/bin/deno run -A --no-lock scripts/supplier-vision/fetch-channel.ts \
 *     --channel=amr_toys --count=30 --before=46150 --out=~/supplier-posts/amr_toys
 *
 * В папке — `<id поста>/photo.jpg` (альбом — photo1.jpg, photo2.jpg, …) и
 * `captions.json` с подписями. Подписи модели не показываются: стенд
 * проверяет чтение с картинки, а у AmrToys в подписи стоит сам артикул.
 * `--with-captions` кладёт подпись в `<id>/caption.txt` — тогда модель её
 * видит. `--before` — чтобы собрать тот же набор и через неделю; без него —
 * последние посты. Фото и цены поставщика в git не кладём: репозиторий
 * публичный.
 */
import type { PreviewPost } from '../../utils/telegramPreview.ts'
import { isPreviewPage, parsePreviewPosts } from '../../utils/telegramPreview.ts'

const args = Object.fromEntries(Deno.args.map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=')
  return [k, v.join('=') || 'true']
}))
const channel = (args.channel ?? '').replace(/^@/, '')
const out = (args.out ?? '').replace(/^~/, Deno.env.get('HOME') ?? '')
const count = Number(args.count ?? 30)
if (!/^[a-z]\w{3,31}$/i.test(channel) || !out || !(count > 0)) {
  console.error('Нужны --channel=<имя открытого канала> и --out=<папка>, --count=<сколько постов>')
  Deno.exit(2)
}

const UA = 'Mozilla/5.0 (compatible; uhti.kz supplier channels; +https://uhti.kz)'

async function get(url: string): Promise<Response | null> {
  return fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(15000) }).catch(() => null)
}

const posts = new Map<number, PreviewPost>()
let before = args.before ? Number(args.before) : null
while (posts.size < count) {
  const res = await get(`https://t.me/s/${channel}${before ? `?before=${before}` : ''}`)
  if (!res?.ok) {
    console.error(`t.me ответил ${res?.status ?? 'сбоем'} — канал закрытый или имя неверное?`)
    Deno.exit(1)
  }
  const html = await res.text()
  if (!isPreviewPage(html)) {
    console.error(`У @${channel} нет просмотра без аккаунта: это не открытый канал (закрытый, группа, человек или бот)`)
    Deno.exit(1)
  }
  const page = parsePreviewPosts(html)
  for (const p of page.posts)
    posts.set(p.id, p)
  if (page.firstId === null || page.firstId === before)
    break
  before = page.firstId
  await new Promise(r => setTimeout(r, 1000))
}

const chosen = [...posts.values()].sort((a, b) => b.id - a.id).slice(0, count)
await Deno.mkdir(out, { recursive: true })
const captions: Record<string, string> = {}
let failed = 0
for (const post of chosen) {
  const dir = `${out}/${post.id}`
  await Deno.mkdir(dir, { recursive: true })
  for (const [i, url] of post.photos.entries()) {
    const file = `${dir}/photo${post.photos.length > 1 ? i + 1 : ''}.jpg`
    // CDN Telegram изредка отвечает 500 — повтор с паузой
    let bytes: Uint8Array | null = null
    for (let attempt = 1; attempt <= 4 && !bytes; attempt++) {
      const res = await get(url)
      const body = res?.ok ? new Uint8Array(await res.arrayBuffer()) : null
      if (body && body[0] === 0xFF && body[1] === 0xD8)
        bytes = body
      else
        await new Promise(r => setTimeout(r, 1500 * attempt))
    }
    if (bytes)
      await Deno.writeFile(file, bytes)
    else
      failed++
  }
  captions[post.id] = post.caption
  if (args['with-captions'] && post.caption)
    await Deno.writeTextFile(`${dir}/caption.txt`, `${post.caption}\n`)
}
await Deno.writeTextFile(`${out}/captions.json`, `${JSON.stringify(captions, null, 2)}\n`)
console.log(`@${channel}: постов ${chosen.length} (${chosen.at(-1)?.id}–${chosen[0]?.id}), фото ${chosen.reduce((n, p) => n + p.photos.length, 0)}${failed ? `, НЕ СКАЧАЛОСЬ ${failed}` : ''} → ${out}`)
if (failed)
  Deno.exit(1)
