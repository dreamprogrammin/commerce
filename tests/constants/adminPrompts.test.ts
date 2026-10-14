import { describe, expect, it } from 'vitest'
import { buildAdminPrompt } from '@/constants/adminPrompts'

/*
 * Промпт из кнопки в форме: правила магазина, ДАННЫЕ с тем, что уже есть в
 * форме, и поля ответа под подписями формы — чтобы ответ вставлялся по полям.
 */
describe('buildAdminPrompt', () => {
  it('товар: известное подставлено, HTML описания снят, поля как в форме', () => {
    const text = buildAdminPrompt('product', { name: 'Робот BG1544', brand: 'SuboTech', price: 13390, description: '<h2>Робот</h2><p>Умный</p>' })
    expect(text).toContain('- Бренд: SuboTech')
    expect(text).toContain('- Цена (₸): 13390')
    expect(text).toContain('- Текущее описание (если переписываем): Робот Умный')
    expect(text).toContain('- Код модели (артикул с коробки): \n')
    for (const field of ['Название товара:', 'Описание:', 'SEO описание:'])
      expect(text).toContain(field)
    expect(text.indexOf('ДАННЫЕ:')).toBeLessThan(text.indexOf('ПОЛЯ:'))
  })

  it('правила магазина — условия с /terms и запреты', () => {
    const text = buildAdminPrompt('brand', { name: 'CaDA' })
    expect(text).toContain('Доставка по Алматы — 1–3 рабочих дня')
    expect(text).toContain('широкий выбор')
    expect(text).not.toMatch(/за 1 день при заказе/)
  })

  it('раздел и бренд — подписи полей как в формах', () => {
    const category = buildAdminPrompt('category', { name: 'Толокар', parent: '/catalog/kiddy', children: '' })
    for (const field of ['SEO заголовок (Title):', 'H1 заголовок на странице:', 'Ключевые слова:', 'Описание ПОД товарами (SEO текст):'])
      expect(category).toContain(field)
    const brand = buildAdminPrompt('brand', { name: 'CaDA' })
    for (const field of ['Заголовок страницы (title):', 'Заголовок на странице (H1):', 'SEO описание:', 'Описание:'])
      expect(brand).toContain(field)
  })
})
