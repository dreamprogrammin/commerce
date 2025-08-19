<script setup lang="ts">
import { toast } from 'vue-sonner'
import { useProfileStore } from '@/stores/core/profileStore'
import { useCartStore } from '@/stores/publicStore/cartStore'

// --- 2. Инициализация ---
const cartStore = useCartStore()
const profileStore = useProfileStore()
const user = useSupabaseUser()

// `storeToRefs` делает computed-свойства из сторов доступными и реактивными в шаблоне
const { bonusBalance } = storeToRefs(profileStore)
const { subtotal, discountAmount, total, items, isProcessing } = storeToRefs(cartStore)

// --- 3. Состояние формы ---
// `ref` для хранения всех данных, которые вводит пользователь
const orderForm = ref({
  name: '',
  phone: '',
  email: '',
  deliveryMethod: 'pickup' as 'pickup' | 'courier',
  paymentMethod: 'kaspi', // Значение по умолчанию
  address: {
    city: 'Алматы',
    line1: '',
  },
})

// Отдельный `ref` для инпута с бонусами
const bonusesInput = ref(0)

// --- 4. Жизненный цикл ---
// `onMounted` выполняется один раз, когда компонент загрузился в браузере.
// Идеально для предзаполнения формы.
watch(
  () => profileStore.profile,
  (newProfile) => {
    if (newProfile) {
      orderForm.value.name = `${newProfile.first_name || ''} ${newProfile.last_name || ''}`.trim()
      orderForm.value.phone = newProfile.phone || ''
      orderForm.value.email = user.value?.email || ''
    }
  },
  { immediate: true }, // immediate: true заполнит форму, если профиль уже загружен
)

// --- 5. Методы-обработчики ---

/**
 * Вызывается при клике на кнопку "Применить бонусы".
 * Передает значение из инпута в стор для расчета скидки.
 */
function applyBonuses() {
  cartStore.setBonusesToSpend(bonusesInput.value)
  // Обновляем инпут, если пользователь ввел больше, чем можно
  bonusesInput.value = cartStore.bonusesToSpend
  if (cartStore.bonusesToSpend > 0) {
    toast.success(`${cartStore.bonusesToSpend} бонусов применено!`)
  }
}

/**
 * Главная функция, вызывается при отправке формы.
 * Собирает все данные и передает их в `cartStore.checkout`.
 */
async function submitOrder() {
  await cartStore.checkout({
    deliveryMethod: orderForm.value.deliveryMethod,
    paymentMethod: orderForm.value.paymentMethod,
    deliveryAddress: orderForm.value.deliveryMethod === 'courier' ? orderForm.value.address : undefined,
    // Если пользователь гость (не авторизован), передаем его данные
    guestInfo: !user.value
      ? {
          name: orderForm.value.name,
          phone: orderForm.value.phone,
          email: orderForm.value.email,
        }
      : undefined,
  })
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
      <form class="lg:col-span-2 space-y-8" @submit.prevent="submitOrder">
        <!-- Блок 1: Контактная информация -->
        <Card>
          <CardHeader><CardTitle>1. Контактная информация</CardTitle></CardHeader>
          <CardContent class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label for="name">Имя и Фамилия</Label>
                <Input id="name" v-model="orderForm.name" required autocomplete="name" />
              </div>
              <div>
                <Label for="phone">Телефон</Label>
                <Input id="phone" v-model="orderForm.phone" required autocomplete="tel" placeholder="+7 (777) 123-45-67" />
              </div>
            </div>
            <div>
              <Label for="email">Email</Label>
              <Input id="email" v-model="orderForm.email" type="email" required autocomplete="email" />
            </div>
            <!-- Показываем призыв к регистрации только для гостей -->
            <div v-if="!user" class="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
              <p>
                <NuxtLink to="/login" class="font-bold underline">
                  Войдите
                </NuxtLink> или <NuxtLink to="/register" class="font-bold underline">
                  зарегистрируйтесь
                </NuxtLink>, чтобы получить бонусы и сохранить адрес!
              </p>
            </div>
          </CardContent>
        </Card>

        <!-- Блок 2: Доставка и оплата -->
        <Card>
          <CardHeader><CardTitle>2. Доставка и оплата</CardTitle></CardHeader>
          <CardContent class="space-y-6">
            <Label>Способ доставки</Label>
            <RadioGroup v-model="orderForm.deliveryMethod" class="grid grid-cols-2 gap-4">
              <div>
                <RadioGroupItem id="pickup" value="pickup" class="peer sr-only" />
                <Label for="pickup" class="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer">
                  Самовывоз
                </Label>
              </div>
              <div>
                <RadioGroupItem id="courier" value="courier" class="peer sr-only" />
                <Label for="courier" class="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer">
                  Яндекс.Курьер
                </Label>
              </div>
            </RadioGroup>
            <!-- Поля для адреса, которые появляются, только если выбрана доставка курьером -->
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
            <!-- TODO: Добавить выбор способа оплаты, если их будет несколько -->
          </CardContent>
        </Card>

        <!-- Блок 3: Бонусы (только для авторизованных пользователей с бонусами) -->
        <Card v-if="user && bonusBalance > 0">
          <CardHeader><CardTitle>3. Бонусы</CardTitle></CardHeader>
          <CardContent>
            <p class-="text-sm">
              У вас на счету <span class="font-bold text-primary">{{ bonusBalance }} бонусов</span>. 1 бонус = 1 ₸.
            </p>
            <div class-="flex items-center gap-4 mt-4">
              <Input id="bonuses" v-model.number="bonusesInput" type="number" placeholder="Сколько списать?" :max="bonusBalance" />
              <Button type="button" variant="outline" @click="applyBonuses">
                Применить
              </Button>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" class="w-full text-lg" :disabled="isProcessing">
          <span v-if="isProcessing">Оформляем...</span>
          <span v-else>Подтвердить заказ на {{ total }} ₸</span>
        </Button>
      </form>

      <!-- Правая колонка: Состав заказа и итоговая сумма -->
      <aside class="col-span-1 lg:sticky top-24">
        <Card>
          <CardHeader><CardTitle>Ваш заказ</CardTitle></CardHeader>
          <CardContent class="space-y-4 text-sm">
            <div v-for="item in items" :key="item.product.id" class="flex justify-between items-start">
              <span class="pr-2">{{ item.product.name }} (x{{ item.quantity }})</span>
              <span class="font-semibold whitespace-nowrap">{{ Number(item.product.price) * item.quantity }} ₸</span>
            </div>
            <div class="pt-4 border-t flex justify-between">
              <span>Сумма:</span>
              <span>{{ subtotal }} ₸</span>
            </div>
            <div v-if="discountAmount > 0" class="flex justify-between text-primary font-medium">
              <span>Скидка бонусами:</span>
              <span>-{{ discountAmount }} ₸</span>
            </div>
          </CardContent>
          <CardFooter class="pt-4 border-t flex justify-between font-bold text-lg">
            <span>Итого к оплате:</span>
            <span>{{ total }} ₸</span>
          </CardFooter>
        </Card>
      </aside>
    </div>
  </div>
</template>
