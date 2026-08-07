import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

/**
 * Барабан флип-счётчика должен вставать ровно на строку цифры.
 *
 * Строка равна 1.5em. В сайдбаре шрифт 22px, и 1.5em = 33px — целое число,
 * поэтому там всё сходилось. В мобильной панели шрифт 17px, и строка равна
 * дробным 25.5px, а `column.clientHeight` по спецификации округляется до
 * целого (26). Счёт смещения в пикселях от clientHeight давал ошибку 0.5px
 * на цифру: для девятки барабан промахивался на 4.5px и вставал между строк.
 */

const ROW_HEIGHT = 25.5 // 1.5em при font-size: 17px — мобильная панель
const ROWS = 10 // барабан всегда из десяти цифр
const RIBBON_HEIGHT = ROW_HEIGHT * ROWS

const gsapCalls: { target: unknown, vars: Record<string, any> }[] = []

vi.mock('gsap', () => ({
  gsap: {
    to: (target: unknown, vars: Record<string, any>) => {
      gsapCalls.push({ target, vars })
    },
    set: (target: unknown, vars: Record<string, any>) => {
      gsapCalls.push({ target, vars })
    },
    fromTo: () => {},
  },
}))

globalThis.nextTick = nextTick

const { useFlipCounter } = await import('@/composables/useFlipCounter')

/**
 * Во что реально превращается сдвиг барабана в пикселях. GSAP складывает
 * `y` и `yPercent`, поэтому учитываем оба: yPercent считается от собственной
 * высоты элемента.
 */
function effectiveOffsetPx(vars: Record<string, any>): number {
  const y = typeof vars.y === 'number' ? vars.y : 0
  const yPercent = typeof vars.yPercent === 'number' ? vars.yPercent : 0
  return y + (yPercent / 100) * RIBBON_HEIGHT
}

function buildColumn() {
  const column = document.createElement('div')
  column.className = 'digit-column'

  const ribbon = document.createElement('div')
  ribbon.className = 'digit-ribbon'
  for (let d = 0; d < ROWS; d++) {
    const item = document.createElement('div')
    item.className = 'digit-item'
    item.textContent = String(d)
    ribbon.appendChild(item)
  }
  column.appendChild(ribbon)
  document.body.appendChild(column)

  // Браузер округляет clientHeight до целого — 25.5px наружу видны как 26.
  Object.defineProperty(column, 'clientHeight', { value: Math.round(ROW_HEIGHT), configurable: true })
  return { column, ribbon }
}

// rAF + nextTick, которыми композабл откладывает инициализацию
async function flush() {
  for (let i = 0; i < 4; i++) {
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)))
    await nextTick()
  }
}

describe('useFlipCounter — барабан встаёт ровно на строку', () => {
  beforeEach(() => {
    gsapCalls.length = 0
    document.body.innerHTML = ''
  })

  it('ставит барабан на целую строку при инициализации (дробная высота строки)', async () => {
    const { column, ribbon } = buildColumn()
    const source = ref(9)
    const columns = ref<HTMLElement[]>([column])

    const scope = effectScope()
    scope.run(() => useFlipCounter(source, columns))
    await flush()

    const call = gsapCalls.findLast(c => c.target === ribbon)
    expect(call, 'барабан должен быть спозиционирован').toBeTruthy()

    expect(effectiveOffsetPx(call!.vars)).toBeCloseTo(-9 * ROW_HEIGHT, 5)
    scope.stop()
  })

  it('ставит барабан на целую строку при смене значения', async () => {
    const { column, ribbon } = buildColumn()
    const source = ref(1)
    const columns = ref<HTMLElement[]>([column])

    const scope = effectScope()
    scope.run(() => useFlipCounter(source, columns))
    await flush()

    gsapCalls.length = 0
    source.value = 7
    await flush()

    const call = gsapCalls.findLast(c => c.target === ribbon)
    expect(call, 'барабан должен быть спозиционирован').toBeTruthy()

    expect(effectiveOffsetPx(call!.vars)).toBeCloseTo(-7 * ROW_HEIGHT, 5)
    scope.stop()
  })
})
