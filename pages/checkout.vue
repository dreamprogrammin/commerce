<script setup lang="ts">
import { Star } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { useAuthStore } from '@/stores/auth'
import { useProfileStore } from '@/stores/core/profileStore'
import { useCartStore } from '@/stores/publicStore/cartStore'

const authStore = useAuthStore()
const cartStore = useCartStore()
const profileStore = useProfileStore()

const { user, isLoggedIn } = storeToRefs(authStore)
const { bonusBalance } = storeToRefs(profileStore)
const {
  subtotal,
  discountAmount,
  total,
  items,
  isProcessing,
  bonusesToSpend,
  bonusesToAward,
} = storeToRefs(cartStore)

const orderForm = ref({
  name: '',
  phone: '',
  email: '',
  deliveryMethod: 'pickup' as 'pickup' | 'courier',
  paymentMethod: 'kaspi',
  address: {
    city: 'Алматы',
    line1: '',
  },
})
const bonusesInput = ref(0)
const showGuestModal = ref(false)

// Предзаполнение формы
watch(
  () => profileStore.profile,
  (newProfile) => {
    if (newProfile) {
      orderForm.value.name = `${newProfile.first_name || ''} ${newProfile.last_name || ''}`.trim()
      orderForm.value.phone = newProfile.phone || ''
    }
    if (user.value) {
      orderForm.value.email = user.value.email || ''
    }
  },
  { immediate: true },
)

// Модалка для гостей (один раз за сессию)
const hasSeenModalKey = 'guest_bonus_modal_seen'

onMounted(() => {
  const hasSeenModal = sessionStorage.getItem(hasSeenModalKey)

  if (!isLoggedIn.value && items.value.length > 0 && !hasSeenModal) {
    setTimeout(() => {
      showGuestModal.value = true
      sessionStorage.setItem(hasSeenModalKey, 'true')
    }, 800)
  }
})

function applyBonuses() {
  if (bonusesInput.value > bonusBalance.value) {
    toast.error('Недостаточно бонусов', {
      description: `У вас доступно только ${bonusBalance.value} бонусов`,
    })
    bonusesInput.value = bonusBalance.value
    return
  }

  cartStore.setBonusesToSpend(bonusesInput.value)
  bonusesInput.value = bonusesToSpend.value

  if (bonusesToSpend.value > 0) {
    toast.success(`${bonusesToSpend.value} бонусов применено!`, {
      description: `Скидка: ${bonusesToSpend.value} ₸`,
    })
  }
}

async function placeOrder() {
  // Валидация
  if (!orderForm.value.name.trim() || !orderForm.value.email.trim() || !orderForm.value.phone.trim()) {
    toast.error('Заполните все обязательные поля')
    return
  }

  // Для гостей обязательны данные
  const guestInfo = !isLoggedIn.value
    ? {
        name: orderForm.value.name.trim(),
        email: orderForm.value.email.trim(),
        phone: orderForm.value.phone.trim(),
      }
    : undefined

  await cartStore.checkout({
    deliveryMethod: orderForm.value.deliveryMethod,
    paymentMethod: orderForm.value.paymentMethod,
    deliveryAddress: orderForm.value.deliveryMethod === 'courier'
      ? {
          line1: orderForm.value.address.line1,
          city: orderForm.value.address.city,
        }
      : undefined,
    guestInfo,
  })
}
</script>

<template>
  <div class="container py-12">
    <!-- Модалка для гостей -->
    <GuestBonusModal v-model:open="showGuestModal" />

    <!-- Корзина пуста -->
    <div
      v-if="items.length === 0"
      class="text-center text-muted-foreground py-20 border-2 border-dashed rounded-lg flex flex-col items-center gap-4"
    >
      <h1 class="text-3xl font-bold mb-4">
        Ваша корзина пуста
      </h1>
      <NuxtLink to="/catalog">
        <Button class="mt-4" size="lg">
          Начать покупки
        </Button>
      </NuxtLink>
    </div>

    <!-- Есть товары в корзине -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
      <!-- Левая колонка: Форма -->
      <div class="lg:col-span-2 space-y-8">
        <!-- Блок 1: Контактная информация -->
        <Card>
          <CardHeader>
            <CardTitle>1. Контактная информация</CardTitle>
            <CardDescription v-if="!isLoggedIn">
              <button
                type="button"
                class="font-semibold text-primary hover:underline"
                @click="showGuestModal = true"
              >
                Зарегистрируйтесь
              </button>
               получите 1000 бонусов после подтверждения первого заказа! 🎁
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label for="name">Имя и Фамилия *</Label>
                <Input
                  id="name"
                  v-model="orderForm.name"
                  required
                  autocomplete="name"
                  placeholder="Иван Иванов"
                />
              </div>
              <div>
                <Label for="phone">Телефон *</Label>
                <Input
                  id="phone"
                  v-model="orderForm.phone"
                  required
                  autocomplete="tel"
                  placeholder="+7 (777) 123-45-67"
                />
              </div>
            </div>
            <div>
              <Label for="email">Email *</Label>
              <Input
                id="email"
                v-model="orderForm.email"
                type="email"
                required
                autocomplete="email"
                placeholder="example@mail.com"
              />
            </div>
          </CardContent>
        </Card>

        <!-- Блок 2: Доставка -->
        <Card>
          <CardHeader>
            <CardTitle>2. Доставка и оплата</CardTitle>
          </CardHeader>
          <CardContent class="space-y-6">
            <div>
              <Label>Способ доставки</Label>
              <RadioGroup v-model="orderForm.deliveryMethod" class="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <RadioGroupItem id="pickup" value="pickup" class="peer sr-only" />
                  <Label
                    for="pickup"
                    class="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <span class="text-sm font-medium">Самовывоз</span>
                    <span class="text-xs text-muted-foreground mt-1">Бесплатно</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem id="courier" value="courier" class="peer sr-only" />
                  <Label
                    for="courier"
                    class="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <span class="text-sm font-medium">Яндекс.Курьер</span>
                    <span class="text-xs text-muted-foreground mt-1">От 500 ₸</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <!-- Адрес для курьера -->
            <div v-if="orderForm.deliveryMethod === 'courier'" class="space-y-4 animate-in fade-in">
              <div>
                <Label for="city">Город *</Label>
                <Input id="city" v-model="orderForm.address.city" required />
              </div>
              <div>
                <Label for="address">Улица, дом, квартира *</Label>
                <Input
                  id="address"
                  v-model="orderForm.address.line1"
                  required
                  placeholder="ул. Пушкина, д. 1, кв. 1"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Блок 3: Бонусы (только для авторизованных) -->
        <Card v-if="isLoggedIn && bonusBalance > 0">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Star class="w-5 h-5 text-primary fill-primary" />
              Применить бонусы
            </CardTitle>
            <CardDescription>
              У вас <span class="font-bold text-primary">{{ bonusBalance }}</span> активных бонусов (1 бонус = 1 ₸ скидки)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div class="flex items-center gap-4">
              <Input
                id="bonuses"
                v-model.number="bonusesInput"
                type="number"
                placeholder="Сколько списать?"
                :max="bonusBalance"
                min="0"
                class="flex-1"
              />
              <Button type="button" variant="outline" @click="applyBonuses">
                Применить
              </Button>
            </div>
            <div class="text-xs text-muted-foreground mt-2 space-y-1">
              <p>Максимум можно списать: {{ bonusBalance }} бонусов</p>
              <p class="text-[11px]">
                💡 Бонусы начисляются при подтверждении заказа и активируются через 7 дней
              </p>
            </div>
          </CardContent>
        </Card>

        <!-- Кнопка оформления -->
        <Button
          type="button"
          size="lg"
          class="w-full text-lg"
          :disabled="isProcessing"
          @click="placeOrder"
        >
          <span v-if="isProcessing">Оформляем заказ...</span>
          <span v-else>Подтвердить заказ на {{ total.toFixed(0) }} ₸</span>
        </Button>
      </div>

      <!-- Правая колонка: Состав заказа -->
      <aside class="col-span-1 lg:sticky top-24">
        <Card>
          <CardHeader>
            <CardTitle>Ваш заказ</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4 text-sm">
            <!-- Товары -->
            <div v-for="item in items" :key="item.product.id" class="flex justify-between items-start">
              <span class="pr-2">{{ item.product.name }} × {{ item.quantity }}</span>
              <span class="font-semibold whitespace-nowrap">
                {{ (Number(item.product.price) * item.quantity).toFixed(0) }} ₸
              </span>
            </div>

            <!-- Разделитель -->
            <div class="pt-4 border-t space-y-2">
              <div class="flex justify-between">
                <span>Сумма:</span>
                <span>{{ subtotal.toFixed(0) }} ₸</span>
              </div>

              <!-- Скидка -->
              <div v-if="discountAmount > 0" class="flex justify-between text-primary font-medium">
                <span>Скидка бонусами:</span>
                <span>-{{ discountAmount.toFixed(0) }} ₸</span>
              </div>

              <!-- Будущие бонусы (только для авторизованных) -->
              <div v-if="isLoggedIn && bonusesToAward > 0" class="flex justify-between text-xs text-muted-foreground">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger class="flex items-center gap-1 cursor-help">
                      <Star class="w-3 h-3" />
                      Вы получите (через 7 дней):
                    </TooltipTrigger>
                    <TooltipContent class="max-w-xs">
                      <p class="text-xs">
                        Бонусы будут начислены после подтверждения заказа администратором и активируются через 7 дней
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span>+{{ bonusesToAward }} бонусов</span>
              </div>
            </div>
          </CardContent>

          <!-- Итого -->
          <CardFooter class="pt-4 border-t flex justify-between font-bold text-lg">
            <span>Итого к оплате:</span>
            <span>{{ total.toFixed(0) }} ₸</span>
          </CardFooter>
        </Card>
      </aside>
    </div>
  </div>
</template>
