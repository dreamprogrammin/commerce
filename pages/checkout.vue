<script setup lang="ts">
import { Star } from 'lucide-vue-next'
import { vMaska } from 'maska/vue'
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

// Строгая маска для казахстанского мобильного
// +7 (7XX) XXX-XX-XX - где первый X может быть только 0,4,5,6,7,8
const phoneMask = {
  mask: '+7 (7##) ###-##-##',
  eager: true,
  tokens: {
    '#': { pattern: /[0-9]/ },
  },
}

// Обработчик ввода телефона - заменяет 8 на +7
function handlePhoneInput(event: Event) {
  const input = event.target as HTMLInputElement
  let value = input.value

  // Если пользователь начал вводить с 8, заменяем на +7
  if (value.startsWith('8')) {
    value = '+7' + value.substring(1)
    orderForm.value.phone = value
    
    // Небольшая задержка чтобы маска успела примениться
    nextTick(() => {
      input.value = orderForm.value.phone
    })
  }
}

// Автофокус при клике на пустое поле (устанавливает курсор после +7 (7)
function handlePhoneFocus(event: FocusEvent) {
  const input = event.target as HTMLInputElement
  if (!orderForm.value.phone || orderForm.value.phone.length <= 5) {
    // Если поле пустое или только +7 (7, позиционируем курсор для ввода
    setTimeout(() => {
      const cursorPos = 6 // После "+7 (7"
      input.setSelectionRange(cursorPos, cursorPos)
    }, 10)
  }
}

// Валидация казахстанского мобильного телефона
const isValidPhone = computed(() => {
  const phone = orderForm.value.phone
  if (!phone) return true

  const digits = phone.replace(/\D/g, '')

  // Должно быть ровно 11 цифр
  if (digits.length !== 11) return false

  // Должно начинаться с 7
  if (!digits.startsWith('7')) return false

  // Проверка мобильных кодов: 70X, 74X, 75X, 76X, 77X, 78X
  const mobileCode = digits.substring(1, 3)
  const validCodes = ['70', '74', '75', '76', '77', '78']

  return validCodes.includes(mobileCode)
})

// Сообщение об ошибке для телефона
const phoneErrorMessage = computed(() => {
  const phone = orderForm.value.phone
  if (!phone) return ''

  const digits = phone.replace(/\D/g, '')

  if (digits.length < 11) {
    return 'Введите полный номер телефона'
  }

  if (!digits.startsWith('7')) {
    return 'Номер должен начинаться с +7'
  }

  const mobileCode = digits.substring(1, 3)
  const validCodes = ['70', '74', '75', '76', '77', '78']

  if (!validCodes.includes(mobileCode)) {
    return 'Код оператора должен быть 700-709, 747-749, 750-759, 760-769, 770-779, 780-789'
  }

  return ''
})

// Валидация email
const isValidEmail = computed(() => {
  const email = orderForm.value.email
  if (!email) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
})

// Валидация имени (минимум 2 символа)
const isValidName = computed(() => {
  const name = orderForm.value.name.trim()
  if (!name) return true
  return name.length >= 2
})

// Проверка готовности формы к отправке
const isFormValid = computed(() => {
  const { name, email, phone, deliveryMethod, address } = orderForm.value

  // Базовые поля
  if (!name.trim() || !email.trim() || !phone.trim()) return false
  if (!isValidName.value || !isValidEmail.value || !isValidPhone.value) return false

  // Адрес для курьера
  if (deliveryMethod === 'courier' && !address.line1.trim()) return false

  return true
})

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
  // Проверка 1: Достаточно ли бонусов на балансе
  if (bonusesInput.value > bonusBalance.value) {
    toast.error('Недостаточно бонусов', {
      description: `У вас доступно только ${bonusBalance.value} бонусов`,
    })
    bonusesInput.value = bonusBalance.value
    return
  }

  // Проверка 2: Не превышают ли бонусы стоимость заказа
  const maxBonuses = Math.floor(subtotal.value)
  if (bonusesInput.value > maxBonuses) {
    toast.warning('Слишком много бонусов', {
      description: `Максимум для этого заказа: ${maxBonuses} бонусов (стоимость корзины)`,
    })
    bonusesInput.value = maxBonuses
    cartStore.setBonusesToSpend(maxBonuses)
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
  // Валидация обязательных полей
  if (!orderForm.value.name.trim() || !orderForm.value.email.trim() || !orderForm.value.phone.trim()) {
    toast.error('Заполните все обязательные поля')
    return
  }

  // Валидация имени
  if (!isValidName.value) {
    toast.error('Имя должно содержать минимум 2 символа')
    return
  }

  // Валидация телефона
  if (!isValidPhone.value) {
    toast.error(phoneErrorMessage.value || 'Введите корректный казахстанский мобильный номер')
    return
  }

  // Валидация email
  if (!isValidEmail.value) {
    toast.error('Введите корректный email')
    return
  }

  // Форматируем номер для отправки в бэк: +77771234567
  // Удобно для WhatsApp (wa.me/77771234567) и звонков (tel:+77771234567)
  const cleanPhone = orderForm.value.phone.replace(/\D/g, '') // Только цифры: 77771234567
  const formattedPhone = `+${cleanPhone}` // Добавляем +: +77771234567

  // Для гостей обязательны данные
  const guestInfo = !isLoggedIn.value
    ? {
        name: orderForm.value.name.trim(),
        email: orderForm.value.email.trim(),
        phone: formattedPhone, // Отправляем в формате +77771234567
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
              <div class="space-y-1">
                <Label for="name">Имя *</Label>
                <Input
                  id="name"
                  v-model="orderForm.name"
                  required
                  autocomplete="name"
                  placeholder="Иван"
                  :class="{ 'border-destructive': orderForm.name && !isValidName }"
                />
                <p v-if="orderForm.name && !isValidName" class="text-xs text-destructive">
                  Минимум 2 символа
                </p>
              </div>
              <div class="space-y-1">
                <Label for="phone">Телефон *</Label>
                <Input
                  id="phone"
                  v-model="orderForm.phone"
                  v-maska:[phoneMask]
                  required
                  autocomplete="tel"
                  placeholder="+7 (7__) ___-__-__"
                  inputmode="tel"
                  @input="handlePhoneInput"
                  @focus="handlePhoneFocus"
                  :class="{ 'border-destructive': orderForm.phone && !isValidPhone }"
                />
                <p v-if="orderForm.phone && phoneErrorMessage" class="text-xs text-destructive">
                  {{ phoneErrorMessage }}
                </p>
                <p v-else-if="orderForm.phone && isValidPhone" class="text-xs text-green-600">
                  ✓ Номер введен корректно
                </p>
              </div>
            </div>
            <div class="space-y-1">
              <Label for="email">Email *</Label>
              <Input
                id="email"
                v-model="orderForm.email"
                type="email"
                required
                autocomplete="email"
                placeholder="example@mail.com"
                inputmode="email"
                :class="{ 'border-destructive': orderForm.email && !isValidEmail }"
              />
              <p v-if="orderForm.email && !isValidEmail" class="text-xs text-destructive">
                Введите корректный email
              </p>
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
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <Input
                  id="bonuses"
                  v-model.number="bonusesInput"
                  type="number"
                  placeholder="Сколько списать?"
                  :max="Math.min(bonusBalance, Math.floor(subtotal))"
                  min="0"
                  class="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  @click="bonusesInput = Math.min(bonusBalance, Math.floor(subtotal))"
                >
                  Максимум
                </Button>
                <Button type="button" variant="default" @click="applyBonuses">
                  Применить
                </Button>
              </div>
            </div>
            <div class="text-xs text-muted-foreground mt-2 space-y-1">
              <p>
                Максимум для этого заказа:
                <span class="font-semibold text-foreground">
                  {{ Math.min(bonusBalance, Math.floor(subtotal)) }} бонусов
                </span>
                <span v-if="bonusBalance > Math.floor(subtotal)" class="text-amber-600">
                  (ограничено стоимостью корзины)
                </span>
              </p>
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
          :disabled="isProcessing || !isFormValid"
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