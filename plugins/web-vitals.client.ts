/**
 * Core Web Vitals от РЕАЛЬНЫХ посетителей — в GA4.
 *
 * Зачем это вообще. Все цифры скорости, которыми мы до сих пор мерились, —
 * лабораторные: PageSpeed гоняет эмуляцию, а разброс между прогонами на этом
 * сайте огромный (LCP категории гулял 5401–8419 мс в трёх прогонах подряд).
 * Полевых данных нет и взять их неоткуда: CrUX по домену пуст, Google не
 * набрал статистики — проверено 20 и 21 августа 2026, `loadingExperience` и
 * `originLoadingExperience` пустые оба раза. Порог CrUX снижается трафиком, а
 * не настройками, то есть ждать пришлось бы годами.
 *
 * Отсюда единственная рабочая дорога: собирать метрики самим, с тех людей,
 * которые на сайт уже приходят. Счётчик GA4 на сайте работает и события
 * принимает — значит нужен только отправитель.
 *
 * ЧТО НУЖНО СДЕЛАТЬ ВЛАДЕЛЬЦУ, чтобы этими данными можно было пользоваться:
 * события начнут копиться сразу, но в отчётах GA4 параметры вроде
 * `metric_rating` появятся только после регистрации специальных параметров
 * (Администратор → Специальные определения → Создать специальный параметр,
 * область «Событие»). Без регистрации доступен только `value`. И отдельно —
 * чтобы их читал я, нужен доступ сервис-аккаунта к ресурсу GA4 (см.
 * docs/HANDOFF.md, раздел про GA4).
 *
 * Почему `attribution`-сборка, а не обычная. Обычная скажет «CLS 0.15», и
 * дальше гадать. Attribution скажет, КАКОЙ элемент сдвинулся, — а мы за эту
 * сессию дважды искали виновника сдвига вручную и оба раза это стоило часов.
 * Платим за это ~15 КБ сырьём против 9, и платим не из критического пути:
 * чанк грузится динамическим импортом после `load` и в простое.
 *
 * Почему `.client.ts`. На сервере метрик нет по определению, а `web-vitals`
 * трогает `document` при импорте.
 */

/** Метрики, у которых порог «хорошо» задан в долях, а не в миллисекундах. */
const UNITLESS = new Set(['CLS'])

/** Отложить до момента, когда страница уже отрисована и поток свободен. */
function whenIdle(run: () => void) {
  const schedule = () => {
    if (typeof requestIdleCallback === 'function')
      requestIdleCallback(run, { timeout: 5000 })
    else setTimeout(run, 2000)
  }

  if (document.readyState === 'complete')
    schedule()
  else window.addEventListener('load', schedule, { once: true })
}

export default defineNuxtPlugin(() => {
  const gtagId = useRuntimeConfig().public.gtag?.id

  /*
   * Без счётчика отправлять некуда — и это не оборонительная проверка ради
   * проверки: на превью `NUXT_PUBLIC_GTAG_ID` не задан НАМЕРЕННО, чтобы
   * тестовый трафик не пачкал статистику. Значит и метрики с превью слать
   * нельзя: они смешались бы с боевыми и испортили медианы.
   */
  if (!gtagId)
    return

  whenIdle(async () => {
    try {
      // Импорт отдельной строкой, а не деструктуризацией прямо из `await
      // import(...)`: линтер в многострочной форме дописывает висячую запятую,
      // а `import('x',)` разбирается не всеми парсерами.
      const vitals = await import('web-vitals/attribution')
      const { onCLS, onFCP, onINP, onLCP, onTTFB } = vitals

      const { gtag } = useGtag()

      const send = (metric: any) => {
        const a = metric.attribution ?? {}

        /*
         * `value` в GA4 — целое число. У CLS значение в долях единицы, и без
         * умножения все отчёты показывали бы ноль. Множитель 1000 —
         * общепринятый: 0.15 уходит как 150.
         */
        const value = Math.round(
          UNITLESS.has(metric.name) ? metric.delta * 1000 : metric.delta,
        )

        /*
         * Виновник сдвига или задержки. Поле у каждой метрики своё, общего
         * названия нет. Режем до 100 знаков — предел значения параметра GA4,
         * и селектор длиннее там всё равно обрежется молча.
         */
        const target
          = a.largestShiftTarget // CLS
            ?? a.interactionTarget // INP
            ?? a.target // LCP
            ?? undefined

        gtag('event', metric.name, {
          value,
          metric_id: metric.id,
          metric_value: metric.value,
          metric_delta: metric.delta,
          metric_rating: metric.rating,
          metric_navigation_type: metric.navigationType,
          ...(target && { metric_target: String(target).slice(0, 100) }),
          ...(a.interactionType && { metric_interaction: a.interactionType }),
          // Путь без query: фильтры и utm-метки раздробили бы выборку так,
          // что медиану по странице стало бы не посчитать.
          metric_path: window.location.pathname.slice(0, 100),
        })
      }

      onLCP(send)
      onCLS(send)
      onINP(send)
      onFCP(send)
      onTTFB(send)
    }
    catch (error) {
      // Метрики — не функциональность сайта. Если чанк не доехал, посетитель
      // не должен об этом узнать.
      console.error('web-vitals не загрузились:', error)
    }
  })
})
