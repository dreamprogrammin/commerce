import { describe, expect, it } from 'vitest'
import {
  deliveredWording,
  isPickup,
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
