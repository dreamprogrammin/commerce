<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, toRaw, watch } from 'vue'
import { toast } from 'vue-sonner'

import { useAuthStore } from '@/stores/auth'
import { useProfileStore } from '@/stores/core/profileStore'
import { useCartStore } from '@/stores/publicStore/cartStore'

// --- Импорты сторов (убедись, что пути правильные) ---

// --- Инициализация ---
const authStore = useAuthStore()
const cartStore = useCartStore()
const profileStore = useProfileStore()

// --- Реактивные данные из сторов ---
const { user, isLoggedIn, isGuest } = storeToRefs(authStore)
const { bonusBalance } = storeToRefs(profileStore)
const { subtotal, discountAmount, total, items, isProcessing, bonusesToSpend } = storeToRefs(cartStore)

// --- Локальное состояние формы ---
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
const showBonusModal = ref(false)

// --- Вычисляемые свойства ---
const bonusesToAward = computed(() => {
  return items.value.reduce((sum, item) => sum + (item.product.bonus_points_award || 0) * item.quantity, 0)
})

// --- Логика ---

// Предзаполнение формы при загрузке или изменении профиля
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

// "Ловим" возвращение пользователя после OAuth для слияния аккаунтов
onMounted(() => {
  authStore.checkForUserMerge()
})

function applyBonuses() {
  cartStore.setBonusesToSpend(bonusesInput.value)
  bonusesInput.value = bonusesToSpend.value
  if (bonusesToSpend.value > 0) {
    toast.success(`${bonusesToSpend.value} бонусов применено!`)
  }
}

/**
 * Главный обработчик отправки формы.
 * Решает, нужно ли показывать модалку или сразу оформлять заказ.
 */
async function handleFormSubmit() {
  // Если пользователь уже залогинен, просто оформляем заказ
  if (isLoggedIn.value) {
    await placeOrder()
    return
  }
  // Если это гость (аноним) и ему можно начислить бонусы, показываем модалку
  if (isGuest.value && bonusesToAward.value > 0) {
    showBonusModal.value = true
  }
  else {
    // Если гость, но бонусов нет - просто оформляем
    await placeOrder()
  }
}

/**
 * Финальная функция, которая вызывает checkout в сторе.
 */
async function placeOrder() {
  showBonusModal.value = false // Закрываем модалку, если была открыта
  await cartStore.checkout({
    deliveryMethod: orderForm.value.deliveryMethod,
    paymentMethod: orderForm.value.paymentMethod,
    deliveryAddress: orderForm.value.deliveryMethod === 'courier' ? toRaw(orderForm.value.address) : undefined,
    // `guestInfo` больше не нужен, так как у нас теперь всегда есть user.id (реальный или анонимный)
  })
}

/**
 * Вызывается из модального окна для регистрации.
 */
function handleRegisterAndGetBonus() {
  showBonusModal.value = false
  authStore.signInWithOAuth('google', '/checkout') // Возвращаем пользователя обратно на эту же страницу
}
</script>

<template>
  <div class="container py-12">
    <!-- Сценарий 1: Корзина пуста -->
    <div v-if="items.length === 0" class="text-center text-muted-foreground py-20">
      <h1 class="text-3xl font-bold mb-4">
        Ваша корзина пуста
      </h1>
      <NuxtLink to="/catalog/boys">
        <Button class="mt-4">
          Начать покупки
        </Button>
      </NuxtLink>
    </div>

    <!-- Сценарий 2: В корзине есть товары -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
      <form class="lg:col-span-2 space-y-8" @submit.prevent="handleFormSubmit">
        <!-- Блок 1: Контактная информация -->
        <Card>
          <CardHeader>
            <CardTitle>1. Контактная информация</CardTitle>
            <CardDescription v-if="!isLoggedIn">
              Уже есть аккаунт?
              <button type="button" class="font-semibold text-primary hover:underline" @click="handleRegisterAndGetBonus">
                Войдите
              </button>, чтобы использовать бонусы!
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label for="name">Имя и Фамилия</Label>
                <Input id="name" v-model="orderForm.name" required />
              </div>
              <div>
                <Label for="phone">Телефон</Label>
                <Input id="phone" v-model="orderForm.phone" required />
              </div>
            </div>
            <div>
              <Label for="email">Email</Label>
              <Input id="email" v-model="orderForm.email" type="email" required />
            </div>
          </CardContent>
        </Card>

        <!-- Блок 2: Доставка и оплата -->
        <Card>
          <CardHeader><CardTitle>2. Доставка и оплата</CardTitle></CardHeader>
          <CardContent class="space-y-6">
            <Label>Способ доставки</Label>
            <RadioGroup v-model="orderForm.deliveryMethod" class="grid grid-cols-2 gap-4">
              <!-- ... (radio buttons) ... -->
            </RadioGroup>
            <div v-if="orderForm.deliveryMethod === 'courier'" class="space-y-4">
              <!-- ... (поля для адреса) ... -->
            </div>
          </CardContent>
        </Card>

        <!-- =============================================== -->
        <!-- === ВОТ НЕДОСТАЮЩИЙ БЛОК ДЛЯ АВТОРИЗОВАННЫХ === -->
        <!-- =============================================== -->
        <Card v-if="isLoggedIn && bonusBalance > 0">
          <CardHeader><CardTitle>3. Бонусы</CardTitle></CardHeader>
          <CardContent>
            <p class="text-sm">
              У вас на счету <span class="font-bold text-primary">{{ bonusBalance }} бонусов</span>.
            </p>
            <div class="flex items-center gap-4 mt-4">
              <Input id="bonuses" v-model.number="bonusesInput" type="number" placeholder="Сколько списать?" :max="bonusBalance" />
              <!-- Эта кнопка теперь используется -->
              <Button type="button" variant="outline" @click="applyBonuses">
                Применить
              </Button>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" class="w-full text-lg" :disabled="isProcessing">
          <span v-if="isProcessing">Оформляем...</span>
          <!-- Используем `total` для отображения итоговой суммы -->
          <span v-else>Подтвердить заказ на {{ total }} ₸</span>
        </Button>
      </form>

      <!-- ================================================= -->
      <!-- === ВОТ НЕДОСТАЮЩИЙ БЛОК С ИТОГАМИ ЗАКАЗА === -->
      <!-- ================================================= -->
      <aside class="col-span-1 lg:sticky top-24">
        <Card>
          <CardHeader><CardTitle>Ваш заказ</CardTitle></CardHeader>
          <CardContent class="space-y-4 text-sm">
            <!-- `items` используется здесь -->
            <div v-for="item in items" :key="item.product.id" class="flex justify-between items-start">
              <span class="pr-2">{{ item.product.name }} (x{{ item.quantity }})</span>
              <span class="font-semibold whitespace-nowrap">{{ Number(item.product.price) * item.quantity }} ₸</span>
            </div>
            <div class="pt-4 border-t flex justify-between">
              <span>Сумма:</span>
              <!-- `subtotal` используется здесь -->
              <span>{{ subtotal }} ₸</span>
            </div>
            <div v-if="discountAmount > 0" class="flex justify-between text-primary font-medium">
              <span>Скидка бонусами:</span>
              <!-- `discountAmount` используется здесь -->
              <span>-{{ discountAmount }} ₸</span>
            </div>
          </CardContent>
          <CardFooter class="pt-4 border-t flex justify-between font-bold text-lg">
            <span>Итого к оплате:</span>
            <!-- `total` используется здесь -->
            <span>{{ total }} ₸</span>
          </CardFooter>
        </Card>
      </aside>
    </div>

    <!-- Модальное окно (без изменений) -->
    <AlertDialog :open="showBonusModal" @update:open="showBonusModal = false">
      <!-- ... -->
    </AlertDialog>
  </div>
</template>
