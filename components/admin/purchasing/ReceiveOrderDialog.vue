<script setup lang="ts">
import type { ReceiveProduct, ReceiveResult, SupplierOrder, SupplierOrderLine } from '@/utils/supplierOrders'
import { toast } from 'vue-sonner'
import { useReceiveSubmit } from '@/composables/admin/useReceiveSubmit'
import { plural } from '@/utils/restockOrder'
import { receiveDefaults, receiveMoney, receivePlan, remaining, salePriceOf } from '@/utils/supplierOrders'

/*
 * Приёмка заказа поставщику — «Принять» (31.10.2026, «К закупке»), с
 * 26.11.2026 и в «Поставках»: одно окно на обе страницы. Сколько пришло по
 * каждой строке; по умолчанию — всё, что ждём. Пришедшее прибавляется к
 * остатку, ждавшие получают «Товар снова в наличии», новый товар, скрытый
 * до приёмки, появляется на сайте. Под строкой — сверка, как в SAP-портале:
 * сойдётся ли строка после этой приёмки.
 */
const props = defineProps<{
  order: SupplierOrder | null
  products: Map<string, ReceiveProduct>
}>()

const emit = defineEmits<{
  (e: 'update:order', order: SupplierOrder | null): void
  (e: 'received', result: ReceiveResult): void
}>()

const { receive } = useReceiveSubmit()

const quantities = ref<Record<string, number>>({})
const close = ref(false)
const saving = ref(false)

watch(() => props.order, (order) => {
  quantities.value = order ? receiveDefaults(order) : {}
  close.value = false
  saving.value = false
}, { immediate: true })

const open = computed({
  get: () => props.order !== null,
  set: (value: boolean) => {
    if (!value)
      emit('update:order', null)
  },
})

const preview = computed(() => props.order
  ? receivePlan(props.order, quantities.value, props.products)
  : { units: 0, notified: 0, short: false })
const sum = computed(() => props.order ? receiveMoney(props.order, quantities.value, props.products) : null)
/** Скрытые до приёмки товары, которые эта приёмка покажет на сайте */
const willShow = computed(() => props.order?.lines.filter(l => l.showOnReceipt && l.productId && (quantities.value[l.productId] ?? 0) > 0).length ?? 0)

const money = (n: number) => `${new Intl.NumberFormat('ru-RU').format(Math.round(n))}\u00A0₸`

/** Сколько человек ждут товар, которого сейчас 0, — если его принимают, им придёт уведомление. */
function waitingFor(productId: string | null): number {
  const product = productId ? props.products.get(productId) : undefined
  if (!productId || !product || product.stock !== 0 || !((quantities.value[productId] ?? 0) > 0))
    return 0
  return product.alerts
}

/** Сверка строки после этой приёмки: сойдётся, не хватит или лишнее */
function afterCheck(line: SupplierOrderLine): { kind: 'ok' | 'short' | 'over', text: string } {
  const after = line.received + (line.productId ? quantities.value[line.productId] ?? 0 : 0)
  if (after === line.quantity)
    return { kind: 'ok', text: 'сойдётся с заказом' }
  if (after < line.quantity)
    return { kind: 'short', text: `не хватит ${line.quantity - after} шт.` }
  return { kind: 'over', text: `лишних ${after - line.quantity} шт.` }
}

function onQuantity(productId: string, event: Event) {
  const input = event.target as HTMLInputElement
  const value = Number.parseInt(input.value, 10)
  quantities.value = { ...quantities.value, [productId]: Number.isNaN(value) ? 0 : Math.min(Math.max(value, 0), 9999) }
  input.value = String(quantities.value[productId])
}

async function submit() {
  const order = props.order
  if (!order)
    return
  saving.value = true
  try {
    const result = await receive(order, quantities.value, preview.value.short && close.value)
    emit('update:order', null)
    emit('received', result)
  }
  catch (error: any) {
    toast.error('Не удалось принять', { description: error.data?.message || error.message })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle>Приёмка — заказ №{{ order?.number }}</DialogTitle>
        <DialogDescription>
          Сколько пришло сейчас. Остаток товара увеличится на эти штуки.
        </DialogDescription>
      </DialogHeader>
      <form v-if="order" class="space-y-4" data-testid="receive-dialog" @submit.prevent="submit">
        <div class="max-h-[50vh] overflow-y-auto divide-y">
          <div
            v-for="(line, i) in order.lines"
            :key="line.productId ?? `d${i}`"
            class="flex items-center justify-between gap-3 py-2"
            data-testid="receive-line"
          >
            <div class="min-w-0 text-sm">
              <div class="font-medium line-clamp-2">
                {{ line.name }}
              </div>
              <div class="text-xs text-muted-foreground">
                <span class="tabular-nums" data-testid="receive-line-prices">закупка {{ line.costPrice != null ? money(line.costPrice) : '—' }} · продажа {{ salePriceOf(line, products) != null ? money(salePriceOf(line, products)!) : '—' }}</span>
                <br>
                заказано {{ line.quantity }}<template v-if="line.received">
                  , принято {{ line.received }}
                </template><template v-if="line.productId && products.get(line.productId)">
                  · на складе {{ products.get(line.productId)?.stock }}
                </template>
              </div>
              <div v-if="!line.productId" class="text-xs text-muted-foreground">
                товар удалён — принять нельзя
              </div>
              <template v-else>
                <div
                  v-if="remaining(line) || (quantities[line.productId] ?? 0) > 0"
                  class="text-xs"
                  :class="{
                    'text-emerald-700 dark:text-emerald-400': afterCheck(line).kind === 'ok',
                    'text-amber-700 dark:text-amber-400': afterCheck(line).kind === 'short',
                    'text-sky-700 dark:text-sky-400': afterCheck(line).kind === 'over',
                  }"
                  :data-check="afterCheck(line).kind"
                  data-testid="receive-check"
                >
                  после приёмки: {{ afterCheck(line).text }}
                </div>
                <div v-else class="text-xs text-muted-foreground">
                  пришло всё
                </div>
                <div v-if="line.showOnReceipt" class="text-xs text-muted-foreground" data-testid="receive-shows">
                  скрыт с сайта — {{ (quantities[line.productId] ?? 0) > 0 ? 'после приёмки появится на сайте' : 'появится, когда придёт' }}
                </div>
                <div v-if="waitingFor(line.productId)" class="text-xs text-amber-700 dark:text-amber-400" data-testid="receive-waiting">
                  {{ plural(waitingFor(line.productId), 'ждёт', 'ждут', 'ждут') }} {{ waitingFor(line.productId) }} — {{ plural(waitingFor(line.productId), 'получит', 'получат', 'получат') }} «Товар снова в наличии»
                </div>
              </template>
            </div>
            <Input
              v-if="line.productId"
              type="number"
              inputmode="numeric"
              min="0"
              max="9999"
              class="h-9 w-20 shrink-0 text-center tabular-nums"
              :model-value="quantities[line.productId] ?? 0"
              :aria-label="`Пришло: ${line.name}`"
              data-testid="receive-qty"
              @change="(e: Event) => onQuantity(line.productId!, e)"
            />
          </div>
        </div>
        <label v-if="preview.short" class="flex items-start gap-2 text-sm">
          <Checkbox v-model="close" class="mt-0.5" data-testid="receive-close" />
          <span>
            Остального не будет — закрыть заказ
            <span class="block text-xs text-muted-foreground">Иначе заказ останется «В пути», а недостающее — заказанным.</span>
          </span>
        </label>
        <p class="text-sm" data-testid="receive-summary">
          Будет принято <span class="font-medium tabular-nums">{{ preview.units }}</span> шт.<template v-if="sum && preview.units">
            на <span class="font-medium tabular-nums">{{ money(sum.cost) }}</span> по закупке, в продаже <span class="font-medium tabular-nums">{{ money(sum.sale) }}</span>.
          </template><template v-if="preview.notified">
            «Товар снова в наличии» сразу уйдёт <span class="font-medium tabular-nums">{{ preview.notified }}</span>
            {{ plural(preview.notified, 'покупателю', 'покупателям', 'покупателям') }}.
          </template><template v-if="willShow">
            На сайте {{ plural(willShow, 'появится', 'появятся', 'появятся') }} <span class="font-medium tabular-nums">{{ willShow }}</span>
            {{ plural(willShow, 'новый товар', 'новых товара', 'новых товаров') }}.
          </template>
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">
            Отмена
          </Button>
          <Button
            type="submit"
            :disabled="saving || (!preview.units && !(preview.short && close))"
            data-testid="receive-submit"
          >
            {{ saving ? 'Принимаю…' : 'Принять' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
