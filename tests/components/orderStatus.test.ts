import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OrderProgressBar from '@/components/order/OrderProgressBar.vue'
import OrderTracker from '@/components/order/OrderTracker.vue'
import {
  ORDER_STEPS,
  ORDER_TRACK_LABELS,
  orderStatusInfo,
  orderStatusToSegment,
  orderStatusToStep,
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
      expect(orderStatusInfo('processing').title).toBe('Заказ комплектуется')
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

  describe('полоса прогресса', () => {
    function litSegments(status: string) {
      const wrapper = mount(OrderProgressBar, { props: { status } })
      return wrapper.findAll('.opb-seg--done').length
    }

    it('заполняется по мере продвижения заказа', () => {
      expect(litSegments('new')).toBe(1)
      expect(litSegments('confirmed')).toBe(2)
      expect(litSegments('processing')).toBe(3)
      expect(litSegments('shipped')).toBe(4)
      expect(litSegments('delivered')).toBe(5)
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
      expect(mountTracker('confirmed').findAll('.ot-dot--done')).toHaveLength(2)
      // «Комплектуется» отдельного шага в ленте не имеет — он идёт вместе
      // с «Подтверждён», в отличие от полосы прогресса.
      expect(mountTracker('processing').findAll('.ot-dot--done')).toHaveLength(2)
      expect(mountTracker('shipped').findAll('.ot-dot--done')).toHaveLength(3)
      expect(mountTracker('delivered').findAll('.ot-dot--done')).toHaveLength(4)
    })

    it('у отменённого не подсвечено ничего', () => {
      expect(mountTracker('cancelled').findAll('.ot-dot--done')).toHaveLength(0)
    })

    it('рисует все четыре шага с описаниями', () => {
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
