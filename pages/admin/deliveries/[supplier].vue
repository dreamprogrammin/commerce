<script setup lang="ts">
import type { DeliveriesData } from '@/utils/supplierOrders'
import { ArrowLeft, Phone, RefreshCw } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import SupplierOrders from '@/components/admin/deliveries/SupplierOrders.vue'
import { adminFetch } from '@/utils/adminFetch'

definePageMeta({ layout: 'admin' })

/*
 * Поставки одного поставщика (27 ноября 2026) — сюда ведёт список
 * «Поставок» и календарь. Владелец 26.11: «если товаров от разных
 * поставщиков много, мы должны перейти к поставщику, который доставляет нам
 * товар». Заказы, дата по календарю, сверка и приёмка — SupplierOrders.
 */
const route = useRoute()
const supplierId = computed(() => String(route.params.supplier ?? ''))

const data = ref<DeliveriesData | null>(null)
const isLoading = ref(true)
let loaded = false

async function load() {
  isLoading.value = true
  try {
    data.value = await adminFetch<DeliveriesData>('/api/admin/deliveries')
    loaded = true
  }
  catch (error: any) {
    toast.error('Не удалось загрузить поставки', { description: error.data?.message || error.message })
  }
  finally {
    isLoading.value = false
  }
}
onMounted(load)
onActivated(() => {
  if (loaded && !isLoading.value)
    load()
})
// Та же страница, другой поставщик (keepalive держит компонент) — перечитать
watch(supplierId, () => {
  if (loaded)
    load()
})

const supplier = computed(() => data.value?.suppliers.find(s => s.id === supplierId.value) ?? null)
const known = computed(() => Boolean(supplier.value) || Boolean(data.value?.orders.some(o => o.supplierId === supplierId.value)))
</script>

<template>
  <div class="container mx-auto space-y-6 p-4 md:p-8" data-testid="deliveries-supplier-page" :data-supplier="supplierId">
    <div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div class="space-y-1">
        <NuxtLink to="/admin/deliveries" class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="deliveries-back">
          <ArrowLeft class="h-4 w-4" />
          Все поставки
        </NuxtLink>
        <h1 class="text-2xl font-bold tracking-tight md:text-3xl" data-testid="supplier-title">
          {{ supplier?.name ?? (isLoading ? 'Поставки' : 'Поставщик') }}
        </h1>
        <a v-if="supplier?.phone" :href="`tel:${supplier.phone}`" class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Phone class="h-3.5 w-3.5" />
          {{ supplier.phone }}
        </a>
      </div>
      <Button variant="outline" size="sm" :disabled="isLoading" @click="load">
        <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': isLoading }" />
        Обновить
      </Button>
    </div>

    <div v-if="isLoading && !data" class="space-y-3">
      <Skeleton v-for="i in 3" :key="i" class="h-28 w-full rounded-xl" />
    </div>
    <p v-else-if="data && !known" class="text-sm text-muted-foreground" data-testid="supplier-unknown">
      Такого поставщика нет. <NuxtLink to="/admin/deliveries" class="underline">
        Все поставки
      </NuxtLink>
    </p>
    <SupplierOrders v-else-if="data" :data="data" :supplier-id="supplierId" :reload="load" />
  </div>
</template>
