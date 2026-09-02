import { describe, expect, it } from 'vitest'
import {
  checkLengths,
  sanitizeBrandHtml,
} from '@/supabase/functions/generate-brand-seo/validate'

/**
 * Проверки стоят между ответом модели и разметкой сайта: текст «О бренде»
 * уезжает в базу и оттуда на страницу через `v-html`. Промпт просит модель
 * вернуть согласованный HTML, но обещание в промпте — не гарантия, а ответ
 * модели это данные, а не доверенный код.
 */
describe('sanitizeBrandHtml', () => {
  it('согласованную разметку не трогает', () => {
    const html = '<h2 data-icon="fluent-emoji-flat:rocket">Заголовок</h2><p>Текст</p>'
    expect(sanitizeBrandHtml(html)).toEqual({ html, warnings: [] })
  })

  it('иконки в списках сохраняются', () => {
    const html = '<ul><li data-icon="fluent-emoji-flat:teddy-bear">Пункт</li></ul>'
    expect(sanitizeBrandHtml(html).html).toBe(html)
  })

  it('картинка с обработчиком события вырезается', () => {
    const { html, warnings } = sanitizeBrandHtml('<p>ок</p><img src="x" onerror="alert(1)">')
    expect(html).toBe('<p>ок</p>')
    expect(warnings[0]).toContain('img')
  })

  it('скрипт вырезается вместе с содержимым', () => {
    const { html, warnings } = sanitizeBrandHtml('<script>alert(1)</script><p>после</p>')
    expect(html).toBe('<p>после</p>')
    expect(html).not.toContain('alert')
    expect(warnings[0]).toContain('script')
  })

  it('стили вырезаются вместе с содержимым', () => {
    expect(sanitizeBrandHtml('<style>p{color:red}</style><p>ок</p>').html).toBe('<p>ок</p>')
  })

  it('ссылка теряет тег, но текст остаётся', () => {
    expect(sanitizeBrandHtml('<a href="http://evil.tld">клик</a>').html).toBe('клик')
  })

  it('посторонние атрибуты снимаются', () => {
    expect(sanitizeBrandHtml('<p style="position:fixed" onclick="hack()">текст</p>').html)
      .toBe('<p>текст</p>')
  })

  /* `data-icon` разрешён только с именем из набора — иначе это дыра в атрибут. */
  it('подделанное значение data-icon не проходит', () => {
    expect(sanitizeBrandHtml('<li data-icon="javascript:alert(1)">пункт</li>').html)
      .toBe('<li>пункт</li>')
  })

  it('пустая строка остаётся пустой', () => {
    expect(sanitizeBrandHtml('   ')).toEqual({ html: '', warnings: [] })
  })
})

describe('checkLengths', () => {
  const good = {
    brand_id: 'b1',
    meta_title: 'Конструкторы LEGO — купить в Алматы | Ухтышка',
    seo_h1: 'Конструкторы LEGO',
    seo_description: 'Конструкторы LEGO в Алматы: 14 моделей от 6 190 ₸. Доставка за 1 день, самовывоз со склада, бонусы за покупку.',
    description: '',
  }

  it('хороший набор проходит без замечаний', () => {
    expect(checkLengths(good)).toEqual([])
  })

  it('длинный заголовок замечается', () => {
    const warnings = checkLengths({
      ...good,
      meta_title: `${'Очень длинный заголовок про конструкторы и всё остальное'.repeat(2)} | Ухтышка`,
    })
    expect(warnings.some(w => w.includes('60'))).toBe(true)
  })

  it('заголовок без названия магазина замечается', () => {
    expect(checkLengths({ ...good, meta_title: 'Конструкторы LEGO' })
      .some(w => w.includes('названия магазина'))).toBe(true)
  })

  it('слишком короткое описание замечается', () => {
    expect(checkLengths({ ...good, seo_description: 'Конструкторы LEGO' })
      .some(w => w.includes('короткое'))).toBe(true)
  })

  it('слишком длинное описание замечается', () => {
    expect(checkLengths({ ...good, seo_description: 'а'.repeat(200) })
      .some(w => w.includes('160'))).toBe(true)
  })

  /* Эмодзи в шаблонах категорий уже стоили нам нулевого CTR — сюда не пускаем. */
  it('эмодзи замечаются', () => {
    expect(checkLengths({ ...good, seo_description: `💰 ${good.seo_description}` })
      .some(w => w.includes('эмодзи'))).toBe(true)
  })
})
