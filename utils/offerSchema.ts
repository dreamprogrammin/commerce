/**
 * Условия продавца в разметке Offer — одни на весь сайт.
 *
 * Зачем отдельный файл. Разметку товара сайт отдаёт в четырёх местах: на
 * карточке товара и в списках — разделе, странице бренда, странице линейки.
 * 17 сентября 2026 ложные обещания исправили на карточке, а три копии в
 * списках так и остались со старыми: «доставка 0 ₸», «возврат почтой»,
 * «возврат бесплатно». Google читает их как данные продавца — URL
 * Inspection 21 сентября на /catalog/girls/kukly: «Данные о товарах
 * продавца — 10 шт.». Теперь условия живут здесь, и разойтись копиям не
 * из чего.
 *
 * Каждая функция возвращает НОВЫЙ объект: узлы разметки собирает
 * nuxt-schema-org, и общий объект на несколько товаров — лишний риск.
 */

import { COURIER_DELIVERY_COST } from '@/constants'

/**
 * Условия возврата — с /returns, слово в слово:
 *  • «в течение 14 календарных дней» → merchantReturnDays 14;
 *  • «Транспортные расходы при возврате или обмене товара надлежащего
 *    качества оплачивает покупатель» → ReturnFeesCustomerResponsibility.
 *    Стоял FreeReturn, то есть разметка обещала бесплатный возврат, которого
 *    магазин не даёт (бесплатен только возврат брака);
 *  • «через курьера или в пункте самовывоза» → ReturnInStore. Стояло
 *    ReturnByMail — почтой возвраты не принимаются вовсе.
 */
export function merchantReturnPolicy() {
  return {
    '@type': 'MerchantReturnPolicy' as const,
    'applicableCountry': 'KZ',
    'returnPolicyCategory': 'https://schema.org/MerchantReturnFiniteReturnWindow',
    'merchantReturnDays': 14,
    'returnMethod': 'https://schema.org/ReturnInStore',
    'returnFees': 'https://schema.org/ReturnFeesCustomerResponsibility',
  }
}

/**
 * Доставка — то, что реально считает касса и обещает блок на карточке.
 *
 * Стоимость. Стоял ноль на весь Казахстан, и Google по этому полю рисует
 * «бесплатная доставка». Касса же берёт COURIER_DELIVERY_COST
 * (cartStore.deliveryCost), а ноль получается только у самовывоза и от
 * порога FREE_SHIPPING_THRESHOLD. Ставим обычную цену курьера: занизить своё
 * же обещание безопасно, завысить — нет.
 *
 * Срок. Стояло 1–3 дня на всю страну, хотя блок доставки на карточке говорит
 * «Курьером по Алматы 1–2 дня» и «По Казахстану 3–7 дней, Kazpost или CDEK».
 * Берём объединение: 1–7. Разнести по регионам двумя записями можно, но
 * addressRegion для Алматы Google разбирает ненадёжно, а неразобранная
 * запись хуже широкой честной.
 */
export function offerShippingDetails() {
  return {
    '@type': 'OfferShippingDetails' as const,
    'shippingRate': {
      '@type': 'MonetaryAmount' as const,
      'value': COURIER_DELIVERY_COST,
      'currency': 'KZT',
    },
    'shippingDestination': {
      '@type': 'DefinedRegion' as const,
      'addressCountry': 'KZ',
    },
    'deliveryTime': {
      '@type': 'ShippingDeliveryTime' as const,
      'handlingTime': {
        '@type': 'QuantitativeValue' as const,
        'minValue': 0,
        'maxValue': 1,
        'unitCode': 'DAY',
      },
      'transitTime': {
        '@type': 'QuantitativeValue' as const,
        'minValue': 1,
        'maxValue': 7,
        'unitCode': 'DAY',
      },
    },
  }
}

/** Текущая цена: final_price из базы, иначе цена как есть — целым числом. */
export function offerPrice(product: { price: number | string | null, final_price?: number | null }): number {
  return product.final_price || Math.round(Number(product.price))
}

/**
 * Скидка — так, как её понимает Google в товарных карточках выдачи.
 *
 * Правило из документации merchant listing: «Don't mark the active price
 * with a priceType property» — текущая цена идёт в `price` без пометок, а
 * старая, зачёркнутая, — в priceSpecification с StrikethroughPrice. Только
 * этот тип и поддерживается.
 *
 * До 21 сентября 2026 было наоборот: в priceSpecification стояла ТЕКУЩАЯ
 * цена с пометкой SalePrice, старой не было вовсе. Search Console отмечал на
 * каждой такой карточке «Отсутствует поле validFrom», а показать в выдаче
 * «было/стало» Google не мог — старую цену было неоткуда взять.
 *
 * Старая цена — `product.price`: ровно её сайт показывает зачёркнутой.
 * Разметка обязана совпадать с тем, что видит покупатель. Без скидки или
 * если «старая» не выше текущей — ничего.
 */
export function strikethroughPrice(product: {
  price: number | string | null
  final_price?: number | null
  discount_percentage?: number | null
}) {
  const original = Math.round(Number(product.price))
  if (!(Number(product.discount_percentage) > 0) || !(original > offerPrice(product)))
    return {}
  return {
    priceSpecification: {
      '@type': 'UnitPriceSpecification' as const,
      'priceType': 'https://schema.org/StrikethroughPrice',
      'price': original,
      'priceCurrency': 'KZT',
    },
  }
}
