import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OrderProgressBar from '@/components/order/OrderProgressBar.vue'
import OrderTracker from '@/components/order/OrderTracker.vue'
import {
  ORDER_STEPS,
  ORDER_TRACK_LABELS,
  orderStatusBadge,
  orderStatusInfo,
  orderStatusToSegment,
  orderStatusToStep,
  orderSteps,
  orderTrackLabels,
} from '@/utils/orderStatus'

/**
 * Авторизованная ветка страницы «Заказ принят» — единственная, которую нельзя
 * посмотреть без живой сессии и настоящего заказа. Здесь она проверяется
 * сборкой: что с каждым статусом действительно меняются анимация, подпись,
 * заполнение полосы и лента шагов.
 */
describe('представление статуса заказа', () => {
  describe('анимация и подпись', () => {
    it('на каждый статус своя анимация и свой текст', () => {
      const seen = new Map<string, string>()

      for (const status of ['new', 'confirmed', 'processing', 'shipped', 'delivered']) {
        const info = orderStatusInfo(status)
        expect(info.animation, `${status}: нет анимации`).toMatch(/\.lottie$/)
        expect(info.title.length).toBeGreaterThan(0)
        seen.set(status, info.animation)
      }

      // Пять статусов — пять разных файлов, а не один на всех.
      expect(new Set(seen.values()).size).toBe(5)
    })

    it('подписи меняются, а не остаются «Заказ принят»', () => {
      expect(orderStatusInfo('new').title).toBe('Заказ принят')
      expect(orderStatusInfo('confirmed').title).toBe('Заказ подтверждён')
      expect(orderStatusInfo('processing').title).toBe('Заказ в обработке')
      expect(orderStatusInfo('shipped').title).toBe('Заказ в пути')
      expect(orderStatusInfo('delivered').title).toBe('Заказ доставлен')
      expect(orderStatusInfo('cancelled').title).toBe('Заказ отменён')
    })

    it('неизвестный статус не роняет страницу', () => {
      expect(orderStatusInfo('какая-то-ерунда').title).toBe('Заказ принят')
    })

    it('pending и completed — синонимы new и delivered', () => {
      expect(orderStatusInfo('pending')).toEqual(orderStatusInfo('new'))
      expect(orderStatusInfo('completed')).toEqual(orderStatusInfo('delivered'))
      expect(orderStatusToSegment('pending')).toBe(orderStatusToSegment('new'))
      expect(orderStatusToStep('completed')).toBe(orderStatusToStep('delivered'))
    })
  })

  describe('плашка в списке заказов', () => {
    it('тон отделяет отменённые, выполненные и доставку от обработки', () => {
      expect(orderStatusBadge('cancelled').tone).toBe('cancelled')
      expect(orderStatusBadge('delivered').tone).toBe('done')
      expect(orderStatusBadge('shipped').tone).toBe('shipping')

      // По этим тонам вкладка «Активные» собирает свой список
      for (const status of ['new', 'pending', 'confirmed', 'processing'])
        expect(orderStatusBadge(status).tone, status).toBe('processing')
    })

    it('«Подтверждён» не сливается с «В обработке» по подписи', () => {
      expect(orderStatusBadge('confirmed').label).toBe('Подтверждён')
      expect(orderStatusBadge('processing').label).toBe('В обработке')
    })

    it('синонимы статусов дают одну плашку, неизвестный не роняет', () => {
      expect(orderStatusBadge('completed')).toEqual(orderStatusBadge('delivered'))
      expect(orderStatusBadge('pending')).toEqual(orderStatusBadge('new'))
      expect(orderStatusBadge('какая-то-ерунда').tone).toBe('processing')
    })
  })

  describe('полоса прогресса', () => {
    function litSegments(status: string) {
      const wrapper = mount(OrderProgressBar, { props: { status } })
      return wrapper.findAll('.opb-seg--done').length
    }

    /*
     * Порядок взят с кнопок оператора в Telegram: «Взять в работу» ставит
     * processing, и только следующая кнопка «Подтвердить» — confirmed.
     * До 2 сентября 2026 здесь стояло наоборот (confirmed 2, processing 3),
     * и тест закреплял баг: у покупателя полоса ехала НАЗАД, когда оператор
     * подтверждал взятый в работу заказ.
     */
    it('заполняется по мере продвижения заказа', () => {
      expect(litSegments('new')).toBe(1)
      expect(litSegments('processing')).toBe(2)
      expect(litSegments('confirmed')).toBe(3)
      expect(litSegments('shipped')).toBe(4)
      expect(litSegments('delivered')).toBe(5)
    })

    it('подтверждение не отбрасывает заказ назад', () => {
      expect(litSegments('confirmed')).toBeGreaterThan(litSegments('processing'))
    })

    it('у отменённого заказа гаснет целиком', () => {
      const wrapper = mount(OrderProgressBar, { props: { status: 'cancelled' } })
      expect(wrapper.findAll('.opb-seg--done')).toHaveLength(0)
      expect(wrapper.findAll('.opb-seg--cancelled')).toHaveLength(
        ORDER_TRACK_LABELS.length,
      )
    })

    it('показывает все пять подписей', () => {
      const wrapper = mount(OrderProgressBar, { props: { status: 'new' } })
      for (const label of ORDER_TRACK_LABELS)
        expect(wrapper.text()).toContain(label)
    })
  })

  describe('лента статусов', () => {
    function mountTracker(status: string) {
      return mount(OrderTracker, {
        props: { orderId: 'order-1', initialStatus: status },
        global: { stubs: { Icon: true } },
      })
    }

    it('подсвечивает шаги по статусу', () => {
      expect(mountTracker('new').findAll('.ot-dot--done')).toHaveLength(1)
      expect(mountTracker('processing').findAll('.ot-dot--done')).toHaveLength(2)
      expect(mountTracker('confirmed').findAll('.ot-dot--done')).toHaveLength(3)
      expect(mountTracker('shipped').findAll('.ot-dot--done')).toHaveLength(4)
      expect(mountTracker('delivered').findAll('.ot-dot--done')).toHaveLength(5)
    })

    /*
     * Лента и полоса стоят на странице «Заказ принят» рядом. Раньше у ленты
     * был свой набор из четырёх шагов и свои названия («Отправлен» против
     * «В пути»), то есть покупатель видел два разных рассказа об одном заказе.
     */
    it('лента и полоса согласованы: столько же шагов, столько же подсвечено', () => {
      expect(ORDER_STEPS).toHaveLength(ORDER_TRACK_LABELS.length)
      for (const status of ['new', 'processing', 'confirmed', 'shipped', 'delivered']) {
        expect(
          mountTracker(status).findAll('.ot-dot--done').length,
          status,
        ).toBe(mount(OrderProgressBar, { props: { status } }).findAll('.opb-seg--done').length)
      }
    })

    it('у отменённого не подсвечено ничего', () => {
      expect(mountTracker('cancelled').findAll('.ot-dot--done')).toHaveLength(0)
    })

    it('рисует все пять шагов с описаниями', () => {
      const text = mountTracker('new').text()
      for (const step of ORDER_STEPS) {
        expect(text).toContain(step.title)
        expect(text).toContain(step.sub)
      }
    })

    it('последний шаг без соединительной линии', () => {
      const wrapper = mountTracker('new')
      expect(wrapper.findAll('.ot-line')).toHaveLength(ORDER_STEPS.length - 1)
    })
  })
})

/**
 * Самовывоз. Покупатель, забирающий заказ сам, видел в кабинете «В пути» и
 * «Доставлен» — хотя заказ никуда не едет: он собран и ждёт в пункте выдачи.
 * На проде самовывозом идут 42 заказа из 45, то есть неверные подписи видели
 * почти все.
 */
describe('подписи для самовывоза', () => {
  it('последние два шага называются иначе', () => {
    const courier = orderTrackLabels('courier')
    const pickup = orderTrackLabels('pickup')

    // Первые три шага одинаковы: заказ приняли, взяли в работу, подтвердили.
    expect(pickup.slice(0, 2)).toEqual(courier.slice(0, 2))
    expect(pickup[3]).toBe('Готов к выдаче')
    expect(pickup[4]).toBe('Выдан')
    expect(pickup).not.toContain('В пути')
    expect(pickup).not.toContain('Доставлен')
  })

  it('у курьера подписи прежние', () => {
    expect(orderTrackLabels('courier')).toContain('В пути')
    expect(orderTrackLabels('courier')).toContain('Доставлен')
  })

  /* Способ доставки может не прийти — тогда безопаснее курьерский вариант. */
  it('без способа доставки — курьерские подписи', () => {
    expect(orderTrackLabels(undefined)).toEqual(orderTrackLabels('courier'))
    expect(orderTrackLabels(null)).toEqual(orderTrackLabels('courier'))
  })

  it('лента шагов тоже своя', () => {
    const titles = orderSteps('pickup').map(s => s.title)
    expect(titles).toContain('Готов к выдаче')
    expect(titles).toContain('Выдан')
    expect(orderSteps('pickup')).toHaveLength(orderSteps('courier').length)
  })

  it('заголовок над анимацией не обещает курьера', () => {
    expect(orderStatusInfo('shipped', 'pickup').title).toBe('Заказ готов к выдаче')
    expect(orderStatusInfo('delivered', 'pickup').title).toBe('Заказ выдан')
    expect(orderStatusInfo('shipped', 'courier').title).toBe('Заказ в пути')
  })

  it('первые шаги описаны одинаково для обоих способов', () => {
    expect(orderStatusInfo('new', 'pickup')).toEqual(orderStatusInfo('new', 'courier'))
    expect(orderStatusInfo('confirmed', 'pickup')).toEqual(orderStatusInfo('confirmed', 'courier'))
  })

  it('полоса прогресса рисует подписи самовывоза', () => {
    const wrapper = mount(OrderProgressBar, {
      props: { status: 'shipped', deliveryMethod: 'pickup' },
    })
    expect(wrapper.text()).toContain('Готов к выдаче')
    expect(wrapper.text()).not.toContain('В пути')
    // Заполнение то же самое: статус один, меняются только слова.
    expect(wrapper.findAll('.opb-seg--done')).toHaveLength(4)
  })

  it('лента статусов рисует шаги самовывоза', () => {
    const wrapper = mount(OrderTracker, {
      props: { orderId: 'o-1', initialStatus: 'delivered', deliveryMethod: 'pickup' },
      global: { stubs: { Icon: true } },
    })
    expect(wrapper.text()).toContain('Выдан')
    expect(wrapper.text()).not.toContain('Курьер уже везёт')
  })
})
