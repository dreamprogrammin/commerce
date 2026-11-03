import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkTelegramChannel, parsePreviewPage, parseTgPage } from '../../server/utils/telegramWeb'
import { channelUrl, parseChannelLink, sameChannel } from '../../utils/telegramChannel'

/*
 * Разметка — по образцу настоящих страниц t.me (снято 3.11.2026): канал
 * @durov, бот @BotFather, группа @ru_python, приглашение в канал, устаревшее
 * приглашение, несуществующее имя.
 */
function tgPage(inner: string): string {
  return `<html><head><meta property="og:title" content="x"></head><body><div class="tgme_page">${inner}</div></body></html>`
}
const CHANNEL_PAGE = tgPage(`
<div class="tgme_page_title" dir="auto">
  <span dir="auto">Игрушки &amp; Ко «Опт»</span><i class="verified-icon"> ✔</i>
</div>
<div class="tgme_page_extra">2 345 subscribers</div>
<div class="tgme_page_action"><a class="tgme_action_button_new shine" href="tg://resolve?domain=toys_opt">View in Telegram</a></div>
<div class="tgme_page_context_link_wrap"><a class="tgme_page_context_link" href="/s/toys_opt">Preview channel</a></div>`)
const INVITE_PAGE = tgPage(`
<div class="tgme_page_title" dir="auto">
<span dir="auto">Закрытый опт</span>
</div>
<div class="tgme_page_extra">1 804 456 subscribers</div>
<div class="tgme_page_action"><a class="tgme_action_button_new shine" href="tg://join?invite=Qw3rTy_-12345678">Join Channel</a></div>`)
const GROUP_PAGE = tgPage(`
<div class="tgme_page_title" dir="auto"><span dir="auto">Чат оптовиков</span></div>
<div class="tgme_page_extra">16 779 members, 3 553 online</div>
<div class="tgme_page_action"><a class="tgme_action_button_new shine" href="tg://resolve?domain=toys_chat">View in Telegram</a></div>`)
const BOT_PAGE = tgPage(`
<div class="tgme_page_title"><span dir="auto">BotFather</span><i class="verified-icon"> ✔</i></div>
<div class="tgme_page_extra">
  @BotFather
</div>
<div class="tgme_page_extra">7 996 041 monthly users</div>
<div class="tgme_page_action"><a class="tgme_action_button_new shine" href="tg://resolve?domain=BotFather">Start Bot</a></div>`)
const USER_PAGE = tgPage(`
<div class="tgme_page_title" dir="auto"><span dir="auto">Айгуль</span></div>
<div class="tgme_page_extra">@aigul_m</div>
<div class="tgme_page_action"><a class="tgme_action_button_new" href="tg://resolve?domain=aigul_m">Send Message</a></div>`)
const MISSING_PAGE = tgPage(`
<div class="tgme_page_icon"><i class="tgme_icon_user"></i></div>
<div class="tgme_page_description">If you have <strong>Telegram</strong>, you can contact <a class="tgme_username_link" href="tg://resolve?domain=no_such">@no_such</a> right away.</div>
<div class="tgme_page_action"><a class="tgme_action_button_new" href="tg://resolve?domain=no_such">Send Message</a></div>`)
const EXPIRED_INVITE_PAGE = tgPage(`
<div class="tgme_page_icon"><i class="tgme_icon_group"></i></div>
<div class="tgme_page_description">You are invited to a <strong>group chat</strong> on <strong>Telegram</strong>. Click to join:</div>
<div class="tgme_page_action"><a class="tgme_action_button" href="tg://join?invite=AAAAAAAAAAAAAAAA">Join Group</a></div>`)

function message(id: number, datetime: string): string {
  return `<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap user-color-12 js-widget_message" data-post="toys_opt/${id}" data-view="x">
  <div class="tgme_widget_message_text">Пост ${id}</div>
  <span class="tgme_widget_message_meta"><a class="tgme_widget_message_date" href="https://t.me/toys_opt/${id}"><time datetime="${datetime}" class="time">14:22</time></a></span>
</div></div>`
}
const PREVIEW_PAGE = `<main><section class="tgme_channel_history js-message_history">
${message(550, '2026-10-30T09:00:00+00:00')}${message(551, '2026-11-02T14:22:43+00:00')}${message(552, '2026-11-01T08:00:00+00:00')}
</section><section class="tgme_right_column"><div class="tgme_channel_info"><div class="tgme_channel_info_header_title"><span dir="auto">Игрушки</span></div></div></section></main>`

describe('parseChannelLink', () => {
  it.each([
    ['@AmrToys_Opt', 'amrtoys_opt'],
    ['amrtoys_opt', 'amrtoys_opt'],
    ['  https://t.me/amrtoys_opt  ', 'amrtoys_opt'],
    ['t.me/amrtoys_opt', 'amrtoys_opt'],
    ['http://telegram.me/AmrToys_Opt/', 'amrtoys_opt'],
    ['https://www.t.me/amrtoys_opt', 'amrtoys_opt'],
    ['https://t.me/s/amrtoys_opt', 'amrtoys_opt'],
    ['https://t.me/amrtoys_opt/1234', 'amrtoys_opt'],
    ['https://t.me/amrtoys_opt?start=promo', 'amrtoys_opt'],
    ['https://durov.t.me', 'durov'],
    ['tg://resolve?domain=AmrToys_Opt', 'amrtoys_opt'],
    ['@lego', 'lego'],
  ])('открытый канал: %s → %s', (input, username) => {
    expect(parseChannelLink(input)).toEqual({ kind: 'public', username })
  })

  it.each([
    ['https://t.me/+Qw3rTy_-12345678'],
    ['t.me/+Qw3rTy_-12345678'],
    ['https://t.me/joinchat/Qw3rTy_-12345678'],
    ['tg://join?invite=Qw3rTy_-12345678'],
  ])('приглашение: %s — код с регистром как есть', (input) => {
    expect(parseChannelLink(input)).toEqual({ kind: 'invite', hash: 'Qw3rTy_-12345678' })
  })

  it.each([
    ['', /Вставьте ссылку/],
    ['   ', /Вставьте ссылку/],
    ['https://t.me/c/1234567890/55', /пост закрытого канала/],
    ['https://instagram.com/amrtoys', /Нужна ссылка на Telegram/],
    ['https://t.me/+77011234567', /номер телефона/],
    ['https://t.me/+abc', /обрезана/],
    ['https://t.me/joinchat', /обрезана/],
    ['@ab', /от 4 знаков/],
    ['@1toys', /от 4 знаков/],
    ['амртойс', /латиница/],
    ['https://t.me/addstickers', /латиница/],
    ['https://t.me/share', /латиница/],
  ])('не канал: «%s»', (input, reason) => {
    const link = parseChannelLink(input)
    expect(link.kind).toBe('invalid')
    expect(link.kind === 'invalid' && link.reason).toMatch(reason)
  })
})

describe('channelUrl и sameChannel', () => {
  it('ссылка для людей', () => {
    expect(channelUrl({ username: 'toys_opt', inviteHash: null })).toBe('https://t.me/toys_opt')
    expect(channelUrl({ username: null, inviteHash: 'Qw3rTy_-12345678' })).toBe('https://t.me/+Qw3rTy_-12345678')
  })

  it('имя — без учёта регистра, приглашение — точно', () => {
    expect(sameChannel({ username: 'toys_opt', inviteHash: null }, parseChannelLink('@Toys_Opt'))).toBe(true)
    expect(sameChannel({ username: null, inviteHash: 'Qw3rTy_-12345678' }, parseChannelLink('t.me/+Qw3rTy_-12345678'))).toBe(true)
    expect(sameChannel({ username: null, inviteHash: 'Qw3rTy_-12345678' }, parseChannelLink('t.me/+qw3rty_-12345678'))).toBe(false)
    expect(sameChannel({ username: 'toys_opt', inviteHash: null }, parseChannelLink('нет'))).toBe(false)
  })
})

describe('parseTgPage', () => {
  it('канал: название без галочки и с разобранными &amp;, точное число подписчиков', () => {
    expect(parseTgPage(CHANNEL_PAGE)).toEqual({ title: 'Игрушки & Ко «Опт»', type: 'channel', members: 2345 })
  })

  it('приглашение в канал', () => {
    expect(parseTgPage(INVITE_PAGE)).toEqual({ title: 'Закрытый опт', type: 'channel', members: 1804456 })
  })

  it('группа — участники, а не «онлайн»', () => {
    expect(parseTgPage(GROUP_PAGE)).toEqual({ title: 'Чат оптовиков', type: 'group', members: 16779 })
  })

  it('бот и человек — не каналы', () => {
    expect(parseTgPage(BOT_PAGE)).toMatchObject({ title: 'BotFather', type: 'other' })
    expect(parseTgPage(USER_PAGE)).toMatchObject({ title: 'Айгуль', type: 'other' })
  })

  it('нет имени, устаревшее приглашение — без названия', () => {
    expect(parseTgPage(MISSING_PAGE).title).toBeNull()
    expect(parseTgPage(EXPIRED_INVITE_PAGE).title).toBeNull()
  })

  it('счётчика нет — канал по ссылке на просмотр', () => {
    const page = CHANNEL_PAGE.replace('<div class="tgme_page_extra">2 345 subscribers</div>', '')
    expect(parseTgPage(page)).toEqual({ title: 'Игрушки & Ко «Опт»', type: 'channel', members: null })
  })
})

describe('parsePreviewPage', () => {
  it('посты на странице и самый свежий — по времени, а не по порядку', () => {
    expect(parsePreviewPage(PREVIEW_PAGE)).toEqual({ posts: 3, lastPostAt: '2026-11-02T14:22:43.000Z' })
  })

  it('канал без постов', () => {
    expect(parsePreviewPage('<div class="tgme_channel_info"></div>')).toEqual({ posts: 0, lastPostAt: null })
  })

  it('не страница канала — null', () => {
    expect(parsePreviewPage(MISSING_PAGE)).toBeNull()
  })
})

describe('checkTelegramChannel', () => {
  let pages: Record<string, { status: number, html?: string } | Error>
  const asked: string[] = []

  beforeEach(() => {
    asked.length = 0
    // createError — глобальный хелпер Nitro; в тесте — ошибка с кодом и текстом
    vi.stubGlobal('createError', (o: { statusCode: number, message: string }) => Object.assign(new Error(o.message), o))
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      asked.push(url)
      const page = pages[url]
      if (page instanceof Error)
        throw page
      if (!page)
        throw new Error(`неожиданный запрос ${url}`)
      return new Response(page.html ?? '', { status: page.status })
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('открытый канал: название, подписчики, просмотр без аккаунта и последний пост', async () => {
    pages = { 'https://t.me/toys_opt': { status: 200, html: CHANNEL_PAGE }, 'https://t.me/s/toys_opt': { status: 200, html: PREVIEW_PAGE } }
    expect(await checkTelegramChannel({ kind: 'public', username: 'toys_opt' })).toEqual({
      username: 'toys_opt',
      inviteHash: null,
      title: 'Игрушки & Ко «Опт»',
      type: 'channel',
      webPreview: true,
      members: 2345,
      lastPostAt: '2026-11-02T14:22:43.000Z',
    })
  })

  it('канал без просмотра на сайте (t.me/s/ отвечает переадресацией)', async () => {
    pages = { 'https://t.me/toys_opt': { status: 200, html: CHANNEL_PAGE }, 'https://t.me/s/toys_opt': { status: 302 } }
    expect(await checkTelegramChannel({ kind: 'public', username: 'toys_opt' })).toMatchObject({ webPreview: false, lastPostAt: null })
  })

  it('группа: просмотр не спрашивается — у групп его нет', async () => {
    pages = { 'https://t.me/toys_chat': { status: 200, html: GROUP_PAGE } }
    expect(await checkTelegramChannel({ kind: 'public', username: 'toys_chat' })).toMatchObject({ type: 'group', webPreview: false, members: 16779 })
    expect(asked).toEqual(['https://t.me/toys_chat'])
  })

  it('приглашение: один запрос, просмотра без аккаунта нет', async () => {
    pages = { 'https://t.me/+Qw3rTy_-12345678': { status: 200, html: INVITE_PAGE } }
    expect(await checkTelegramChannel({ kind: 'invite', hash: 'Qw3rTy_-12345678' })).toEqual({
      username: null,
      inviteHash: 'Qw3rTy_-12345678',
      title: 'Закрытый опт',
      type: 'channel',
      webPreview: false,
      members: 1804456,
      lastPostAt: null,
    })
    expect(asked).toEqual(['https://t.me/+Qw3rTy_-12345678'])
  })

  it.each([
    ['нет имени', { kind: 'public', username: 'no_such' } as const, 'https://t.me/no_such', MISSING_PAGE, /нет канала @no_such/],
    ['устаревшее приглашение', { kind: 'invite', hash: 'AAAAAAAAAAAAAAAA' } as const, 'https://t.me/+AAAAAAAAAAAAAAAA', EXPIRED_INVITE_PAGE, /устарело/],
    ['бот', { kind: 'public', username: 'botfather' } as const, 'https://t.me/botfather', BOT_PAGE, /@botfather — не канал/],
    ['человек', { kind: 'public', username: 'aigul_m' } as const, 'https://t.me/aigul_m', USER_PAGE, /не канал, а личный аккаунт или бот/],
  ])('%s — 400 с причиной', async (_, link, url, html, reason) => {
    pages = { [url]: { status: 200, html } }
    await expect(checkTelegramChannel(link)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(reason) })
  })

  it('сбой или недоступность Telegram — 502, а не «канала нет»', async () => {
    pages = { 'https://t.me/toys_opt': new TypeError('fetch failed') }
    await expect(checkTelegramChannel({ kind: 'public', username: 'toys_opt' })).rejects.toMatchObject({ statusCode: 502 })
    pages = { 'https://t.me/toys_opt': { status: 503 } }
    await expect(checkTelegramChannel({ kind: 'public', username: 'toys_opt' })).rejects.toMatchObject({ statusCode: 502 })
    pages = { 'https://t.me/toys_opt': { status: 429 } }
    await expect(checkTelegramChannel({ kind: 'public', username: 'toys_opt' })).rejects.toMatchObject({ statusCode: 502 })
  })
})
