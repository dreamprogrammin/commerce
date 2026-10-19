import { describe, expect, it } from 'vitest'
import {
  courierMessage,
  deliveredWording,
  isCourier,
  isPickup,
  isPost,
  PICKUP_POINT,
  shippedWording,
} from '@/supabase/functions/_shared/shopInfo'

/**
 * Один и тот же статус значит разное: курьеру заказ передают, а самовывозный
 * собирают и ставят на выдачу. Текст был написан только под курьера, и
 * покупатель самовывоза получал «заказ уже едет к вам» — на проде это 42
 * заказа из 45.
 */
describe('шаг отгрузки', () => {
  it('самовывоз: покупателя зовут прийти, а не ждать курьера', () => {
    const w = shippedWording('pickup')
    expect(w.button).toBe('📦 Готов к выдаче')
    expect(w.customerTitle).toContain('готов к выдаче')

    const text = w.customerBody('5e4fc2')
    expect(text).toContain('ждёт вас')
    expect(text).not.toContain('едет к вам')
    // Адрес и часы — чтобы человеку не пришлось искать их самому.
    expect(text).toContain(PICKUP_POINT.address)
    expect(text).toContain(PICKUP_POINT.hours)
  })

  it('курьер: заказ едет к покупателю', () => {
    const w = shippedWording('courier')
    expect(w.button).toBe('🚚 Передать курьеру')
    expect(w.customerBody('5e4fc2')).toContain('едет к вам')
  })

  /*
   * Способ доставки может прийти пустым (старый заказ, сбой записи).
   * Курьерский текст безопаснее: он не зовёт человека ехать зря.
   */
  it('неизвестный способ считается курьерским', () => {
    for (const method of [null, undefined, '', 'что-то новое'])
      expect(shippedWording(method as any).button, String(method)).toBe('🚚 Передать курьеру')
  })
})

describe('последний шаг', () => {
  it('самовывоз: заказ выдан, а не доставлен', () => {
    const w = deliveredWording('pickup')
    expect(w.button).toBe('✅ Выдан покупателю')
    expect(w.adminTitle).toBe('ВЫДАН')
  })

  it('курьер: доставлен', () => {
    expect(deliveredWording('courier').adminTitle).toBe('ДОСТАВЛЕН')
  })

  it('оба варианта благодарят покупателя', () => {
    for (const method of ['pickup', 'courier'])
      expect(deliveredWording(method).customerBody('5e4fc2')).toContain('Спасибо')
  })
})

describe('isPickup', () => {
  it('различает только самовывоз', () => {
    expect(isPickup('pickup')).toBe(true)
    expect(isPickup('courier')).toBe(false)
    expect(isPickup(null)).toBe(false)
  })
})

/*
 * Адрес обязан совпадать с тем, что написано на сайте: покупатель сверит
 * сообщение бота со страницей «О нас» — и должен увидеть одно и то же.
 */
describe('пункт выдачи', () => {
  it('адрес тот же, что на сайте', () => {
    expect(PICKUP_POINT.address).toContain('Шапагат')
    expect(PICKUP_POINT.address).toContain('Амангельды')
    expect(PICKUP_POINT.address).toContain('Алматы')
  })
})

/**
 * Сообщение курьеру. Владелец выбрал состав: адрес, время, телефон, сумма —
 * и ничего лишнего. Курьеру не нужны ни отмены, ни бонусы, ни состав заказа:
 * он везёт коробку и берёт деньги, если оплата наличными.
 */
describe('сообщение курьеру', () => {
  const order = (patch = {}) => ({
    id: 'd7a7ed7f-94dc-4895-8838-90562bf973cb',
    final_amount: 16480,
    payment_method: 'cash',
    delivery_address: { city: 'Алматы', line1: 'ул. Абая 10, кв. 5' },
    delivery_date: '2026-09-04',
    delivery_slot: '14:00–18:00',
    customer_name: 'Айгерим',
    customer_phone: '+7 701 555 44 33',
    ...patch,
  } as any)

  it('несёт то, что нужно в дороге', () => {
    const text = courierMessage(order())
    expect(text).toContain('Доставка №f973cb')
    expect(text).toContain('Алматы, ул. Абая 10, кв. 5')
    expect(text).toContain('+7 701 555 44 33')
    expect(text).toContain('Айгерим')
  })

  /* Дату курьер читает на ходу — сырая из базы тут лишняя работа для глаз. */
  it('дата по-человечески', () => {
    expect(courierMessage(order())).toContain('4 сентября, 14:00–18:00')
  })

  it('сумма с разделителем тысяч', () => {
    expect(courierMessage(order())).toContain('16 480 ₸')
  })

  /* При оплате картой деньги уже забрали — цифра в руках курьера только путает. */
  /*
   * Kaspi бывает по-разному — перевод заранее или QR у двери (владелец, 19
   * октября 2026). Раньше курьер читал «оплачено картой» — на бою так шли 64
   * заказа из 67.
   */
  it('у Kaspi — сумма и просьба уточнить у менеджера, а не «оплачено картой»', () => {
    const text = courierMessage(order({ payment_method: 'kaspi', final_amount: 13390 }))
    expect(text).toContain('Kaspi: 13 390 ₸')
    expect(text).toContain('уточните у менеджера')
    expect(text).not.toContain('оплачено картой')
  })

  it('при оплате картой суммы к оплате нет', () => {
    const text = courierMessage(order({ payment_method: 'card' }))
    expect(text).toContain('оплачено картой')
    expect(text).not.toContain('к оплате')
  })

  it('без адреса сообщение всё равно уходит', () => {
    expect(courierMessage(order({ delivery_address: null }))).toContain('адрес не указан')
  })

  it('гостевой заказ: имя и телефон из своих полей', () => {
    const text = courierMessage(order({
      customer_name: null, customer_phone: null,
      guest_name: 'Марат', guest_phone: '+77012223344',
    }))
    expect(text).toContain('Марат')
    expect(text).toContain('+77012223344')
  })

  it('комментарий покупателя доходит до курьера', () => {
    expect(courierMessage(order({ comment: 'домофон не работает' })))
      .toContain('домофон не работает')
  })
})

/*
 * Посылка в другой город (`post`, с 19 октября 2026): Kazpost или CDEK, цена
 * по весу. «Отправлен» значит «сдан перевозчику», а не «передан курьеру».
 */
describe('посылка в другой город', () => {
  it('отгрузка — «отправлен», без курьера', () => {
    const w = shippedWording('post')
    expect(w.button).toBe('📮 Отправлен')
    expect(w.adminTitle).toBe('ОТПРАВЛЕН')
    const text = w.customerBody('1004')
    expect(text).toContain('Kazpost или CDEK')
    expect(text).toContain('3–7 рабочих дней')
    expect(text).not.toMatch(/курьер|едет к вам|ждёт вас/i)
  })

  it('последний шаг — «получен»', () => {
    const w = deliveredWording('post')
    expect(w.button).toBe('✅ Получен')
    expect(w.customerBody('1004')).toContain('получен')
  })

  it('курьеры такой заказ не получают', () => {
    expect(isPost('post')).toBe(true)
    expect(isCourier('post')).toBe(false)
    expect(isCourier('pickup')).toBe(false)
    expect(isCourier('courier')).toBe(true)
    // Неизвестный способ по-прежнему курьерский — как и в подписях выше.
    expect(isCourier(null)).toBe(true)
  })
})
