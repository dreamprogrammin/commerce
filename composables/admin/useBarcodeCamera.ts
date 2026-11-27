import type { BarcodeDetector } from 'barcode-detector/ponyfill'
import { useEventListener } from '@vueuse/core'

/**
 * Камера телефона — сканер штрихкодов экрана «Приёмка по факту»
 * (27.11.2026, владелец выбрал камеру, а не покупку сканера или ТСД).
 *
 * Распознаёт ZXing на WebAssembly (barcode-detector/ponyfill) — одинаково
 * на iPhone, где своего BarcodeDetector у Safari нет, и на Android: что
 * проверено стражем в Chromium, то и работает у человека. Файл распознавателя
 * (~0,9 МБ) отдаёт сам сайт, а не jsDelivr, и грузится только по «Камера».
 *
 * Кадр уходит в распознавание раз в SCAN_EVERY_MS; все коды кадра — разом в
 * onFrame: на коробке бывает EAN-13 и этикетка поставщика, и выбрать
 * знакомый может только страница. Пока камера работает, экран не гаснет
 * (Wake Lock). Страница обязана звать stop() в onDeactivated: админка держит
 * страницы живыми, и без этого камера светила бы на чужой странице.
 */

/** EAN/UPC — розница, Code 128/39 и ITF — этикетки поставщиков и коробов, QR — на всякий случай */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'] as const
/** Чаще — телефон греется и садится, реже — приходится держать коробку */
const SCAN_EVERY_MS = 120

export type CameraState = 'off' | 'starting' | 'on' | 'error'

let detectorPromise: Promise<BarcodeDetector> | null = null

function loadDetector(): Promise<BarcodeDetector> {
  detectorPromise ??= (async () => {
    const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
      import('barcode-detector/ponyfill'),
      import('zxing-wasm/reader/zxing_reader.wasm?url'),
    ])
    await prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => path.endsWith('.wasm') ? wasmUrl : prefix + path },
      fireImmediately: true,
    })
    return new BarcodeDetector({ formats: [...FORMATS] })
  })().catch((error) => {
    // Не загрузился — следующая «Камера» попробует снова
    detectorPromise = null
    throw error
  })
  return detectorPromise
}

function cameraProblem(error: unknown): string {
  const name = (error as { name?: string } | null)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Камера не разрешена. Разрешите её этому сайту в настройках браузера и нажмите «Камера» ещё раз. Уже разрешали — обновите страницу.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'Камера не найдена'
  if (name === 'NotReadableError' || name === 'AbortError')
    return 'Камера занята другим приложением — закройте его и нажмите «Камера» ещё раз'
  if (name === 'NotSupported' || name === 'NotSupportedError')
    return 'Этот браузер не даёт камеру странице — откройте админку в Safari или Chrome'
  return `Камера не включилась: ${(error as Error | null)?.message || name || 'неизвестная ошибка'}`
}

export function useBarcodeCamera(onFrame: (codes: string[]) => void) {
  const state = ref<CameraState>('off')
  const problem = ref<string | null>(null)
  const torch = reactive({ available: false, on: false })

  let stream: MediaStream | null = null
  let video: HTMLVideoElement | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let wakeLock: WakeLockSentinel | null = null
  let paused = false
  // Номер запуска: остановка и повторный запуск отменяют прежний на любом await
  let run = 0

  function release() {
    if (timer)
      clearTimeout(timer)
    timer = null
    stream?.getTracks().forEach(t => t.stop())
    stream = null
    if (video)
      video.srcObject = null
    video = null
    torch.available = false
    torch.on = false
    void wakeLock?.release().catch(() => {})
    wakeLock = null
  }

  function tick(my: number, detector: BarcodeDetector) {
    timer = setTimeout(async () => {
      if (my !== run)
        return
      if (!paused && video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        try {
          const found = await detector.detect(video)
          if (my !== run)
            return
          const codes = found.map(b => b.rawValue).filter(Boolean)
          if (codes.length)
            onFrame(codes)
        }
        catch {
          // Кадр не прочитался — следующий
        }
      }
      tick(my, detector)
    }, SCAN_EVERY_MS)
  }

  async function start(el: HTMLVideoElement) {
    const my = ++run
    release()
    state.value = 'starting'
    problem.value = null
    paused = false
    let phase: 'camera' | 'detector' = 'camera'
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Object.assign(new Error('нет getUserMedia'), { name: 'NotSupported' })
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      if (my !== run) {
        media.getTracks().forEach(t => t.stop())
        return
      }
      stream = media
      video = el
      el.srcObject = media
      await el.play()
      phase = 'detector'
      const detector = await loadDetector()
      if (my !== run)
        return
      const caps = (media.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean }
      torch.available = Boolean(caps.torch)
      state.value = 'on'
      tick(my, detector)
      // Экран не гаснет, пока камера работает. Не ждём: счёт не должен зависеть от того, дал ли браузер блокировку
      navigator.wakeLock?.request('screen').then((lock) => {
        if (my === run)
          wakeLock = lock
        else
          void lock.release().catch(() => {})
      }).catch(() => {})
    }
    catch (error) {
      if (my !== run)
        return
      release()
      state.value = 'error'
      problem.value = phase === 'detector'
        ? 'Не загрузился распознаватель штрихкодов — проверьте интернет и нажмите «Камера» ещё раз'
        : cameraProblem(error)
    }
  }

  function stop() {
    run++
    release()
    state.value = 'off'
    problem.value = null
  }

  /** Пока открыт вопрос «чей это код?» — кадры не читаются, но камера не гаснет */
  function pause(value: boolean) {
    paused = value
  }

  async function toggleTorch() {
    const track = stream?.getVideoTracks()[0]
    if (!track || !torch.available)
      return
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch.on } as MediaTrackConstraintSet] })
      torch.on = !torch.on
    }
    catch {
      torch.available = false
    }
  }

  // Свернули приложение — камера гаснет (iPhone гасит её и сам); включают снова кнопкой.
  // Только в браузере: страница рисуется и на сервере, а document там нет
  if (import.meta.client) {
    useEventListener(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden' && state.value !== 'off' && state.value !== 'error')
        stop()
    })
  }
  onScopeDispose(stop)

  return { state, problem, torch, start, stop, pause, toggleTorch }
}

let audio: AudioContext | null = null

/**
 * Звук и вибрация на каждый скан: глядеть на экран при счёте некогда.
 * unlock() — из нажатия кнопки: iPhone даёт звук только после касания.
 */
export function useScanFeedback() {
  function unlock() {
    try {
      audio ??= new AudioContext()
      if (audio.state === 'suspended')
        void audio.resume()
    }
    catch {
      audio = null
    }
  }

  function signal(kind: 'ok' | 'warn' | 'error') {
    try {
      if (audio && audio.state === 'running') {
        const osc = audio.createOscillator()
        const gain = audio.createGain()
        const now = audio.currentTime
        const length = kind === 'ok' ? 0.12 : 0.3
        osc.frequency.value = kind === 'ok' ? 1046 : kind === 'warn' ? 660 : 330
        gain.gain.setValueAtTime(0.0001, now)
        gain.gain.exponentialRampToValueAtTime(0.25, now + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + length)
        osc.connect(gain).connect(audio.destination)
        osc.start(now)
        osc.stop(now + length + 0.02)
      }
    }
    catch {
      // Без звука — не беда, есть экран
    }
    navigator.vibrate?.(kind === 'ok' ? 40 : [80, 60, 80])
  }

  return { unlock, signal }
}
