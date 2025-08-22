<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, toRaw, watch } from 'vue'
import { toast } from 'vue-sonner'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

import { useAuthStore } from '@/stores/auth'
import { useProfileStore } from '@/stores/core/profileStore'
import { useCartStore } from '@/stores/publicStore/cartStore'

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
    <div v-if="items.length === 0" class="text-center text-muted-foreground py-20 border-2 border-dashed rounded-lg flex flex-col items-center gap-4">
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
              <button
                type="button"
                class="font-semibold text-primary hover:underline"
                @click="handleRegisterAndGetBonus"
              >
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
              <Input id="email" v-model="orderForm.email" type="email" required autocomplete="email" />
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
            <div v-if="orderForm.deliveryMethod === 'courier'" class="space-y-4 animate-in fade-in">
              <div>
                <Label for="city">Город</Label>
                <Input id="city" v-model="orderForm.address.city" required />
              </div>
              <div>
                <Label for="address">Улица, дом, квартира</Label>
                <Input id="address" v-model="orderForm.address.line1" required />
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Блок 3: Бонусы (только для ПОЛНОСТЬЮ авторизованных) -->
        <Card v-if="isLoggedIn && bonusBalance > 0">
          <CardHeader><CardTitle>3. Бонусы</CardTitle></CardHeader>
          <CardContent>
            <p class="text-sm">
              У вас на счету <span class="font-bold text-primary">{{ bonusBalance }} бонусов</span>. 1 бонус = 1 ₸.
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
      <!-- Правая колонка: Состав и итоги заказа -->
      <aside class="col-span-1 lg:sticky top-24">
        <Card>
          <CardHeader><CardTitle>Ваш заказ</CardTitle></CardHeader>
          <CardContent class="space-y-4 text-sm">
            <!-- `items` используется здесь -->
            <div v-for="item in items" :key="item.product.id" class="flex justify-between items-start">
              <span class="pr-2">{{ item.product.name }} (x{{ item.quantity }})</span>
              <span class="font-semibold whitespace-nowrap">{{ (Number(item.product.price) * item.quantity).toFixed(2) }} ₸</span>
            </div>
            <div class="pt-4 border-t flex justify-between">
              <span>Сумма:</span>
              <span>{{ subtotal.toFixed(2) }} ₸</span>
            </div>
            <div v-if="discountAmount > 0" class="flex justify-between text-primary font-medium">
              <span>Скидка бонусами:</span>
              <span>-{{ discountAmount.toFixed(2) }} ₸</span>
            </div>
          </CardContent>
          <CardFooter class="pt-4 border-t flex justify-between font-bold text-lg">
            <span>Итого к оплате:</span>
            <span>{{ total.toFixed(2) }} ₸</span>
          </CardFooter>
        </Card>
      </aside>
    </div>
    <!-- Модальное окно с предложением бонусов для гостей -->
    <AlertDialog :open="showBonusModal" @update:open="showBonusModal = false">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Получите двойные бонусы!</AlertDialogTitle>
          <AlertDialogDescription class="py-4">
            За этот заказ вам будет начислено <span class="font-bold">{{ bonusesToAward }} бонусов</span>.
            <br><br>
            Войдите или зарегистрируйтесь сейчас, и мы **удвоим** их до <span class="font-bold text-primary text-lg">{{ bonusesToAward * 2 }}</span> в подарок!
            Ваша корзина и введенные данные сохранятся.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="ghost" @click="placeOrder">
            Нет, спасибо, продолжить как гость
          </Button>
          <Button @click="handleRegisterAndGetBonus">
            Войти через Google и получить бонусы
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
