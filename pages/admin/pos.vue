<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import type { OfflineSaleResult, PosProduct } from '@/stores/adminStore/adminPosStore'
import { useAdminPosStore } from '@/stores/adminStore/adminPosStore'

definePageMeta({
  layout: 'admin',
})

const store = useAdminPosStore()
const {
  searchQuery,
  searchResults,
  isSearching,
  cart,
  phoneQuery,
  customer,
  isLookingUpCustomer,
  paymentMethod,
  bonusesToSpend,
  isProcessing,
  cartTotal,
  cartBonusAward,
  maxBonusesToSpend,
  finalTotal,
} = storeToRefs(store)

// Дебаунс поиска товаров
const debouncedSearch = useDebounceFn((q: string) => {
  store.searchProducts(q)
}, 350)

watch(searchQuery, (q) => {
  debouncedSearch(q)
})

// Дебаунс поиска клиента
const debouncedLookup = useDebounceFn((phone: string) => {
  store.lookupCustomer(phone)
}, 600)

watch(phoneQuery, (phone) => {
  if (phone.length >= 11) {
    debouncedLookup(phone)
  }
  else if (!phone) {
    store.clearCustomer()
  }
})

// Диалог успешной продажи
const saleResult = ref<OfflineSaleResult | null>(null)
const showReceiptDialog = ref(false)

async function handleCompleteSale() {
  const result = await store.completeSale()
  if (result) {
    saleResult.value = result
    showReceiptDialog.value = true
  }
}

function formatPrice(price: number) {
  return new Intl.NumberFormat('ru-RU').format(price) + ' ₸'
}

function getImageUrl(product: PosProduct): string | null {
  return product.image_url
    ? useSupabaseClient().storage.from('product-images').getPublicUrl(product.image_url).data.publicUrl
    : null
}
</script>

<template>
  <div class="flex h-[calc(100vh-4rem)] overflow-hidden">
    <!-- ==============================
         ЛЕВАЯ ПАНЕЛЬ: Поиск товаров
    ============================== -->
    <div class="flex w-[58%] flex-col border-r bg-background">
      <!-- Поиск -->
      <div class="border-b p-4">
        <div class="relative">
          <Icon
            name="lucide:search"
            class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            v-model="searchQuery"
            placeholder="Поиск по названию или штрихкоду..."
            class="pl-9"
            autofocus
          />
          <Icon
            v-if="isSearching"
            name="lucide:loader-2"
            class="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
          />
        </div>
      </div>

      <!-- Результаты поиска -->
      <div class="flex-1 overflow-y-auto p-4">
        <!-- Пустое состояние -->
        <div
          v-if="!searchQuery"
          class="flex h-full flex-col items-center justify-center text-muted-foreground"
        >
          <Icon name="lucide:scan-barcode" class="mb-3 h-12 w-12 opacity-30" />
          <p class="text-sm">Введите название товара или отсканируйте штрихкод</p>
        </div>

        <div
          v-else-if="searchResults.length === 0 && !isSearching"
          class="flex h-full flex-col items-center justify-center text-muted-foreground"
        >
          <Icon name="lucide:package-x" class="mb-3 h-12 w-12 opacity-30" />
          <p class="text-sm">Товары не найдены</p>
        </div>

        <!-- Сетка товаров -->
        <div
          v-else
          class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4"
        >
          <button
            v-for="product in searchResults"
            :key="product.id"
            class="flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-all hover:border-primary hover:shadow-md active:scale-[0.98]"
            @click="store.addToCart(product)"
          >
            <!-- Изображение -->
            <div class="relative aspect-square w-full bg-muted">
              <img
                v-if="getImageUrl(product)"
                :src="getImageUrl(product)!"
                :alt="product.name"
                class="h-full w-full object-cover"
              />
              <div
                v-else
                class="flex h-full items-center justify-center"
              >
                <Icon name="lucide:image" class="h-8 w-8 text-muted-foreground/30" />
              </div>
              <!-- Остаток -->
              <Badge
                :variant="product.stock_quantity <= 3 ? 'destructive' : 'secondary'"
                class="absolute right-1 top-1 text-xs"
              >
                {{ product.stock_quantity }} шт.
              </Badge>
            </div>

            <!-- Информация -->
            <div class="flex flex-1 flex-col p-2">
              <p class="line-clamp-2 text-xs font-medium leading-tight">
                {{ product.name }}
              </p>
              <div class="mt-auto pt-1">
                <p class="text-sm font-bold text-primary">
                  {{ formatPrice(product.price) }}
                </p>
                <p
                  v-if="product.bonus_points_award > 0"
                  class="text-xs text-amber-500"
                >
                  +{{ product.bonus_points_award }} бонусов
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- ==============================
         ПРАВАЯ ПАНЕЛЬ: Корзина + Чекаут
    ============================== -->
    <div class="flex w-[42%] flex-col bg-background">
      <!-- Корзина -->
      <div class="flex flex-1 flex-col overflow-hidden">
        <div class="flex items-center justify-between border-b px-4 py-3">
          <h2 class="font-semibold">
            Корзина
            <span v-if="cart.length" class="ml-1 text-muted-foreground">({{ cart.length }})</span>
          </h2>
          <Button
            v-if="cart.length"
            variant="ghost"
            size="sm"
            class="text-destructive hover:text-destructive"
            @click="store.clearCart()"
          >
            <Icon name="lucide:trash-2" class="mr-1 h-4 w-4" />
            Очистить
          </Button>
        </div>

        <!-- Пустая корзина -->
        <div
          v-if="cart.length === 0"
          class="flex flex-1 flex-col items-center justify-center text-muted-foreground"
        >
          <Icon name="lucide:shopping-cart" class="mb-3 h-10 w-10 opacity-30" />
          <p class="text-sm">Добавьте товары из списка слева</p>
        </div>

        <!-- Позиции корзины -->
        <div v-else class="flex-1 overflow-y-auto">
          <div
            v-for="item in cart"
            :key="item.product.id"
            class="flex items-center gap-3 border-b px-4 py-3"
          >
            <!-- Миниатюра -->
            <div class="h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
              <img
                v-if="getImageUrl(item.product)"
                :src="getImageUrl(item.product)!"
                :alt="item.product.name"
                class="h-full w-full object-cover"
              />
              <div v-else class="flex h-full items-center justify-center">
                <Icon name="lucide:image" class="h-4 w-4 text-muted-foreground/30" />
              </div>
            </div>

            <!-- Название и цена -->
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ item.product.name }}</p>
              <p class="text-xs text-muted-foreground">
                {{ formatPrice(item.product.price) }} / шт.
              </p>
            </div>

            <!-- Управление количеством -->
            <div class="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                class="h-7 w-7"
                @click="store.updateQuantity(item.product.id, item.quantity - 1)"
              >
                <Icon name="lucide:minus" class="h-3 w-3" />
              </Button>
              <span class="w-8 text-center text-sm font-medium">{{ item.quantity }}</span>
              <Button
                variant="outline"
                size="icon"
                class="h-7 w-7"
                @click="store.updateQuantity(item.product.id, item.quantity + 1)"
              >
                <Icon name="lucide:plus" class="h-3 w-3" />
              </Button>
            </div>

            <!-- Сумма строки -->
            <div class="w-20 text-right">
              <p class="text-sm font-semibold">
                {{ formatPrice(item.product.price * item.quantity) }}
              </p>
            </div>

            <!-- Удалить -->
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7 text-muted-foreground hover:text-destructive"
              @click="store.removeFromCart(item.product.id)"
            >
              <Icon name="lucide:x" class="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <!-- Нижняя панель: Клиент + Оплата + Итог -->
      <div class="shrink-0 border-t bg-muted/30 p-4 space-y-4">

        <!-- Поиск клиента -->
        <div class="space-y-2">
          <label class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Клиент (необязательно)
          </label>

          <div
            v-if="customer"
            class="flex items-center justify-between rounded-lg border bg-background px-3 py-2"
          >
            <div>
              <p class="text-sm font-medium">{{ store.getCustomerName(customer) }}</p>
              <p class="text-xs text-muted-foreground">
                Бонусы: <span class="font-medium text-amber-500">{{ customer.active_bonus_balance }}</span>
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7 text-muted-foreground"
              @click="store.clearCustomer()"
            >
              <Icon name="lucide:x" class="h-4 w-4" />
            </Button>
          </div>

          <div v-else class="relative">
            <Icon
              name="lucide:user-search"
              class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              v-model="phoneQuery"
              placeholder="+7 (700) 000-00-00"
              class="pl-9"
            />
            <Icon
              v-if="isLookingUpCustomer"
              name="lucide:loader-2"
              class="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          </div>
        </div>

        <!-- Списание бонусов (только если клиент найден) -->
        <div
          v-if="customer && customer.active_bonus_balance > 0 && cart.length > 0"
          class="space-y-1"
        >
          <label class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Списать бонусы (макс. {{ maxBonusesToSpend }})
          </label>
          <div class="flex gap-2">
            <Input
              v-model.number="bonusesToSpend"
              type="number"
              :min="0"
              :max="maxBonusesToSpend"
              class="h-8 text-sm"
            />
            <Button
              variant="outline"
              size="sm"
              class="shrink-0"
              @click="bonusesToSpend = maxBonusesToSpend"
            >
              Все
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="shrink-0"
              @click="bonusesToSpend = 0"
            >
              Сброс
            </Button>
          </div>
        </div>

        <!-- Способ оплаты -->
        <div class="space-y-1">
          <label class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Способ оплаты
          </label>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="method in [
                { value: 'cash', label: 'Наличные', icon: 'lucide:banknote' },
                { value: 'card', label: 'Карта', icon: 'lucide:credit-card' },
                { value: 'transfer', label: 'Перевод', icon: 'lucide:smartphone' },
              ]"
              :key="method.value"
              class="flex flex-col items-center gap-1 rounded-lg border py-2 text-xs font-medium transition-colors"
              :class="paymentMethod === method.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'bg-background text-muted-foreground hover:border-primary/50'"
              @click="paymentMethod = method.value as 'cash' | 'card' | 'transfer'"
            >
              <Icon :name="method.icon" class="h-4 w-4" />
              {{ method.label }}
            </button>
          </div>
        </div>

        <!-- Итог -->
        <div class="space-y-1 rounded-lg border bg-background p-3 text-sm">
          <div class="flex justify-between text-muted-foreground">
            <span>Сумма</span>
            <span>{{ formatPrice(cartTotal) }}</span>
          </div>
          <div
            v-if="bonusesToSpend > 0"
            class="flex justify-between text-amber-600"
          >
            <span>Бонусами</span>
            <span>- {{ formatPrice(bonusesToSpend) }}</span>
          </div>
          <div class="flex justify-between border-t pt-1 font-bold">
            <span>Итого</span>
            <span class="text-primary">{{ formatPrice(finalTotal) }}</span>
          </div>
          <div
            v-if="cart.length && cartBonusAward > 0"
            class="flex justify-between text-xs text-amber-500"
          >
            <span>Начислится бонусов (через 14 дней)</span>
            <span>+{{ cartBonusAward }}</span>
          </div>
        </div>

        <!-- Кнопка оформления -->
        <Button
          class="w-full"
          size="lg"
          :disabled="cart.length === 0 || isProcessing"
          @click="handleCompleteSale"
        >
          <Icon
            v-if="isProcessing"
            name="lucide:loader-2"
            class="mr-2 h-4 w-4 animate-spin"
          />
          <Icon
            v-else
            name="lucide:check-circle"
            class="mr-2 h-4 w-4"
          />
          Оформить продажу
        </Button>
      </div>
    </div>
  </div>

  <!-- ==============================
       Диалог: Чек после продажи
  ============================== -->
  <Dialog v-model:open="showReceiptDialog">
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2 text-green-600">
          <Icon name="lucide:check-circle-2" class="h-5 w-5" />
          Продажа оформлена!
        </DialogTitle>
      </DialogHeader>

      <div v-if="saleResult" class="space-y-3 py-2">
        <div class="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
          <div class="flex justify-between">
            <span class="text-muted-foreground">Сумма</span>
            <span>{{ formatPrice(saleResult.total) }}</span>
          </div>
          <div
            v-if="saleResult.discount > 0"
            class="flex justify-between text-amber-600"
          >
            <span>Списано бонусов</span>
            <span>- {{ formatPrice(saleResult.discount) }}</span>
          </div>
          <div class="flex justify-between border-t pt-1 font-bold">
            <span>Оплачено</span>
            <span>{{ formatPrice(saleResult.final) }}</span>
          </div>
          <div
            v-if="saleResult.bonuses_awarded > 0"
            class="flex justify-between text-xs text-amber-500"
          >
            <span>Начислится бонусов (через 14 дней)</span>
            <span>+{{ saleResult.bonuses_awarded }}</span>
          </div>
        </div>

        <p class="text-center text-xs text-muted-foreground">
          №&nbsp;{{ saleResult.order_id.split('-')[0].toUpperCase() }}
        </p>
      </div>

      <DialogFooter>
        <Button class="w-full" @click="showReceiptDialog = false">
          Новая продажа
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
