<script setup lang="ts">
import type { ReceiveLineState, ReceiveOrderData } from '@/utils/receiveScan'
import type { ReceiveResult, SupplierOrderLine } from '@/utils/supplierOrders'
import { Camera, CameraOff, Check, Flashlight, FlashlightOff, Minus, PackageCheck, Plus, RotateCcw } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useBarcodeCamera, useScanFeedback } from '@/composables/admin/useBarcodeCamera'
import { useReceiveSubmit } from '@/composables/admin/useReceiveSubmit'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { adminFetch } from '@/utils/adminFetch'
import { validGtin } from '@/utils/gtin'
import { createScanGate, lineForScan, readReceiveDraft, receiveDraftKey, receiveLineCheck, receiveTotals, sameScanCode, scanCode } from '@/utils/receiveScan'
import { plural } from '@/utils/restockOrder'
import { orderSummary, receiveMoney, receivePlan, remaining } from '@/utils/supplierOrders'

/*
 * Приёмка по факту (27.11.2026). Владелец: «я же не буду бегать с товарами к
 * ноутбуку… я должен принимать товар по факту, а не по списку». Телефон в
 * руке, камера на коробку: каждая коробка — +1 к своей строке заказа, счёт
 * начинается с нуля, а не с заказанного. Внизу — сколько посчитано и чего не
 * хватает; «Принять» уходит в ту же приёмку, что и окно в «Поставках»
 * (composables/admin/useReceiveSubmit.ts).
 *
 *   • код незнаком — «Чей это товар?»: строка заказа, код запоминается у
 *     товара (POST /api/admin/products/[id]/barcode), и дальше такие коробки
 *     считаются сканом;
 *   • код другого товара — «его нет в заказе», не считается;
 *   • без камеры — поле «Штрихкод или артикул» (и сканер-клавиатура: печать
 *     в пустоту попадает в поле, как на кассе), у строки — «+» и число;
 *   • счёт сохраняется в телефоне на каждом касании: перезагрузка, звонок или
 *     свёрнутое приложение его не теряют (utils/receiveScan.ts);
 *   • по заказу приняли где-то ещё (окном «Принять» на ноутбуке), пока шёл
 *     счёт, — счёт сбрасывается с объяснением: «Принять» с него прибавило бы
 *     остаток второй раз. Перед «Принять» заказ перечитывается.
 */

definePageMeta({ layout: 'admin' })
useHead({ title: 'Приёмка по факту' })

// Снимком: экземпляр страницы обслуживает один заказ, а route у удержанной страницы живой
const orderId = String(useRoute().params.order ?? '')

const { getVariantUrl } = useSupabaseStorage()
const { receive } = useReceiveSubmit()
const { unlock, signal } = useScanFeedback()

type Line = SupplierOrderLine & { productId: string }

const data = ref<ReceiveOrderData | null>(null)
const isLoading = ref(true)
const loadError = ref<string | null>(null)
/** Посчитано сейчас: productId → штук; нулей нет */
const counts = ref<Record<string, number>>({})
const restoredAt = ref<string | null>(null)
const result = ref<ReceiveResult | null>(null)
/** Сколько штук по заказу было принято, когда начали этот счёт; нет счёта — null */
const countBase = ref<number | null>(null)
/** Счёт сброшен: по заказу приняли где-то ещё, пока шёл счёт */
const staleNotice = ref(false)

/** Последний скан — плашка над строками */
interface LastScan {
  kind: 'counted' | 'over' | 'other' | 'unknown'
  text: string
  code: string | null
  productId: string | null
}
const lastScan = ref<LastScan | null>(null)
/** «Тот же товар ещё в кадре» — помнится и через выключение камеры, и через перезагрузку */
const gate = createScanGate()

const order = computed(() => data.value?.order ?? null)
const products = computed(() => data.value?.products ?? {})
/** Строки, которые можно принять; у удалённого товара строки нет — принять его нельзя */
const lines = computed(() => (order.value?.lines ?? []).filter((l): l is Line => Boolean(l.productId)))
const goneLines = computed(() => (order.value?.lines ?? []).filter(l => !l.productId))
const productMap = computed(() => new Map(Object.entries(products.value)))
const isOpen = computed(() => order.value?.status === 'ordered' || order.value?.status === 'in_transit')
const closedText = computed(() => {
  const o = order.value
  if (!o)
    return ''
  if (o.status === 'draft')
    return `Заказ №${o.number} ещё не отправлен поставщику — принимать нечего. Сначала «Заказано» в поставках.`
  if (o.status === 'cancelled')
    return `Заказ №${o.number} отменён.`
  return `Заказ №${o.number} уже принят и закрыт.`
})
const supplierLink = computed(() => order.value ? `/admin/deliveries/${order.value.supplierId}` : '/admin/deliveries')
const receivedNow = computed(() => order.value ? orderSummary(order.value).receivedUnits : 0)

// --- Счёт в телефоне ---
const draftKey = receiveDraftKey(orderId)
function saveDraft() {
  try {
    if (Object.keys(counts.value).length && countBase.value !== null)
      localStorage.setItem(draftKey, JSON.stringify({ counts: counts.value, savedAt: new Date().toISOString(), base: countBase.value, held: gate.present(performance.now()) }))
    else
      localStorage.removeItem(draftKey)
  }
  catch {
    // Хранилище закрыто (приватный режим) — счёт живёт, пока открыта страница
  }
}
function clearDraft() {
  try {
    localStorage.removeItem(draftKey)
  }
  catch {
    // нечего чистить
  }
}
function restoreDraft() {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(draftKey)
  }
  catch {
    raw = null
  }
  const draft = readReceiveDraft(raw, lines.value.map(l => l.productId))
  if (!draft)
    return
  if (draft.base !== receivedNow.value) {
    // Пока телефон лежал, заказ приняли окном на ноутбуке — этот счёт уже учтён
    clearDraft()
    staleNotice.value = true
    return
  }
  counts.value = draft.counts
  countBase.value = draft.base
  restoredAt.value = draft.savedAt
  // Коробка, что стояла перед камерой до перезагрузки, — та же штука
  gate.hold(draft.held, performance.now())
}
/** Счёт — в ноль; stale — потому что по заказу приняли где-то ещё */
function dropCount(stale: boolean) {
  counts.value = {}
  countBase.value = null
  clearDraft()
  restoredAt.value = null
  staleNotice.value = stale
  // «Пазл: 1 из 4» над обнулённым счётом сбивал бы с толку
  lastScan.value = null
}

/** false — заказ не загрузился */
async function load(isReturn: boolean): Promise<boolean> {
  isLoading.value = true
  try {
    data.value = await adminFetch<ReceiveOrderData>(`/api/admin/deliveries/${orderId}/receive`)
    loadError.value = null
    if (!isOpen.value) {
      // Заказ закрыли (хотя бы окном «Принять» на ноутбуке) — сохранённый счёт ни к чему
      if (!result.value)
        dropCount(false)
    }
    else if (!isReturn) {
      restoreDraft()
    }
    else if (countBase.value !== null && countBase.value !== receivedNow.value) {
      dropCount(true)
    }
    else {
      // Пока страница стояла в фоне, строку могли убрать из заказа
      const ids = new Set(lines.value.map(l => l.productId))
      counts.value = Object.fromEntries(Object.entries(counts.value).filter(([id]) => ids.has(id)))
      if (!Object.keys(counts.value).length)
        countBase.value = null
      saveDraft()
    }
    return true
  }
  catch (error: any) {
    const message = error.data?.message || error.message
    if (data.value)
      toast.error('Не удалось обновить заказ', { description: message })
    else
      loadError.value = message
    return false
  }
  finally {
    isLoading.value = false
  }
}
useRefreshOnReturn(async (isReturn) => {
  await load(isReturn)
})

// --- Счёт ---
function setCount(productId: string, value: number) {
  const n = Math.min(Math.max(Math.trunc(Number.isFinite(value) ? value : 0), 0), 9999)
  const next = { ...counts.value }
  if (n > 0)
    next[productId] = n
  else
    delete next[productId]
  counts.value = next
  // Отметка «сколько было принято» — с первой штуки счёта
  countBase.value = Object.keys(next).length ? (countBase.value ?? receivedNow.value) : null
  if (countBase.value !== null)
    staleNotice.value = false
  saveDraft()
}
function onCountInput(productId: string, event: Event) {
  const input = event.target as HTMLInputElement
  setCount(productId, Number.parseInt(input.value, 10))
  input.value = String(counts.value[productId] ?? 0)
}

function countLine(line: Line, code: string | null) {
  setCount(line.productId, (counts.value[line.productId] ?? 0) + 1)
  const counted = counts.value[line.productId] ?? 0
  const expected = remaining(line)
  const over = counted > expected
  lastScan.value = {
    kind: over ? 'over' : 'counted',
    productId: line.productId,
    code,
    text: over
      ? `${line.name}: ${counted} шт. — сверх заказа на ${counted - expected}`
      : `${line.name}: ${counted} из ${expected}`,
  }
  signal(over ? 'warn' : 'ok')
}
function plusOne(line: Line) {
  unlock()
  countLine(line, null)
}

/** Код с камеры или из поля: +1 строке, «нет в заказе» или «чей это товар?» */
function handleCode(raw: string, source: 'camera' | 'input') {
  const code = scanCode(raw)
  const current = order.value
  if (!code || !current || !isOpen.value || result.value)
    return
  const match = lineForScan(current.lines, products.value, code)
  if (match) {
    countLine(match.line as Line, code)
    return
  }
  const other = data.value?.otherBarcodes.find(o => sameScanCode(o.barcode, code))
  if (other) {
    lastScan.value = { kind: 'other', productId: null, code, text: `«${other.name}» — этого товара нет в заказе №${current.number}` }
    signal('error')
    return
  }
  lastScan.value = { kind: 'unknown', productId: null, code, text: `Незнакомый штрихкод ${code}` }
  signal('warn')
  // Набранный руками код — вопрос сразу; с камеры — кнопкой: случайный код с соседней коробки не должен открывать окно
  if (source === 'input')
    openBind(code)
}

// --- Камера ---
const videoEl = shallowRef<HTMLVideoElement | null>(null)
const {
  state: cameraState,
  problem: cameraProblem,
  torch,
  start: startCamera,
  stop: stopCamera,
  pause: pauseCamera,
  toggleTorch,
} = useBarcodeCamera(onFrame)
const cameraOn = computed(() => cameraState.value === 'on' || cameraState.value === 'starting')

function onFrame(codes: string[]) {
  const current = order.value
  if (!current)
    return
  const now = performance.now()
  // Каждый код кадра — в отметку «ещё в кадре», даже если считать его не будем
  const fresh = new Set(codes.filter(c => gate.seen(c, now)))
  if (!fresh.size)
    return
  // На коробке бывает EAN и этикетка поставщика: есть в кадре знакомый — прочие коды той же коробки молчат
  // Один код — одна штука за кадр, даже если детектор вернул его дважды
  const known = [...new Set(codes.filter(c => lineForScan(current.lines, products.value, c)))]
  if (known.length) {
    for (const code of known) {
      if (fresh.has(code))
        handleCode(code, 'camera')
    }
    return
  }
  // Незнакомых несколько — сначала настоящий штрихкод товара (GTIN), а не служебный код
  const [first] = [...fresh].sort((a, b) => Number(Boolean(validGtin(b))) - Number(Boolean(validGtin(a))))
  if (first)
    handleCode(first, 'camera')
}

async function toggleCamera() {
  unlock()
  if (cameraOn.value) {
    stopCamera()
    return
  }
  // Отметки «ещё в кадре» не стираются: коробка, что стоит перед камерой, — та же штука
  if (videoEl.value)
    await startCamera(videoEl.value)
}

// --- Поле и сканер-клавиатура ---
const codeInput = ref('')
const codeForm = shallowRef<HTMLFormElement | null>(null)
function submitCode() {
  const code = scanCode(codeInput.value)
  codeInput.value = ''
  if (!code)
    return
  unlock()
  handleCode(code, 'input')
}

// --- «Чей это товар?» ---
const bindCode = ref<string | null>(null)
/** Строка, у товара которой уже есть другой код: ждём «Заменить» */
const bindReplace = ref<string | null>(null)
const bindBusy = ref(false)
const bindOpen = computed({
  get: () => bindCode.value !== null,
  set: (value: boolean) => {
    if (!value)
      bindCode.value = null
  },
})
function openBind(code: string) {
  bindReplace.value = null
  bindCode.value = code
}
/** Сначала товары без кода — скорее всего, коробка их */
const bindChoices = computed(() => [...lines.value].sort((a, b) =>
  Number(Boolean(products.value[a.productId]?.barcode)) - Number(Boolean(products.value[b.productId]?.barcode))))

async function bindTo(line: Line, replace = false) {
  const code = bindCode.value
  if (!code || bindBusy.value)
    return
  const current = products.value[line.productId]?.barcode
  if (current && !replace) {
    bindReplace.value = line.productId
    return
  }
  bindBusy.value = true
  try {
    const saved = await adminFetch<{ barcode: string }>(`/api/admin/products/${line.productId}/barcode`, {
      method: 'POST',
      body: { code, replace },
    })
    const product = data.value?.products[line.productId]
    if (product)
      product.barcode = saved.barcode
    bindCode.value = null
    countLine(line, code)
    toast.success('Штрихкод запомнен', { description: `${line.name} — дальше такие коробки считаются сканом` })
  }
  catch (error: any) {
    toast.error('Не удалось запомнить штрихкод', { description: error.data?.message || error.message })
  }
  finally {
    bindBusy.value = false
  }
}

// --- Итоги и «Принять» ---
const totals = computed(() => order.value ? receiveTotals(order.value, counts.value) : null)
const plan = computed(() => order.value ? receivePlan(order.value, counts.value, productMap.value) : null)
const money = computed(() => order.value ? receiveMoney(order.value, counts.value, productMap.value) : null)
/** Скрытые до приёмки новые товары, которые она покажет на сайте */
const willShow = computed(() => lines.value.filter(l =>
  l.showOnReceipt && products.value[l.productId]?.active === false && (counts.value[l.productId] ?? 0) > 0).length)
const issues = computed(() => lines.value
  .map(line => ({ line, ...receiveLineCheck(line, counts.value[line.productId] ?? 0) }))
  .filter(x => x.state !== 'ok'))
const barHint = computed(() => {
  const t = totals.value
  if (!t)
    return ''
  const parts = [
    t.shortUnits ? `не хватает ${t.shortUnits}` : '',
    t.overUnits ? `сверх заказа ${t.overUnits}` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'всё сходится с заказом'
})

const confirmOpen = ref(false)
const closeOrder = ref(false)
const saving = ref(false)
const checking = ref(false)
async function openConfirm() {
  unlock()
  if (checking.value)
    return
  checking.value = true
  try {
    // Перед «Принять» — свежий заказ: приняли где-то ещё, пока шёл счёт, — счёт сброшен, дважды не примем
    if (!await load(true) || !isOpen.value || !Object.keys(counts.value).length)
      return
    closeOrder.value = false
    confirmOpen.value = true
  }
  finally {
    checking.value = false
  }
}
async function submit() {
  const current = order.value
  if (!current || saving.value)
    return
  saving.value = true
  try {
    result.value = await receive(current, { ...counts.value }, Boolean(plan.value?.short && closeOrder.value))
    confirmOpen.value = false
    stopCamera()
    dropCount(false)
    // Принятое — в строки заказа: для «Принять ещё» ждём уже остаток
    void load(true)
  }
  catch (error: any) {
    toast.error('Не удалось принять', { description: error.data?.message || error.message })
  }
  finally {
    saving.value = false
  }
}
const againBusy = ref(false)
async function again() {
  if (againBusy.value)
    return
  againBusy.value = true
  try {
    // Сначала свежий заказ, с только что принятым: иначе первая штука нового счёта
    // возьмёт отметку «сколько принято» со старого, и пришедший следом заказ
    // сбросит этот счёт как принятый где-то ещё
    if (!await load(true))
      return
    result.value = null
  }
  finally {
    againBusy.value = false
  }
}

// --- Начать заново ---
const resetAsk = ref(false)
function reset() {
  dropCount(false)
  resetAsk.value = false
}

// Пока открыт вопрос или подтверждение — кадры не читаются, камера не гаснет
watch([bindCode, confirmOpen], ([code, confirm]) => pauseCamera(code !== null || confirm))
// Отсутствие кода копится, только пока кадры читаются: камеру выключали или открывали
// окно — коробка, оставшаяся в кадре, второй раз не посчитается
const reading = computed(() => cameraState.value === 'on' && bindCode.value === null && !confirmOpen.value)
watch(reading, (on) => {
  if (on) {
    gate.resume(performance.now())
    return
  }
  gate.pause(performance.now())
  // Что было в кадре — в счёт телефона: вкладку в фоне iPhone может выгрузить
  saveDraft()
})

// Печать «в пустоту» (фокус не в поле) — в поле кода: сканер-клавиатура не теряет коды
function onKeydown(e: KeyboardEvent) {
  if (!isOpen.value || result.value || bindCode.value !== null || confirmOpen.value)
    return
  const target = e.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable="true"]'))
    return
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)
    codeForm.value?.querySelector('input')?.focus()
}
// Удержанная страница живёт в фоне: камера и клавиши — только пока она на экране
let listening = false
function listen() {
  if (!listening) {
    window.addEventListener('keydown', onKeydown)
    listening = true
  }
}
function unlisten() {
  if (listening) {
    window.removeEventListener('keydown', onKeydown)
    listening = false
  }
}
onMounted(listen)
onActivated(listen)
onDeactivated(() => {
  stopCamera()
  unlisten()
})
onBeforeUnmount(unlisten)

// --- Вид ---
function photoOf(productId: string): string | null {
  const imageUrl = products.value[productId]?.imageUrl
  return imageUrl ? getVariantUrl(BUCKET_NAME_PRODUCT, imageUrl, 'sm') || null : null
}
function skuOf(line: Line): string | null {
  return products.value[line.productId]?.sku ?? line.sku ?? null
}
function orderedText(line: Line): string {
  return line.received ? `заказано ${line.quantity}, принято раньше ${line.received}` : `заказано ${line.quantity}`
}
function stateOf(line: Line): ReceiveLineState {
  return receiveLineCheck(line, counts.value[line.productId] ?? 0).state
}
function stateText(line: Line): string {
  const counted = counts.value[line.productId] ?? 0
  const { state, diff } = receiveLineCheck(line, counted)
  if (state === 'ok')
    return remaining(line) === 0 && counted === 0 ? 'принято раньше' : 'сходится'
  if (state === 'none')
    return `ждём ${diff}`
  if (state === 'short')
    return `не хватает ${diff}`
  return `сверх заказа ${diff}`
}
const STATE_CLASS: Record<ReceiveLineState, string> = {
  none: 'text-muted-foreground',
  short: 'text-amber-700 dark:text-amber-400',
  ok: 'text-emerald-700 dark:text-emerald-400',
  over: 'text-orange-700 dark:text-orange-400',
}
const LAST_CLASS: Record<LastScan['kind'], string> = {
  counted: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100',
  over: 'border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-100',
  other: 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100',
  unknown: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
}
function moment(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}
const tenge = (n: number) => `${new Intl.NumberFormat('ru-RU').format(Math.round(n))}\u00A0₸`
</script>

<template>
  <div class="container mx-auto max-w-3xl space-y-4 p-4 pb-28 md:p-8 md:pb-28" data-testid="receive-page" :data-order="orderId">
    <div class="space-y-1">
      <h1 class="text-2xl font-bold tracking-tight md:text-3xl">
        Приёмка по факту
      </h1>
      <p v-if="order" class="text-sm text-muted-foreground" data-testid="receive-subtitle">
        Заказ №{{ order.number }}<template v-if="data?.supplier">
          · {{ data.supplier.name }}
        </template><template v-if="isOpen && totals && !result">
          · ждём {{ totals.expected }} шт. по {{ lines.length }} {{ plural(lines.length, 'позиции', 'позициям', 'позициям') }}
        </template>
      </p>
    </div>

    <div v-if="isLoading && !data" class="space-y-3">
      <Skeleton class="h-24 w-full rounded-xl" />
      <Skeleton class="h-20 w-full rounded-xl" />
      <Skeleton class="h-20 w-full rounded-xl" />
    </div>

    <div v-else-if="loadError" class="space-y-3 rounded-xl border bg-card p-4 text-sm" data-testid="receive-error">
      <p>{{ loadError }}</p>
      <Button variant="outline" size="sm" as-child>
        <NuxtLink to="/admin/deliveries">
          К поставкам
        </NuxtLink>
      </Button>
    </div>

    <template v-else-if="order">
      <div v-if="result" class="space-y-3 rounded-xl border bg-card p-4" data-testid="receive-result" :data-status="result.status">
        <div class="flex items-center gap-2 text-lg font-semibold">
          <Check class="h-5 w-5 text-emerald-600" />
          Принято {{ result.units }} шт.
        </div>
        <p class="text-sm text-muted-foreground">
          {{ result.status === 'received' ? `Заказ №${order.number} закрыт.` : `Заказ №${order.number} открыт — ждём остальное.` }}
        </p>
        <div class="flex flex-wrap gap-2">
          <Button as-child>
            <NuxtLink :to="supplierLink" data-testid="receive-to-supplier">
              К поставкам
            </NuxtLink>
          </Button>
          <Button v-if="result.status !== 'received' && isOpen" variant="outline" :disabled="againBusy" data-testid="receive-again" @click="again">
            {{ againBusy ? 'Обновляю заказ…' : 'Принять ещё' }}
          </Button>
        </div>
      </div>

      <div v-else-if="!isOpen" class="space-y-3 rounded-xl border bg-card p-4 text-sm" data-testid="receive-closed">
        <p>{{ closedText }}</p>
        <Button variant="outline" size="sm" as-child>
          <NuxtLink :to="supplierLink">
            К поставкам
          </NuxtLink>
        </Button>
      </div>

      <template v-else>
        <section class="overflow-hidden rounded-xl border bg-card" data-testid="receive-camera-panel">
          <div v-show="cameraOn" class="relative bg-black">
            <video
              ref="videoEl"
              class="aspect-[4/3] max-h-[45vh] w-full object-cover"
              playsinline
              muted
              autoplay
              data-testid="receive-video"
            />
            <div class="pointer-events-none absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
            <div v-if="cameraState === 'starting'" class="absolute inset-0 grid place-items-center text-sm text-white/90">
              Включаю камеру…
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2 p-3">
            <Button :variant="cameraOn ? 'outline' : 'default'" data-testid="receive-camera" :data-state="cameraState" @click="toggleCamera">
              <CameraOff v-if="cameraOn" class="mr-1.5 h-4 w-4" />
              <Camera v-else class="mr-1.5 h-4 w-4" />
              {{ cameraOn ? 'Выключить' : 'Камера' }}
            </Button>
            <Button
              v-if="torch.available"
              variant="outline"
              size="icon"
              :aria-label="torch.on ? 'Выключить фонарик' : 'Фонарик'"
              data-testid="receive-torch"
              @click="toggleTorch"
            >
              <FlashlightOff v-if="torch.on" class="h-4 w-4" />
              <Flashlight v-else class="h-4 w-4" />
            </Button>
            <form ref="codeForm" class="flex min-w-0 flex-1 basis-56 gap-2" @submit.prevent="submitCode">
              <Input
                v-model="codeInput"
                placeholder="Штрихкод или артикул"
                aria-label="Штрихкод или артикул"
                autocomplete="off"
                enterkeyhint="done"
                class="min-w-0"
                data-testid="receive-code"
              />
              <Button type="submit" variant="outline" :disabled="!codeInput.trim()" data-testid="receive-code-submit">
                Найти
              </Button>
            </form>
          </div>
          <p v-if="cameraProblem" class="px-3 pb-3 text-sm text-destructive" data-testid="receive-camera-problem">
            {{ cameraProblem }}
          </p>
        </section>

        <div
          v-if="lastScan"
          class="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
          :class="LAST_CLASS[lastScan.kind]"
          :data-kind="lastScan.kind"
          data-testid="receive-last"
          aria-live="polite"
        >
          <img v-if="lastScan.productId && photoOf(lastScan.productId)" :src="photoOf(lastScan.productId)!" alt="" class="h-10 w-10 shrink-0 rounded object-cover">
          <span class="min-w-0 flex-1 break-words">{{ lastScan.text }}</span>
          <Button v-if="lastScan.kind === 'unknown' && lastScan.code" size="sm" data-testid="receive-last-bind" @click="openBind(lastScan.code)">
            Чей это товар?
          </Button>
        </div>

        <div
          v-if="staleNotice"
          class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
          data-testid="receive-stale"
        >
          Пока шёл счёт, по этому заказу приняли товар в другом месте — счёт начат заново, чтобы не принять дважды.
        </div>

        <div v-if="restoredAt" class="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground" data-testid="receive-restored">
          <span class="min-w-0 flex-1">Продолжаем счёт от {{ moment(restoredAt) }} — он сохранился в этом браузере.</span>
        </div>

        <p v-if="!lines.length" class="text-sm text-muted-foreground">
          В заказе нет товаров, которые можно принять.
        </p>
        <ul v-else class="space-y-2" data-testid="receive-lines">
          <li
            v-for="line in lines"
            :key="line.productId"
            class="rounded-xl border bg-card p-3 transition-shadow"
            :class="lastScan?.productId === line.productId ? 'ring-2 ring-primary' : ''"
            :data-product="line.productId"
            :data-state="stateOf(line)"
            data-testid="receive-scan-line"
          >
            <div class="flex gap-3">
              <img v-if="photoOf(line.productId)" :src="photoOf(line.productId)!" alt="" class="h-14 w-14 shrink-0 rounded-md object-cover" loading="lazy">
              <div v-else class="h-14 w-14 shrink-0 rounded-md bg-muted" />
              <div class="min-w-0 flex-1">
                <div class="line-clamp-2 break-words text-sm font-medium">
                  {{ line.name }}
                </div>
                <div class="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  <span v-if="skuOf(line)" class="break-all">арт. {{ skuOf(line) }}</span>
                  <span v-if="products[line.productId]?.barcode" class="break-all tabular-nums" data-testid="receive-line-barcode">
                    {{ products[line.productId]!.barcode }}
                  </span>
                  <span v-else>без штрихкода</span>
                </div>
                <div class="mt-0.5 text-xs text-muted-foreground">
                  {{ orderedText(line) }}
                </div>
              </div>
            </div>
            <div class="mt-2 flex items-center justify-between gap-2">
              <span class="text-sm font-medium" :class="STATE_CLASS[stateOf(line)]" data-testid="receive-line-state">
                {{ stateText(line) }}
              </span>
              <div class="flex shrink-0 items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  class="h-10 w-10"
                  :disabled="!counts[line.productId]"
                  :aria-label="`Минус один: ${line.name}`"
                  data-testid="receive-minus"
                  @click="setCount(line.productId, (counts[line.productId] ?? 0) - 1)"
                >
                  <Minus class="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  inputmode="numeric"
                  min="0"
                  max="9999"
                  class="h-10 w-16 text-center tabular-nums"
                  :model-value="counts[line.productId] ?? 0"
                  :aria-label="`Посчитано: ${line.name}`"
                  data-testid="receive-count"
                  @change="(e: Event) => onCountInput(line.productId, e)"
                />
                <Button
                  variant="outline"
                  size="icon"
                  class="h-10 w-10"
                  :aria-label="`Плюс один: ${line.name}`"
                  data-testid="receive-plus"
                  @click="plusOne(line)"
                >
                  <Plus class="h-4 w-4" />
                </Button>
              </div>
            </div>
          </li>
        </ul>

        <p v-if="goneLines.length" class="text-sm text-muted-foreground">
          Товар удалён — его не принять: {{ goneLines.map(l => `${l.name} (${l.quantity} шт.)`).join(', ') }}.
        </p>
      </template>
    </template>

    <!-- Над нижним меню админки на телефоне; fixed, а не sticky: main админки — свой прокручиваемый блок -->
    <div
      v-if="order && isOpen && !result && totals"
      class="fixed inset-x-0 bottom-16 z-40 border-t bg-background/95 backdrop-blur md:bottom-0 md:left-[272px]"
      data-testid="receive-bar"
    >
      <div class="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
        <div class="min-w-0 flex-1 text-sm" data-testid="receive-totals">
          <div class="font-medium tabular-nums">
            Посчитано {{ totals.counted }} из {{ totals.expected }} шт.
          </div>
          <div class="truncate text-xs text-muted-foreground">
            {{ barHint }}
          </div>
        </div>
        <template v-if="totals.counted">
          <template v-if="resetAsk">
            <Button variant="destructive" size="sm" data-testid="receive-reset-yes" @click="reset">
              Сбросить
            </Button>
            <Button variant="ghost" size="sm" @click="resetAsk = false">
              Нет
            </Button>
          </template>
          <Button v-else variant="ghost" size="icon" aria-label="Начать заново" data-testid="receive-reset" @click="resetAsk = true">
            <RotateCcw class="h-4 w-4" />
          </Button>
        </template>
        <Button v-if="!resetAsk" :disabled="!totals.counted || checking" data-testid="receive-open-confirm" @click="openConfirm">
          <PackageCheck class="mr-1.5 h-4 w-4" />
          Принять
        </Button>
      </div>
    </div>

    <!-- Окно, а не нижняя шторка: у шторки проекта подложка белая и закрывает строки заказа -->
    <Dialog v-model:open="bindOpen">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>Чей это штрихкод?</DialogTitle>
          <DialogDescription>
            <span class="break-all tabular-nums">{{ bindCode }}</span> — выберите товар из заказа. Код запомнится, и дальше такие коробки будут считаться сканом.
          </DialogDescription>
        </DialogHeader>
        <ul class="max-h-[50vh] divide-y overflow-y-auto" data-testid="receive-bind">
          <li v-for="line in bindChoices" :key="line.productId">
            <button
              type="button"
              class="flex w-full items-center gap-3 py-2 text-left disabled:opacity-50"
              :disabled="bindBusy"
              :data-product="line.productId"
              data-testid="receive-bind-line"
              @click="bindTo(line)"
            >
              <img v-if="photoOf(line.productId)" :src="photoOf(line.productId)!" alt="" class="h-10 w-10 shrink-0 rounded object-cover" loading="lazy">
              <div v-else class="h-10 w-10 shrink-0 rounded bg-muted" />
              <span class="min-w-0 flex-1">
                <span class="line-clamp-2 break-words text-sm">{{ line.name }}</span>
                <span class="block text-xs text-muted-foreground">
                  ждём {{ remaining(line) }}<template v-if="products[line.productId]?.barcode">
                    · уже есть код {{ products[line.productId]!.barcode }}
                  </template>
                </span>
              </span>
            </button>
            <div v-if="bindReplace === line.productId" class="mb-2 space-y-2 rounded-md bg-muted p-2 text-sm" data-testid="receive-bind-replace">
              <p class="break-words">
                У товара уже есть штрихкод {{ products[line.productId]?.barcode }}. Заменить на {{ bindCode }}?
              </p>
              <div class="flex gap-2">
                <Button size="sm" :disabled="bindBusy" data-testid="receive-bind-replace-yes" @click="bindTo(line, true)">
                  Заменить
                </Button>
                <Button size="sm" variant="outline" @click="bindReplace = null">
                  Нет
                </Button>
              </div>
            </div>
          </li>
        </ul>
        <DialogFooter>
          <Button variant="outline" data-testid="receive-bind-skip" @click="bindCode = null">
            Товара нет в заказе — пропустить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="confirmOpen">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>Принять {{ totals?.counted }} шт.?</DialogTitle>
          <DialogDescription>
            Заказ №{{ order?.number }}. Остаток товара на сайте увеличится на посчитанное.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-3" data-testid="receive-confirm">
          <div v-if="issues.length" class="max-h-[40vh] divide-y overflow-y-auto rounded-md border">
            <div
              v-for="x in issues"
              :key="x.line.productId"
              class="flex items-start justify-between gap-3 px-3 py-2 text-sm"
              :data-state="x.state"
              data-testid="receive-confirm-issue"
            >
              <span class="min-w-0 break-words">{{ x.line.name }}</span>
              <span class="shrink-0 tabular-nums" :class="STATE_CLASS[x.state]">
                {{ x.state === 'over' ? `+${x.diff} сверх заказа` : x.state === 'none' ? `не пришло ${x.diff}` : `не хватает ${x.diff}` }}
              </span>
            </div>
          </div>
          <p v-else class="text-sm text-emerald-700 dark:text-emerald-400" data-testid="receive-confirm-match">
            Всё сходится с заказом.
          </p>
          <label v-if="plan?.short" class="flex items-start gap-2 text-sm">
            <Checkbox v-model="closeOrder" class="mt-0.5" data-testid="receive-confirm-close" />
            <span>
              Остального не будет — закрыть заказ
              <span class="block text-xs text-muted-foreground">Иначе заказ останется «В пути», а недостающее будем ждать.</span>
            </span>
          </label>
          <p class="text-sm" data-testid="receive-confirm-summary">
            <template v-if="money && plan?.units">
              На <span class="font-medium tabular-nums">{{ tenge(money.cost) }}</span> по закупке, в продаже <span class="font-medium tabular-nums">{{ tenge(money.sale) }}</span>.
            </template><template v-if="plan?.notified">
              «Товар снова в наличии» сразу уйдёт <span class="font-medium tabular-nums">{{ plan.notified }}</span>
              {{ plural(plan.notified, 'покупателю', 'покупателям', 'покупателям') }}.
            </template><template v-if="willShow">
              На сайте {{ plural(willShow, 'появится', 'появятся', 'появятся') }} <span class="font-medium tabular-nums">{{ willShow }}</span>
              {{ plural(willShow, 'новый товар', 'новых товара', 'новых товаров') }}.
            </template>
          </p>
        </div>
        <DialogFooter class="gap-2">
          <Button variant="outline" @click="confirmOpen = false">
            Вернуться к счёту
          </Button>
          <Button :disabled="saving || !totals?.counted" data-testid="receive-confirm-submit" @click="submit">
            {{ saving ? 'Принимаю…' : `Принять ${totals?.counted ?? 0} шт.` }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
