import type { ChannelMessage } from '../../utils/supplierPosts'
import { describe, expect, it } from 'vitest'
import { groupProducts } from '../../utils/supplierPosts'

const msg = (id: number, text: string, album: string | null = null, image: string | null = `p${id}`): ChannelMessage<string> => ({ id, album, text, image })

describe('groupProducts', () => {
  it('одиночные посты с фото — по товару; без фото — мимо', () => {
    const products = groupProducts([msg(1, 'Кукла'), msg(2, 'Склад закрыт', null, null), msg(3, 'Машинка')])
    expect(products.map(p => [p.id, p.caption, p.images])).toEqual([[1, 'Кукла', ['p1']], [3, 'Машинка', ['p3']]])
  })

  it('альбом «Оптом Игрушки Алматы»: у каждого фото своя подпись — у каждого свой товар', () => {
    const products = groupProducts([msg(10, 'ART-1', 'a'), msg(11, 'ART-2', 'a'), msg(12, 'ART-3', 'a')])
    expect(products.map(p => p.caption)).toEqual(['ART-1', 'ART-2', 'ART-3'])
  })

  it('альбом с одной подписью — один товар, снимки и последнее сообщение при нём', () => {
    const [product, ...rest] = groupProducts([msg(20, 'Набор кукол', 'b'), msg(21, '', 'b'), msg(22, 'Набор кукол', 'b')])
    expect(rest).toEqual([])
    expect(product).toEqual({ id: 20, lastId: 22, album: 'b', images: ['p20', 'p21', 'p22'], caption: 'Набор кукол' })
  })

  it('подпись у второго фото альбома — товару, первое фото тоже его', () => {
    expect(groupProducts([msg(30, '', 'c'), msg(31, 'Конструктор', 'c')]))
      .toEqual([{ id: 30, lastId: 31, album: 'c', images: ['p30', 'p31'], caption: 'Конструктор' }])
  })

  it('соседние альбомы не сливаются, даже без подписей', () => {
    expect(groupProducts([msg(40, '', 'd'), msg(41, '', 'e')]).map(p => p.id)).toEqual([40, 41])
  })
})
