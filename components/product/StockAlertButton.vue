<script setup lang="ts">
import { Bell, BellOff } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { useStockAlertsStore } from '@/stores/publicStore/stockAlertsStore'

const props = defineProps<{
  productId: string
}>()

const stockAlertsStore = useStockAlertsStore()
const { isLoading } = storeToRefs(stockAlertsStore)

const subscribed = computed(() => stockAlertsStore.isSubscribed(props.productId))

onMounted(() => {
  stockAlertsStore.fetchSubscriptions()
})
</script>

<template>
  <Button
    size="lg"
    :variant="subscribed ? 'outline' : 'default'"
    class="w-full h-12"
    :disabled="isLoading"
    @click="stockAlertsStore.toggleAlert(productId)"
  >
    <component :is="subscribed ? BellOff : Bell" class="w-5 h-5 mr-2" />
    {{ subscribed ? 'Отменить уведомление' : 'Сообщить о поступлении' }}
  </Button>
</template>
