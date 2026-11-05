import { describe, expect, it } from 'vitest'
import { isPreviewPage, parsePreviewPosts, postText } from '../../utils/telegramPreview'

/*
 * Разметка — по образцу t.me/s/amr_toys (снято 4.11.2026): аватар канала —
 * <img>, фото поста — фон у tgme_widget_message_photo_wrap, текст — в
 * tgme_widget_message_text, время — <time datetime>.
 */
function message(id: number, inner: string, date = `2026-11-03T14:${String(id % 60).padStart(2, '0')}:00+00:00`) {
  return `<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="toys_opt/${id}">
<div class="tgme_widget_message_user"><a href="https://t.me/toys_opt"><i class="tgme_widget_message_user_photo"><img src="https://cdn4.telesco.pe/file/avatar.jpg"></i></a></div>
<div class="tgme_widget_message_bubble">${inner}
<div class="tgme_widget_message_footer compact js-message_footer"><span class="tgme_widget_message_meta"><a class="tgme_widget_message_date" href="https://t.me/toys_opt/${id}"><time datetime="${date}" class="time">14:28</time></a></span></div>
</div></div></div>`
}
const photo = (n: string) => `<a class="tgme_widget_message_photo_wrap 1 2" href="https://t.me/toys_opt/1" style="width:800px;background-image:url('https://cdn4.telesco.pe/file/${n}.jpg')"><div class="tgme_widget_message_photo" style="padding-top:75%"></div></a>`
const text = (html: string) => `<div class="tgme_widget_message_text js-message_text" dir="auto">${html}</div>`

const PAGE = `<html><body><div class="tgme_channel_info"></div><section class="tgme_channel_history js-message_history">
${message(46130, `${photo('a')}${text('Артикул: <b>AM-17</b><br/>Цена 4&nbsp;500 ₸ &quot;опт&quot; &#33; &amp;lt;b&amp;gt;')}`)}
${message(46131, text('Склад закрыт до понедельника'))}
${message(46133, `${photo('b1')}${photo('b2')}${text('Набор кукол')}`)}
${message(46134, `<a class="tgme_widget_message_video_player" href="https://t.me/toys_opt/46134"></a>${text('Видео')}`)}
</section></body></html>`

describe('parsePreviewPosts', () => {
  it('посты с фото: все фото, подпись с переносами, время; текст и видео — мимо', () => {
    const { posts } = parsePreviewPosts(PAGE)
    expect(posts.map(p => p.id)).toEqual([46130, 46133])
    expect(posts[0]).toEqual({
      id: 46130,
      date: '2026-11-03T14:50:00+00:00',
      photos: ['https://cdn4.telesco.pe/file/a.jpg'],
      caption: 'Артикул: AM-17\nЦена 4 500 ₸ "опт" ! &lt;b&gt;',
    })
    expect(posts[1]!.photos).toEqual(['https://cdn4.telesco.pe/file/b1.jpg', 'https://cdn4.telesco.pe/file/b2.jpg'])
  })

  it('самое старое и самое новое сообщение — с фото или без: для ?before= и ?after=', () => {
    const { firstId, lastId } = parsePreviewPosts(PAGE)
    expect([firstId, lastId]).toEqual([46130, 46134])
  })

  it('пустая страница — ни постов, ни номеров', () => {
    expect(parsePreviewPosts('<div class="tgme_channel_info"></div>')).toEqual({ posts: [], firstId: null, lastId: null })
  })
})

describe('isPreviewPage', () => {
  it('просмотр канала — есть tgme_channel_info; у закрытого и не-канала его нет', () => {
    expect(isPreviewPage(PAGE)).toBe(true)
    expect(isPreviewPage('<div class="tgme_page_title">Закрытый опт</div>')).toBe(false)
  })
})

describe('postText', () => {
  it('теги — прочь, <br> — перенос, сущности — один раз', () => {
    expect(postText('  <i class="emoji"><b>🎁</b></i> Кукла<br>Цена &amp;amp; скидка  ')).toBe('🎁 Кукла\nЦена &amp; скидка')
  })
})
