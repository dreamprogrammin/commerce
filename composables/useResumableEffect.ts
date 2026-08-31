/**
 * Работа, которую надо останавливать при уходе со страницы и возобновлять
 * при возврате.
 *
 * Зачем. С `keepalive: true` страница не размонтируется, поэтому `onUnmounted`
 * при переходе НЕ вызывается: таймеры и подписки продолжают работать, пока
 * человек находится совсем на другой странице. Секундный `setInterval`
 * обратного отсчёта и автопрокрутка героя тикали бы всё это время впустую —
 * это расход батареи, а у героя ещё и смена слайда за спиной у покупателя.
 *
 * Что делает. `start()` при появлении и при каждом возврате, `stop()` при
 * уходе и при окончательном размонтировании. Повторный запуск защищён
 * признаком: `onActivated` может прийти в паре с монтированием.
 */
export function useResumableEffect(start: () => void, stop: () => void) {
  let running = false

  const begin = () => {
    if (running)
      return
    running = true
    start()
  }

  const end = () => {
    if (!running)
      return
    running = false
    stop()
  }

  onMounted(begin)
  onActivated(begin)
  onDeactivated(end)
  onUnmounted(end)
}
