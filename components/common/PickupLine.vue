<script setup lang="ts">
/**
 * Строка самовывоза у заголовка раздела, бренда и серии.
 *
 * Зачем (план аудита 24 сентября 2026, п. 16). Самовывозом получают 42 заказа
 * из 45, а местных сигналов у страниц каталога не было: адрес и часы жили на
 * «О нас», в «Условиях» и в карточке товара, но не там, куда попадают по
 * запросам «лего алматы», «радиоуправляемые машинки алматы». Строка у
 * заголовка отвечает на «где забрать и когда» сразу — человеку до прокрутки,
 * ИИ-поиску в первом же фрагменте страницы.
 *
 * Данные — из `constants/shop.ts`, те же, что у карточки товара и «Условий»,
 * но короче: полная строка («мкр. Шапагат, ул. Амангельды, 100, ежедневно с
 * 9:00 до 22:00 · оплата Kaspi или наличными») на телефоне шла в три строки
 * и отрывала номер дома от улицы. Короткий адрес и часы выводятся из тех же
 * констант, своей копии адреса здесь нет. Оплата — Kaspi или наличные: карты
 * на оформлении нет (check-payment-options.mjs).
 *
 * Разделители « · » — в тексте, а не в CSS: извлекатели читают textContent,
 * и без них вышло бы «…100ежедневно…». Перед точкой — неразрывный пробел,
 * чтобы строка переносилась после неё, а не начиналась с неё.
 */
import { SHOP } from '@/constants/shop'

withDefaults(defineProps<{
  /** `center` — по центру на телефоне, как заголовок бренда и серии. */
  align?: 'start' | 'center'
  /** `inverse` — белым по синему, для шапки LEGO. */
  tone?: 'default' | 'inverse'
}>(), {
  align: 'start',
  tone: 'default',
})

// «мкр. Шапагат, ул. Амангельды, 100» → «Шапагат, Амангельды,» + «100»:
// номер дома идёт через неразрывный пробел и не уезжает на новую строку один
const address = SHOP.street.replace(/(?:мкр|ул)\.\s/g, '')
const cut = address.lastIndexOf(', ')
const street = cut > 0 ? address.slice(0, cut + 1) : address
const house = cut > 0 ? address.slice(cut + 2) : ''
// «09:00» → «9:00», как пишут часы в тексте
const hours = `${SHOP.opens.replace(/^0/, '')}–${SHOP.closes}`
</script>

<template>
  <!--
    По левому краю иконка висит слева от текста, и перенесённые строки идут
    под текстом, а не под ней. По центру (телефон, бренд и серия) так нельзя:
    иконка оставалась у края, а текст уезжал в середину, — там она идёт в
    строке вместе с текстом.
  -->
  <p
    class="pickup-line text-[13px] leading-snug md:text-sm"
    :class="[
      tone === 'inverse' ? 'text-white/85' : 'text-muted-foreground',
      align === 'center'
        ? 'text-center md:flex md:items-start md:gap-1.5 md:text-left'
        : 'flex items-start gap-1.5',
    ]"
  >
    <Icon
      name="lucide:store"
      class="size-4 shrink-0"
      :class="[
        tone === 'inverse' ? 'text-white' : 'text-primary',
        align === 'center' ? 'mr-1 inline-block align-[-3px] md:mr-0 md:mt-px' : 'mt-px',
      ]"
      aria-hidden="true"
    />
    <span>Самовывоз бесплатно: {{ street }}<template v-if="house">&nbsp;{{ house }}</template>&nbsp;· <span class="whitespace-nowrap">ежедневно {{ hours }}</span>&nbsp;· <span class="whitespace-nowrap">оплата Kaspi или наличными</span></span>
  </p>
</template>
