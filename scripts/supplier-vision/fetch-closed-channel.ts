/**
 * Посты закрытого канала поставщика → папка для стенда `compare.ts`
 * (4 ноября 2026) — та же, что у `fetch-channel.ts` для открытого канала.
 * Закрытый канал (t.me/+…) читает только участник, поэтому скрипт заходит
 * аккаунтом, подключённым на странице «Аккаунт Telegram». api_id, api_hash,
 * сессия и код приглашения берутся из прод-базы через Management API
 * (~/.supabase/access-token) — только в памяти: на экран и в файлы они не
 * попадают. В прод ничего не пишется, посты прочитанными не отмечаются.
 *
 *   node scripts/supplier-vision/fetch-closed-channel.ts --count=30 --out=~/supplier-posts/optom_almaty
 *
 * Пост — товар: фото со своей подписью. В «Оптом Игрушки Алматы» альбом —
 * пачка разных товаров, у каждого фото своя подпись-артикул, поэтому альбом
 * делится по подписям; фото без подписи (или с той же) — ещё один снимок
 * того же товара. В папке — `<номер>/photo.jpg` (снимков несколько —
 * photo1.jpg, photo2.jpg, …) и `captions.json`. Подписи модели не
 * показываются: стенд проверяет чтение с картинки, а подпись здесь — сам
 * артикул; `--with-captions` кладёт её в `<номер>/caption.txt`. Сообщения без
 * картинки стенд не видит — скрипт их только считает.
 * `--channel=<часть названия>` — если закрытых каналов несколько;
 * `--before=<номер>` — посты старше этого номера, чтобы собрать тот же набор
 * позже. Фото и цены поставщика в git не кладём: репозиторий публичный.
 *
 * Пока скрипт работает, на странице «Аккаунт Telegram» ничего не нажимать:
 * одна сессия сразу из двух мест — AUTH_KEY_DUPLICATED, и Telegram её закроет.
 */
import type { Message, Photo, Document as TgDocument } from '@mtcute/node'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import process from 'node:process'
import { MemoryStorage, TelegramClient, tl } from '@mtcute/node'
import { isSessionGone, telegramErrorText } from '../../utils/telegramLogin.ts'

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=')
  return [k, v.join('=') || 'true']
}))
const out = (args.out ?? '').replace(/^~/, homedir())
const count = Number(args.count ?? 30)
const before = args.before ? Number(args.before) : null
if (!out || !(count > 0) || (before !== null && !(before > 0))) {
  console.error('Нужны --out=<папка> и --count=<сколько постов>; по желанию --before=<номер поста> и --channel=<часть названия>')
  process.exit(2)
}

/** Чтение прод-базы через Management API — как в compare.ts */
async function prodQuery<T>(sql: string): Promise<T[]> {
  const token = (await readFile(`${homedir()}/.supabase/access-token`, 'utf8')).trim()
  const res = await fetch('https://api.supabase.com/v1/projects/gvsdevsvzgcivpphcuai/database/query', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok)
    throw new Error(`Management API: ${res.status}`)
  return res.json() as Promise<T[]>
}

const closed = await prodQuery<{ title: string, supplier: string, hash: string }>(
  `select c.title, s.name as supplier, c.invite_hash as hash
     from public.supplier_channels c join public.suppliers s on s.id = c.supplier_id
    where c.invite_hash is not null order by c.created_at`,
)
const pick = args.channel?.toLowerCase()
const matched = pick ? closed.filter(c => `${c.title} ${c.supplier}`.toLowerCase().includes(pick)) : closed
if (matched.length !== 1) {
  console.error(matched.length
    ? `Закрытых каналов ${matched.length} — выберите --channel=<часть названия>: ${matched.map(c => `«${c.title}» (${c.supplier})`).join(', ')}`
    : `Закрытого канала${pick ? ` «${args.channel}»` : ''} у поставщиков нет`)
  process.exit(2)
}
const channel = matched[0]!

const [app] = await prodQuery<{ api_id: string | null, api_hash: string | null, session: string | null }>(
  `select public.telegram_secret_get('api_id') as api_id, public.telegram_secret_get('api_hash') as api_hash,
          public.telegram_secret_get('session') as session`,
)
if (!app?.api_id || !app.api_hash || !app.session) {
  console.error('Аккаунт Telegram не подключён — войдите на странице «Аккаунт Telegram»')
  process.exit(1)
}

type Image = Photo | TgDocument

// Картинки-файлы, которые читает стенд; прочие документы — сообщения без картинки
const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

function imageOf(m: Message): Image | null {
  const media = m.media
  return media?.type === 'photo' || (media?.type === 'document' && IMAGE_EXT[media.mimeType]) ? media : null
}

interface Post { id: number, album: string | null, images: Image[], caption: string }

/** Товары по порядку сообщений: в альбоме новая подпись — новый товар */
function toPosts(messages: Message[]): Post[] {
  const posts: Post[] = []
  for (const m of messages) {
    const image = imageOf(m)
    if (!image)
      continue
    const text = m.text.trim()
    const last = posts.at(-1)
    if (last && m.groupedIdUnique && m.groupedIdUnique === last.album && (!text || !last.caption || text === last.caption)) {
      last.images.push(image)
      last.caption ||= text
    }
    else {
      posts.push({ id: m.id, album: m.groupedIdUnique, images: [image], caption: text })
    }
  }
  return posts
}

const tg = new TelegramClient({
  apiId: Number(app.api_id),
  apiHash: app.api_hash,
  storage: new MemoryStorage(),
  disableUpdates: true,
  logLevel: 1,
  // Как у страницы «Аккаунт Telegram»: в списке сеансов это тот же вход
  initConnectionOptions: { deviceModel: 'uhti.kz', appVersion: '1.0', langCode: 'ru', systemLangCode: 'ru' },
})

async function download(image: Image): Promise<Uint8Array> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await tg.downloadAsBuffer(image)
    }
    catch (e) {
      // Ошибку Telegram (сессия, FLOOD_WAIT) повтор не лечит — только сбой связи
      if (attempt === 3 || tl.RpcError.is(e))
        throw e
      await new Promise(r => setTimeout(r, 1500 * attempt))
    }
  }
}

try {
  await tg.importSession(app.session)
  const invite = await tg.call({ _: 'messages.checkChatInvite', hash: channel.hash })
  if (invite._ !== 'chatInviteAlready' || invite.chat._ !== 'channel') {
    console.error(`Аккаунт не участник «${channel.title}» — вступите по приглашению и повторите`)
    process.exitCode = 1
  }
  else {
    // От новых к старым, пока товаров не станет на один больше --count: самый старый мог
    // прийти без начала альбома. С --before — ещё 10 номеров выше, там конец альбома
    const fetched: Message[] = []
    const postsOf = () => toPosts([...fetched].reverse()).filter(p => before === null || p.id < before)
    for await (const m of tg.iterHistory(invite.chat, before ? { offset: { id: before + 10, date: 0 } } : {})) {
      fetched.push(m)
      if (imageOf(m) && postsOf().length > count)
        break
    }
    const chosen = postsOf().slice(-count)
    const from = chosen[0]?.id ?? 0
    const texts = fetched.filter(m => m.id >= from && !imageOf(m) && m.text.trim()).length

    await mkdir(out, { recursive: true })
    const captions: Record<string, string> = {}
    let photos = 0
    for (const post of chosen) {
      const dir = `${out}/${post.id}`
      await mkdir(dir, { recursive: true })
      for (const [i, image] of post.images.entries()) {
        const ext = image.type === 'photo' ? 'jpg' : IMAGE_EXT[image.mimeType]
        await writeFile(`${dir}/photo${post.images.length > 1 ? i + 1 : ''}.${ext}`, await download(image))
        photos++
      }
      captions[post.id] = post.caption
      if (args['with-captions'] && post.caption)
        await writeFile(`${dir}/caption.txt`, `${post.caption}\n`)
    }
    await writeFile(`${out}/captions.json`, `${JSON.stringify(captions, null, 2)}\n`)
    console.log(`«${invite.chat.title}»: постов ${chosen.length} (${from}–${chosen.at(-1)?.id}), фото ${photos}${texts ? `, сообщений без картинки ${texts} — стенд их не видит` : ''} → ${out}`)
  }
}
catch (e) {
  if (!tl.RpcError.is(e))
    throw e
  const seconds = 'seconds' in e && typeof e.seconds === 'number' ? e.seconds : undefined
  console.error(isSessionGone(e.text) ? 'Telegram закрыл сессию — войдите заново на странице «Аккаунт Telegram»' : telegramErrorText(e.text, seconds))
  process.exitCode = 1
}
finally {
  await tg.destroy()
}
