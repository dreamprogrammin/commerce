<script setup lang="ts">
import { Bell, BellOff } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { useStockAlertsStore } from '@/stores/publicStore/stockAlertsStore'

const props = withDefaults(defineProps<{
  productId: string
  size?: 'sm' | 'lg'
}>(), {
  size: 'lg'
})

const stockAlertsStore = useStockAlertsStore()
const { isLoading } = storeToRefs(stockAlertsStore)

const subscribed = computed(() => stockAlertsStore.isSubscribed(props.productId))

onMounted(() => {
  stockAlertsStore.fetchSubscriptions()
})
</script>

<template>
  <Button
    :size="size === 'sm' ? 'default' : 'lg'"
    :variant="subscribed ? 'outline' : 'default'"
    :class="size === 'sm' ? 'w-full h-10' : 'w-full h-12'"
    :disabled="isLoading"
    @click="stockAlertsStore.toggleAlert(productId)"
  >
    <component :is="subscribed ? BellOff : Bell" :class="size === 'sm' ? 'w-4 h-4 mr-2' : 'w-5 h-5 mr-2'" />
    <span v-if="size === 'sm'">{{ subscribed ? 'Отменить' : 'Сообщить' }}</span>
    <span v-else>{{ subscribed ? 'Отменить уведомление' : 'Сообщить о поступлении' }}</span>
  </Button>
</template>
