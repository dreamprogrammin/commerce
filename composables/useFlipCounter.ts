import type { Ref } from 'vue'
import { gsap } from 'gsap'

/** Барабан всегда собран из десяти цифр — см. `v-for="d in 10"` в разметке. */
const ROWS_IN_RIBBON = 10

/**
 * Сдвиг барабана в процентах его собственной высоты.
 *
 * В пикселях это считать нельзя. Строка цифры равна 1.5em, и в мобильной
 * панели корзины (17px) она даёт дробные 25.5px, а `clientHeight` по
 * спецификации округляется до целого — 26. Ошибка в 0.5px копилась на каждую
 * цифру: девятка промахивалась на 4.5px, и барабан вставал между строк —
 * цифры «плыли». В сайдбаре шрифт 22px, 1.5em = 33px ровно, поэтому там баг
 * не проявлялся.
 *
 * Проценты берутся от высоты самого барабана, поэтому шаг в одну цифру —
 * всегда ровно 100/10, независимо от дробности пикселей.
 */
function ribbonOffsetPercent(digit: string): number {
  return -Number.parseInt(digit, 10) * (100 / ROWS_IN_RIBBON)
}

/**
 * Барабанный счётчик суммы.
 *
 * Главное ограничение: подвинуть барабан можно только у колонки, которая
 * реально отрисована. У скрытой (или отцепленной от документа) `clientHeight`
 * равен нулю, и сдвиг просто некуда считать.
 *
 * Именно на это счётчик и наступал. Страницы `/cart` и карточка товара
 * удерживаются (`keepalive`), а удержанная страница остаётся живой: её
 * разметка перерисовывается на изменение корзины, только лежит она в это
 * время в отцепленном контейнере. Правки терялись молча, и при возврате на
 * страницу кнопка «Перейти к оформлению» показывала прежнюю сумму, а если у
 * суммы сменилось число знаков — нули на всех барабанах. Перезагрузка
 * страницы всё чинила, потому что счётчик заводился заново.
 *
 * Поэтому здесь запоминается не «инициализировано / нет», а что именно
 * нарисовано: значение и те самые узлы колонок. Любое расхождение с текущим
 * состоянием — повод дорисовать: при появлении колонок, при смене значения и
 * при возврате на удержанную страницу.
 */
export function useFlipCounter(
  source: Ref<number>,
  columnsRef: Ref<HTMLElement[]>,
) {
  // Значение и колонки, на которых оно нарисовано. null — не рисовали ещё.
  let drawnValue: number | null = null
  let drawnColumns: HTMLElement[] = []

  function digitsOf(value: number): string[] {
    return String(Math.round(value)).split('')
  }

  /**
   * Расходится ли нарисованное с тем, что должно быть сейчас.
   *
   * Сверяются и значение, и узлы: при перерисовке панели (корзину опустошили
   * и снова наполнили) колонки становятся новыми, стоят на нуле, а значение
   * при этом может совпасть с прежним.
   */
  function isStale(): boolean {
    if (drawnValue === null)
      return true
    const digits = digitsOf(source.value)
    if (digits.length !== drawnColumns.length)
      return true
    if (Math.round(drawnValue) !== Math.round(source.value))
      return true
    return drawnColumns.some((column, index) => columnsRef.value[index] !== column)
  }

  /**
   * Рисует значение. Возвращает false, если рисовать было негде, — тогда
   * попытка повторится, когда колонки появятся или страница вернётся из кэша.
   */
  function draw(value: number, animate: boolean): boolean {
    const columns = columnsRef.value
    if (!columns || columns.length === 0)
      return false

    const digits = digitsOf(value)
    const target = digits.map((_, index) => columns[index])

    // clientHeight здесь — только признак того, что колонка отрисована
    // (в скрытой колонке он 0), но не мера сдвига.
    if (target.some(column => !column || column.clientHeight === 0))
      return false

    const previous = drawnValue === null ? null : digitsOf(drawnValue)
    const sameLength = previous?.length === digits.length

    digits.forEach((digit, index) => {
      const column = target[index] as HTMLElement
      const ribbon = column.querySelector('.digit-ribbon') as HTMLElement | null
      if (!ribbon)
        return

      // Анимируем только те цифры, которые действительно изменились: остальные
      // уже стоят где надо, а лишний прогон дёргал бы всё число целиком.
      if (animate && sameLength && previous?.[index] === digit)
        return

      const targetY = ribbonOffsetPercent(digit)

      if (animate) {
        gsap.to(ribbon, {
          yPercent: targetY,
          duration: 0.8 + (index * 0.08),
          ease: 'power3.out',
          overwrite: true,
        })

        gsap.fromTo(column, { scale: 1, backgroundColor: 'transparent' }, {
          scale: 1.1,
          backgroundColor: 'rgba(59, 130, 246, 0.1)', // Используем прямой цвет вместо CSS переменной
          duration: 0.3,
          yoyo: true,
          repeat: 1,
          ease: 'power2.inOut',
        })
      }
      else {
        // y: 0 — на случай, если на барабане остался пиксельный сдвиг:
        // GSAP складывает y и yPercent, и остаток сместил бы всю ленту.
        gsap.set(ribbon, { y: 0, yPercent: targetY })
      }
    })

    drawnValue = value
    drawnColumns = target as HTMLElement[]
    return true
  }

  /** Дорисовать без анимации, когда разметка готова. */
  function redrawWhenReady() {
    requestAnimationFrame(() => {
      nextTick(() => {
        if (isStale())
          draw(source.value, false)
      })
    })
  }

  // Колонки появились или сменились.
  watch(columnsRef, (columns) => {
    if (columns && columns.length > 0 && isStale())
      redrawWhenReady()
  }, {
    immediate: true,
    flush: 'post',
    deep: true, // Следим за изменениями внутри массива
  })

  // Значение изменилось.
  watch(source, (newValue) => {
    nextTick(() => {
      // Число знаков могло измениться — колонки под него ещё не отрисованы,
      // так что первая попытка идёт после следующего кадра.
      const columns = columnsRef.value
      const grown = digitsOf(newValue).length !== columns.length

      if (!grown && draw(newValue, true))
        return

      redrawWhenReady()
    })
  }, {
    flush: 'post',
  })

  // Возврат на удержанную страницу: пока она лежала в кэше, разметка была
  // отцеплена и все правки не дорисовались.
  onActivated(() => {
    redrawWhenReady()
  })
}
