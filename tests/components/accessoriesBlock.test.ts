import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AccessoriesBlock from '@/components/global/AccessoriesBlock.vue'

/**
 * «С этим покупают» на карточке товара вешал на window слушатель resize и
 * никогда его не снимал. Каждое открытие карточки добавляло ещё один, и
 * каждый держал в памяти уже ушедший со страницы компонент (найдено 28
 * сентября 2026 при разборе скорости карточки).
 */

const stub = { template: '<div><slot /></div>' }
const STUBS = Object.fromEntries(
  ['Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription', 'Drawer', 'DrawerContent', 'DrawerHeader', 'DrawerTitle', 'Badge', 'Icon', 'AccessoriesCarousel']
    .map(name => [name, stub]),
)

const accessory = { id: 'a1', name: 'Батарейки АА', categories: { slug: 'batteries' } }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('блок «С этим покупают»', () => {
  it('снимает слушатель resize с window, когда блок уходит со страницы', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')

    const wrapper = mount(AccessoriesBlock, {
      props: { accessories: [accessory] as never },
      global: { stubs: STUBS },
    })
    const added = add.mock.calls.filter(([type]) => type === 'resize').map(([, handler]) => handler)
    expect(added).toHaveLength(1)

    wrapper.unmount()
    const removed = remove.mock.calls.filter(([type]) => type === 'resize').map(([, handler]) => handler)
    expect(removed).toContain(added[0])
  })
})
