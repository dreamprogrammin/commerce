<script setup lang="ts">
import type { Database } from '@/types/supabase'
import { Gift, Link2, Package, Search } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const supabase = useSupabaseClient<Database>()

// Состояние
const searchEmail = ref('')
const isSearching = ref(false)
const isLinking = ref(false)
const foundOrders = ref<any[]>([])
const showDialog = ref(false)

// Поиск заказов по email
async function searchOrders() {
  if (!searchEmail.value.trim()) {
    toast.error('Введите email')
    return
  }

  isSearching.value = true
  foundOrders.value = []

  try {
    const { data, error } = await supabase
      .rpc('find_guest_orders_by_email', {
        p_email: searchEmail.value.trim(),
      })

    if (error)
      throw error

    if (!data || data.length === 0) {
      toast.info('Заказы не найдены', {
        description: `По адресу ${searchEmail.value} не найдено неоплаченных заказов`,
      })
      return
    }

    foundOrders.value = data
    toast.success(`Найдено заказов: ${data.length}`)
  }
  catch (error: any) {
    console.error('Search error:', error)
    toast.error('Ошибка поиска', {
      description: error.message,
    })
  }
  finally {
    isSearching.value = false
  }
}

// Привязка заказов к текущему пользователю
async function linkOrders() {
  if (!searchEmail.value.trim())
    return

  isLinking.value = true

  try {
    const { data, error } = await supabase
      .rpc('link_guest_orders_to_user', {
        p_email: searchEmail.value.trim(),
      })

    if (error)
      throw error

    if (data && data.length > 0) {
      const result = data[0]

      toast.success('Заказы успешно привязаны! 🎉', {
        description: `Привязано: ${result.linked_orders} заказов. Начислено: ${result.total_bonuses_awarded} бонусов`,
        duration: 8000,
      })

      // Очищаем результаты и закрываем диалог
      foundOrders.value = []
      searchEmail.value = ''
      showDialog.value = false

      // Перезагружаем профиль для обновления бонусов
      await refreshNuxtData('profile')
    }
  }
  catch (error: any) {
    console.error('Link error:', error)
    toast.error('Ошибка привязки заказов', {
      description: error.message,
    })
  }
  finally {
    isLinking.value = false
  }
}

// Форматирование даты
function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
</script>

<template>
  <div>
    <!-- Кнопка открытия диалога -->
    <Button variant="outline" @click="showDialog = true">
      <Link2 class="w-4 h-4 mr-2" />
      Привязать старые заказы
    </Button>

    <!-- Диалоговое окно -->
    <Dialog v-model:open="showDialog">
      <DialogContent class="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <Package class="w-5 h-5" />
            Привязка гостевых заказов
          </DialogTitle>
          <DialogDescription>
            Если вы ранее делали заказы на другой email, вы можете привязать их к вашему аккаунту
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-6 py-4">
          <!-- Форма поиска -->
          <div class="space-y-2">
            <Label for="search-email">Email, с которым вы делали заказы</Label>
            <div class="flex gap-2">
              <Input
                id="search-email"
                v-model="searchEmail"
                type="email"
                placeholder="example@mail.com"
                class="flex-1"
                @keyup.enter="searchOrders"
              />
              <Button
                type="button"
                :disabled="isSearching || !searchEmail.trim()"
                @click="searchOrders"
              >
                <Search class="w-4 h-4 mr-2" />
                {{ isSearching ? 'Ищем...' : 'Найти' }}
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              Введите email, который использовали при оформлении заказа как гость
            </p>
          </div>

          <!-- Результаты поиска -->
          <div v-if="foundOrders.length > 0" class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">
                Найдено заказов: {{ foundOrders.length }}
              </h3>
            </div>

            <!-- Список заказов -->
            <div class="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              <Card v-for="order in foundOrders" :key="order.order_id" class="p-4">
                <div class="space-y-2">
                  <div class="flex justify-between items-start">
                    <div>
                      <p class="font-medium">
                        {{ order.guest_name }}
                      </p>
                      <p class="text-sm text-muted-foreground">
                        {{ order.guest_email }}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {{ order.items_count }} товар(а)
                    </Badge>
                  </div>

                  <div class="flex justify-between items-center text-sm">
                    <span class="text-muted-foreground">{{ formatDate(order.created_at) }}</span>
                    <div class="flex items-center gap-4">
                      <span class="font-semibold">{{ order.total_amount }} ₸</span>
                      <div v-if="order.bonuses_awarded > 0" class="flex items-center gap-1 text-primary">
                        <Gift class="w-4 h-4" />
                        <span class="font-medium">+{{ order.bonuses_awarded }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            <!-- Информация о бонусах -->
            <Alert v-if="foundOrders.some(o => o.bonuses_awarded > 0)">
              <Gift class="h-4 w-4" />
              <AlertTitle>Бонусы за заказы</AlertTitle>
              <AlertDescription>
                Вам будет начислено
                <span class="font-bold text-primary">
                  {{ foundOrders.reduce((sum, o) => sum + (o.bonuses_awarded || 0), 0) }} бонусов
                </span>
                в отложенный баланс. Они станут доступны через 14 дней.
              </AlertDescription>
            </Alert>
          </div>

          <!-- Пустое состояние -->
          <div
            v-else-if="!isSearching && searchEmail"
            class="text-center py-8 text-muted-foreground"
          >
            <Package class="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Заказы не найдены</p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            @click="showDialog = false"
          >
            Отмена
          </Button>
          <Button
            v-if="foundOrders.length > 0"
            :disabled="isLinking"
            @click="linkOrders"
          >
            <Link2 class="w-4 h-4 mr-2" />
            {{ isLinking ? 'Привязываем...' : `Привязать ${foundOrders.length} заказов` }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
