import { toast } from 'vue-sonner'

/**
 * Полоса времени жизни тоста рисуется на CSS, а её длительность знает только
 * вызывающая сторона: у одних тостов 4 секунды по умолчанию, у телеграм-плашек
 * десять. Библиотека нигде не выставляет длительность в разметку, поэтому она
 * дописывается сюда — переменной `--uh-toast-life` в инлайновый стиль тоста.
 *
 * Патчится сам объект `toast`, а не каждый вызов: его импортируют 76 файлов,
 * и обойти их обёрткой было бы несоразмерно правке. Патч ставится один раз при
 * старте клиента и ничего не меняет в поведении — только добавляет стиль.
 */

/** Совпадает с `duration` у Toaster в app.vue. */
const DEFAULT_DURATION_MS = 4000

const PATCHED = ['success', 'error', 'info', 'warning', 'message', 'loading', 'custom'] as const

type ToastOptions = Record<string, any> | undefined

function withLife(options: ToastOptions) {
  const duration = (options?.duration ?? DEFAULT_DURATION_MS) as number
  const forever = !Number.isFinite(duration) || duration <= 0

  return {
    ...options,
    // Бесконечный тост закрывают руками — отмерять нечего.
    class: [options?.class, forever ? 'uh-toast--nobar' : null].filter(Boolean).join(' ') || undefined,
    style: {
      '--uh-toast-life': `${duration}ms`,
      ...options?.style,
    },
  }
}

export default defineNuxtPlugin(() => {
  for (const name of PATCHED) {
    const original = (toast as any)[name]
    if (typeof original !== 'function') {
      continue
    }

    ;(toast as any)[name] = (message: any, options?: ToastOptions) =>
      original(message, withLife(options))
  }
})
