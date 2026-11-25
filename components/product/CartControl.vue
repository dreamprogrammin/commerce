<script setup lang="ts">
/**
 * Цена и корзина в карточке товара — по макету Claude Design
 * `CartControl.dc.html` (25.11.2026).
 *
 * Товара в корзине нет — серая плашка с ценой и белый стеклянный шар «+»
 * справа. Нажали — шар катится влево и крутится на ходу, за ним разливается
 * синий след, «+» в шаре становится «−», посередине «N шт», справа «+».
 * Убрали последнюю штуку — всё катится обратно.
 *
 * Отличия от макета:
 *  • Подписи кнопок — «Уменьшить количество» / «Увеличить количество», как
 *    у степпера на странице товара, а не «Убрать одну» / «Добавить ещё».
 *    По ним же находят кнопки стражи.
 *  • «N шт» подпрыгивает на вложенном span без задержки. В макете прыжок
 *    ждал те же 0,42 с, что и появление надписи, за 0,16 с отменялся и не
 *    был виден вовсе.
 *  • Угол поворота меряется в момент включения, а не ResizeObserver'ом:
 *    иначе поворот телефона при товаре в корзине крутит «−» на месте.
 *  • Пока шар катится влево, второй клик не считается (ROLL_GUARD_MS), и
 *    двойное касание «В корзину» кладёт одну штуку. Иначе второе касание
 *    попадало бы в катящийся шар (товар убирался) или в «+» (вторая штука) —
 *    смотря куда пришлось. До 25.11.2026 так клались две.
 *  • Положили клавиатурой — фокус переходит на «+». Шар под фокусом стал
 *    «−», и второй Enter убирал бы только что положенный товар.
 *  • Шар идёт в разметке раньше «+»: Tab идёт «−», потом «+», как на экране.
 *  • Наведение на шар — как было на сайте (в макете оно есть только у «+»).
 *  • Цены не переносятся (whitespace-nowrap): знак ₸ уезжал на вторую строку.
 *  • На узкой плашке (телефоны уже ~385px) отступ цены слева 12px вместо 16,
 *    а пятизначная цена уменьшается настолько, чтобы не доходить до шара.
 *    Макет рисовался на 200px; на 360px пятизначная цена по нему уходила
 *    под шар на 10px (а до 25.11.2026 шар выталкивало за край плашки на 14px).
 *  • prefers-reduced-motion — без анимации, состояние меняется сразу.
 *
 * Классы-крючки для стражей и рецепта из CLAUDE.md: `button.pc-add` — шар,
 * пока товара в корзине нет (кликом по нему кладут товар); `.cc--on` —
 * товар в корзине.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { formatPrice } from '@/utils/formatPrice'

const props = defineProps<{
  /** Сколько штук в корзине; 0 — плашка с ценой. */
  qty: number
  price: number
  /** Цена до скидки: зачёркнутой показывается, только если больше `price`. */
  oldPrice?: number | null
  /**
   * Серверная разметка до гидрации: та же плашка с ценой, но шар — <span>.
   * До гидрации нажимать нечего, и фокусируемой кнопки-пустышки быть не должно.
   */
  placeholder?: boolean
}>()

const emit = defineEmits<{
  add: [event: MouseEvent]
  inc: [event: MouseEvent]
  dec: [event: MouseEvent]
}>()

/** Сколько после включения клик по шару и «+» не считается — шар ещё катится (0,62 с). */
const ROLL_GUARD_MS = 450

const rootRef = ref<HTMLElement | null>(null)
const ballRef = ref<HTMLButtonElement | null>(null)
const plusRef = ref<HTMLButtonElement | null>(null)

const on = computed(() => props.qty > 0)
const hasOld = computed(() => props.oldPrice != null && props.oldPrice > props.price)
/** Пять и шесть цифр в цене — классы, по которым цена ужимается на узкой плашке. */
const digitsClass = computed(() => {
  const digits = String(Math.round(Math.abs(props.price))).length
  return digits >= 6 ? 'cc-price--d6' : digits === 5 ? 'cc-price--d5' : undefined
})

/**
 * Поворот «+» на пути шара — как у колеса диаметром 41px (среднее между 44
 * и 38): целые полуобороты, чтобы горизонтальная черта, которая станет «−»,
 * доехала горизонтальной, и не меньше одного полуоборота. Знак минус —
 * катится влево.
 */
function rollAngle(width: number) {
  const dist = Math.max(0, width - 52)
  return -Math.max(180, Math.round(dist / (Math.PI * 41) * 2) * 180)
}

// 200px — ширина по умолчанию в макете; уточняется при каждом включении.
const angle = ref(rollAngle(200))
let onSince = Number.NEGATIVE_INFINITY
let keyboardAddAt = Number.NEGATIVE_INFINITY

watch(on, (now) => {
  if (!now)
    return
  onSince = performance.now()
  const width = rootRef.value?.clientWidth
  if (width)
    angle.value = rollAngle(width)
  // Товар кладётся после запроса к базе — фокус переносится, когда он уже
  // в корзине, и только если пользователь не ушёл с шара за это время.
  if (performance.now() - keyboardAddAt < 10_000 && document.activeElement === ballRef.value)
    nextTick(() => plusRef.value?.focus())
  keyboardAddAt = Number.NEGATIVE_INFINITY
}, { flush: 'pre' })

const bump = ref(false)
let bumpTimer: ReturnType<typeof setTimeout> | undefined

watch(() => props.qty, (next, prev) => {
  if (prev > 0 && next > 0 && prev !== next) {
    bump.value = true
    clearTimeout(bumpTimer)
    bumpTimer = setTimeout(() => {
      bump.value = false
    }, 160)
  }
})

onBeforeUnmount(() => clearTimeout(bumpTimer))

/** Клик мышью или пальцем, пока шар ещё катится влево. Клавиатура (detail 0) не в счёт. */
function rolling(event: MouseEvent) {
  return event.detail > 0 && performance.now() - onSince < ROLL_GUARD_MS
}

function onBall(event: MouseEvent) {
  if (!on.value) {
    if (event.detail === 0)
      keyboardAddAt = performance.now()
    emit('add', event)
    return
  }
  if (!rolling(event))
    emit('dec', event)
}

function onPlus(event: MouseEvent) {
  if (!rolling(event))
    emit('inc', event)
}
</script>

<template>
  <div
    ref="rootRef"
    class="cc"
    :class="{ 'cc--on': on }"
    :style="placeholder ? undefined : { '--cc-angle': `${angle}deg` }"
  >
    <div class="cc-price" :class="digitsClass">
      <span v-if="hasOld" class="cc-price__old">{{ formatPrice(oldPrice ?? 0) }}&nbsp;₸</span>
      <span class="cc-price__now" :class="{ 'cc-price__now--sale': hasOld }">{{ formatPrice(price) }}&nbsp;₸</span>
    </div>

    <span v-if="placeholder" class="cc-ball" aria-hidden="true">
      <span class="cc-spin"><span class="cc-bar cc-bar--h" /><span class="cc-bar cc-bar--v" /></span>
    </span>

    <template v-else>
      <div class="cc-trail" />
      <button
        ref="ballRef"
        type="button"
        class="cc-ball"
        :class="{ 'pc-add': !on }"
        :aria-label="on ? 'Уменьшить количество' : 'В корзину'"
        @click="onBall"
      >
        <span class="cc-spin"><span class="cc-bar cc-bar--h" /><span class="cc-bar cc-bar--v" /></span>
      </button>
      <span class="cc-label" :aria-hidden="on ? undefined : 'true'">
        <span class="cc-num" :class="{ 'cc-num--bump': bump }">{{ Math.max(qty, 1) }} шт</span>
      </span>
      <button
        ref="plusRef"
        type="button"
        class="cc-plus"
        aria-label="Увеличить количество"
        :tabindex="on ? 0 : -1"
        :inert="!on"
        @click="onPlus"
      >
        <Icon name="lucide:plus" class="size-[17px]" />
      </button>
    </template>
  </div>
</template>

<style scoped>
/* В @layer components, как и остальные scoped-стили: беслойное правило
   глушило бы утилиты Tailwind. Подробности: docs/SCOPED_STYLES_TAILWIND_LAYERS.md

   Размеры, цвета и кривые — из макета. Переход берётся у состояния, В КОТОРОЕ
   переходим: туда — `.cc--on …`, обратно — у базового правила.

   ВНИМАНИЕ: у шара и следа НЕТ backdrop-filter — и добавлять его нельзя.
   Карточка живёт в каруселях и сетках по 18+ штук на экран, а backdrop-filter
   заставляет браузер переснимать и блюрить подложку на каждом кадре. Замер на
   главной (390px, CPU ×6): с блюром медиана кадра 47.6ms / 42% кадров >50ms,
   без него — 24.9ms / 11%. След непрозрачен на 90–95%, за ним блюра не видно. */

@layer components {
  .cc {
    position: relative;
    height: 52px;
    border-radius: 9999px;
  }

  /* Плашка с ценой */
  .cc-price {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 56px 0 16px;
    border-radius: 9999px;
    background: var(--muted);
    line-height: 1.2;
    pointer-events: none;
    transition: opacity 0.2s ease 0.3s;
  }
  .cc--on .cc-price {
    opacity: 0;
    transition: opacity 0.15s ease 0.1s;
  }
  .cc-price__old {
    font-size: 13px;
    font-weight: 500;
    color: var(--price-old);
    text-decoration: line-through;
    white-space: nowrap;
  }
  .cc-price__now {
    font-size: 17px;
    font-weight: 800;
    color: var(--foreground);
    white-space: nowrap;
  }
  .cc-price__now--sale {
    color: var(--discount);
  }

  /* Сверх макета: цена на узкой плашке. Цифры у Nunito одной ширины, 0,588em;
     неразрывный пробел — половина цифры, ₸ — как цифра. Пятизначная цена с
     пробелами и ₸ — 7 цифр, 4,118em (70px при 17px), шестизначная — 4,706em.
     Шар начинается в 48px от правого края, слева отступ 12px; до шара — 6px:
     на цену остаётся 100cqi − 66px. Два из этих 6px — на округление: без
     субпиксельной раскладки ширина цифры округляется до целого пикселя, и цена
     растёт ступеньками (замер 25.11.2026 на 360/375px: с запасом 4px зазор
     выходил 1,5–2px, с 6px — не меньше 3,5px). Четырёхзначная (3,53em, 60px)
     влезает при 17px с плашки 124px (экран 360px), её не трогаем. Нет cqi
     (Safari до 16, Chrome до 105) — размер как в макете. */
  @supports (container-type: inline-size) {
    .cc {
      container-type: inline-size;
    }
    @container (max-width: 137.98px) {
      .cc-price {
        padding-left: 12px;
      }
    }
    .cc-price--d5 .cc-price__now {
      font-size: min(17px, (100cqi - 66px) / 4.118);
    }
    .cc-price--d6 .cc-price__now {
      font-size: min(17px, (100cqi - 66px) / 4.706);
    }
  }

  /* Синий след за шаром. Литералы, а не var(--color-blue-*): Tailwind 4
     выкидывает переменную темы, если её не использует ни одна утилита. */
  .cc-trail {
    position: absolute;
    inset: 0 0 0 calc(100% - 52px);
    border: 1px solid rgb(255 255 255 / 0.45);
    border-radius: 9999px;
    background: linear-gradient(150deg, rgb(77 148 255 / 0.95), rgb(23 101 235 / 0.9));
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.5),
      inset 0 -2px 8px rgb(6 53 138 / 0.28),
      0 8px 20px rgb(43 127 255 / 0.3);
    opacity: 0;
    transition:
      left 0.5s cubic-bezier(0.4, 0, 0.2, 1),
      opacity 0.12s linear 0.4s;
  }
  .cc--on .cc-trail {
    left: 0;
    opacity: 1;
    transition:
      left 0.62s cubic-bezier(0.5, 0, 0.25, 1.12),
      opacity 0.08s linear;
  }

  /* Шар: «+» справа, в корзине — «−» слева */
  .cc-ball {
    position: absolute;
    z-index: 2;
    top: 4px;
    left: calc(100% - 48px);
    display: grid;
    width: 44px;
    height: 44px;
    padding: 0;
    place-content: center;
    border: 1px solid rgb(255 255 255 / 0.9);
    border-radius: 9999px;
    background: linear-gradient(150deg, rgb(255 255 255 / 0.95), rgb(224 233 247 / 0.6));
    box-shadow:
      inset 0 1px 0 #fff,
      0 4px 12px rgb(43 127 255 / 0.2);
    color: var(--primary);
    cursor: pointer;
    transition:
      left 0.5s cubic-bezier(0.4, 0, 0.2, 1),
      top 0.3s ease,
      width 0.3s ease,
      height 0.3s ease,
      background 0.35s ease,
      color 0.35s ease,
      box-shadow 0.35s ease,
      border-color 0.35s ease;
  }
  .cc--on .cc-ball {
    top: 7px;
    left: 7px;
    width: 38px;
    height: 38px;
    border-color: rgb(255 255 255 / 0.35);
    background: rgb(255 255 255 / 0.26);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.45);
    color: #fff;
    transition:
      left 0.62s cubic-bezier(0.5, 0, 0.25, 1.12),
      top 0.3s ease,
      width 0.3s ease,
      height 0.3s ease,
      background 0.35s ease,
      color 0.35s ease,
      box-shadow 0.35s ease,
      border-color 0.35s ease;
  }

  /* «+» из двух черт: при включении вертикальная схлопывается, остаётся «−» */
  .cc-spin {
    position: relative;
    display: block;
    width: 26px;
    height: 26px;
    transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .cc--on .cc-spin {
    transform: rotate(var(--cc-angle, -360deg));
    transition: transform 0.62s cubic-bezier(0.5, 0, 0.25, 1.12);
  }
  .cc-bar {
    position: absolute;
    top: 50%;
    left: 50%;
    border-radius: 2px;
    background: currentColor;
    transition-property: width, height, margin, transform;
    transition-duration: 0.3s;
    transition-timing-function: ease;
  }
  .cc-bar--h {
    width: 18px;
    height: 3px;
    margin: -1.5px 0 0 -9px;
  }
  .cc-bar--v {
    width: 3px;
    height: 18px;
    margin: -9px 0 0 -1.5px;
  }
  .cc--on .cc-bar--h {
    width: 13px;
    height: 2.5px;
    margin: -1.25px 0 0 -6.5px;
  }
  .cc--on .cc-bar--v {
    width: 2.5px;
    height: 13px;
    margin: -6.5px 0 0 -1.25px;
    transform: scaleY(0);
    transition-delay: 0.25s;
  }

  /* «N шт» */
  .cc-label {
    position: absolute;
    inset: 0 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 15px;
    font-weight: 800;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transform: scale(0.6);
    transition:
      opacity 0.1s ease,
      transform 0.15s ease;
  }
  .cc--on .cc-label {
    opacity: 1;
    transform: scale(1);
    transition:
      opacity 0.22s ease 0.42s,
      transform 0.25s cubic-bezier(0.34, 1.6, 0.6, 1) 0.42s;
  }
  .cc-num {
    display: inline-block;
    transition: transform 0.25s cubic-bezier(0.34, 1.6, 0.6, 1);
  }
  .cc-num--bump {
    transform: scale(1.18);
    transition: transform 0.12s ease-out;
  }

  /* «+» справа */
  .cc-plus {
    position: absolute;
    top: 7px;
    right: 7px;
    display: grid;
    width: 38px;
    height: 38px;
    padding: 0;
    place-content: center;
    border: none;
    border-radius: 9999px;
    background: rgb(255 255 255 / 0.26);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.45);
    color: #fff;
    cursor: pointer;
    pointer-events: none;
    opacity: 0;
    transform: scale(0.3);
    transition:
      opacity 0.1s ease,
      transform 0.1s ease;
  }
  .cc--on .cc-plus {
    pointer-events: auto;
    opacity: 1;
    transform: scale(1);
    transition:
      opacity 0.2s ease 0.3s,
      transform 0.3s cubic-bezier(0.34, 1.6, 0.6, 1) 0.3s,
      background 0.12s ease;
  }

  /* Наведение — только там, где есть мышь: на телефоне :hover залипает
     после касания. */
  @media (hover: hover) {
    .cc:not(.cc--on) .cc-ball:hover {
      background: linear-gradient(150deg, #fff, rgb(191 219 254 / 0.75));
    }
    .cc--on .cc-ball:hover,
    .cc--on .cc-plus:hover {
      background: rgb(255 255 255 / 0.38);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .cc-price,
    .cc-trail,
    .cc-ball,
    .cc-spin,
    .cc-bar,
    .cc-label,
    .cc-num,
    .cc-plus {
      transition: none !important;
    }
    .cc-num--bump {
      transform: none;
    }
  }
}
</style>
