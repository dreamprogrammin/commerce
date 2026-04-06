<script setup lang="ts">
import {
  Lock,
  Package,
  Star,
  Tag,
  CreditCard,
  Banknote,
  Smartphone,
} from "lucide-vue-next";
import { vMaska } from "maska/vue";
import { storeToRefs } from "pinia";
import { toast } from "vue-sonner";
import { carouselContainerVariants } from "@/lib/variants";
import { useAuthStore } from "@/stores/auth";
import { useProfileStore } from "@/stores/core/profileStore";
import { useCartStore } from "@/stores/publicStore/cartStore";
import { usePromoCodeStore } from "@/stores/publicStore/promoCodeStore";
import { formatPrice } from "@/utils/formatPrice";

// SEO: Закрываем страницу оформления заказа от индексации
useHead({
  meta: [{ name: "robots", content: "noindex, nofollow" }],
});

const authStore = useAuthStore();
const cartStore = useCartStore();
const profileStore = useProfileStore();
const promoCodeStore = usePromoCodeStore();

const { user, isLoggedIn } = storeToRefs(authStore);
const { bonusBalance } = storeToRefs(profileStore);
const {
  subtotal,
  discountAmount,
  total,
  items,
  isProcessing,
  bonusesToSpend,
  bonusesToAward,
} = storeToRefs(cartStore);

const orderForm = ref({
  name: "",
  phone: "",
  email: "",
  deliveryMethod: "pickup" as "pickup" | "courier",
  paymentMethod: "kaspi" as "kaspi" | "cash" | "card",
  address: {
    city: "Алматы",
    line1: "",
  },
  comment: "",
});
const bonusesInput = ref(0);
const promoCodeInput = ref("");
const showGuestModal = ref(false);
const agreedToTerms = ref(true);

const {
  appliedCode: appliedPromoCode,
  discountAmount: promoDiscount,
  isValidating: isPromoValidating,
} = storeToRefs(promoCodeStore);

async function applyPromoCode() {
  await promoCodeStore.validateCode(promoCodeInput.value, subtotal.value);
}

function clearPromoCode() {
  promoCodeStore.clearCode();
  promoCodeInput.value = "";
}

// Маска для телефона (как в Kaspi)
const phoneMaskOptions = reactive({
  mask: "+7 (###) ###-##-##",
  eager: false, // Маска появляется только при вводе
});

// При фокусе показываем +7 если поле пустое
function handlePhoneFocus() {
  if (!orderForm.value.phone) {
    orderForm.value.phone = "+7 ";
  }
}

// При потере фокуса очищаем если только +7
function handlePhoneBlur() {
  const trimmed = orderForm.value.phone.trim();
  if (trimmed === "+7" || trimmed === "+7 (" || trimmed === "+7 ()") {
    orderForm.value.phone = "";
  }
}

// Валидация email
const isValidEmail = computed(() => {
  const email = orderForm.value.email;
  if (!email) return true;
  return /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email);
});

// Валидация имени (минимум 2 символа)
const isValidName = computed(() => {
  const name = orderForm.value.name.trim();
  if (!name) return true;
  return name.length >= 2;
});

// Извлекаем только цифры из номера телефона
const phoneDigits = computed(() => orderForm.value.phone.replace(/\D/g, ""));

// Валидация казахстанского мобильного телефона
const isValidPhone = computed(() => {
  const digits = phoneDigits.value;
  if (!digits) return true;

  // Должно быть ровно 11 цифр
  if (digits.length !== 11) return false;

  // Должно начинаться с 7
  if (!digits.startsWith("7")) return false;

  // Проверка мобильных кодов: 70X, 74X, 75X, 76X, 77X, 78X
  const mobileCode = digits.substring(1, 3);
  const validCodes = ["70", "74", "75", "76", "77", "78"];

  return validCodes.includes(mobileCode);
});

// Сообщение об ошибке для телефона
const phoneErrorMessage = computed(() => {
  const digits = phoneDigits.value;
  if (!digits) return "";

  if (digits.length < 11) {
    return "Введите полный номер телефона";
  }

  if (!digits.startsWith("7")) {
    return "Номер должен начинаться с +7";
  }

  const mobileCode = digits.substring(1, 3);
  const validCodes = ["70", "74", "75", "76", "77", "78"];

  if (!validCodes.includes(mobileCode)) {
    return "Неверный код оператора (700-709, 747-749, 750-759, 760-769, 770-779, 780-789)";
  }

  return "";
});

// Константа порога бесплатной доставки (как в умной корзине)
const FREE_SHIPPING_THRESHOLD = 15000;

// Расчет стоимости доставки
const deliveryCost = computed(() => {
  // Самовывоз — бесплатно
  if (orderForm.value.deliveryMethod === "pickup") return 0;

  // Курьер: если сумма >= 15000 ₸ — бесплатно, иначе 1000 ₸
  return subtotal.value >= FREE_SHIPPING_THRESHOLD ? 0 : 1000;
});

// Итоговая сумма с учетом доставки
const totalWithDelivery = computed(() => {
  return total.value + deliveryCost.value;
});

// Проверка готовности формы к отправке
const isFormValid = computed(() => {
  const { name, email, phone, deliveryMethod, address } = orderForm.value;

  // Базовые поля
  if (!name.trim() || !email.trim() || !phone.trim()) return false;
  if (!isValidName.value || !isValidEmail.value || !isValidPhone.value)
    return false;

  // Адрес для курьера
  if (deliveryMethod === "courier" && !address.line1.trim()) return false;

  // Согласие с условиями
  if (!agreedToTerms.value) return false;

  return true;
});

// Предзаполнение формы
watch(
  () => profileStore.profile,
  (newProfile) => {
    if (newProfile) {
      orderForm.value.name =
        `${newProfile.first_name || ""} ${newProfile.last_name || ""}`.trim();
      orderForm.value.phone = newProfile.phone || "";
    }
    if (user.value) {
      orderForm.value.email = user.value.email || "";
    }
  },
  { immediate: true },
);

// Модалка для гостей (один раз за сессию)
const hasSeenModalKey = "guest_bonus_modal_seen";

onMounted(() => {
  const hasSeenModal = sessionStorage.getItem(hasSeenModalKey);

  if (!isLoggedIn.value && items.value.length > 0 && !hasSeenModal) {
    setTimeout(() => {
      showGuestModal.value = true;
      sessionStorage.setItem(hasSeenModalKey, "true");
    }, 800);
  }
});

function applyBonuses() {
  // Проверка 1: Достаточно ли бонусов на балансе
  if (bonusesInput.value > bonusBalance.value) {
    toast.error("Недостаточно бонусов", {
      description: `У вас доступно только ${bonusBalance.value} бонусов`,
    });
    bonusesInput.value = bonusBalance.value;
    return;
  }

  // Проверка 2: Не превышают ли бонусы стоимость заказа
  const maxBonuses = Math.floor(subtotal.value);
  if (bonusesInput.value > maxBonuses) {
    toast.warning("Слишком много бонусов", {
      description: `Максимум для этого заказа: ${maxBonuses} бонусов (стоимость корзины)`,
    });
    bonusesInput.value = maxBonuses;
    cartStore.setBonusesToSpend(maxBonuses);
    return;
  }

  cartStore.setBonusesToSpend(bonusesInput.value);
  bonusesInput.value = bonusesToSpend.value;

  if (bonusesToSpend.value > 0) {
    toast.success(`${bonusesToSpend.value} бонусов применено!`, {
      description: `Скидка: ${bonusesToSpend.value} ₸`,
    });
  }
}

async function placeOrder() {
  // Валидация обязательных полей
  if (
    !orderForm.value.name.trim() ||
    !orderForm.value.email.trim() ||
    !orderForm.value.phone.trim()
  ) {
    toast.error("Заполните все обязательные поля");
    return;
  }

  // Валидация имени
  if (!isValidName.value) {
    toast.error("Имя должно содержать минимум 2 символа");
    return;
  }

  // Валидация телефона
  if (!isValidPhone.value) {
    toast.error(
      phoneErrorMessage.value ||
        "Введите корректный казахстанский мобильный номер",
    );
    return;
  }

  // Валидация email
  if (!isValidEmail.value) {
    toast.error("Введите корректный email");
    return;
  }

  // Форматируем номер для отправки в бэк: +77771234567
  const formattedPhone = `+${phoneDigits.value}`;

  // Для залогиненных: сохраняем телефон в профиль, если он отсутствует или изменился
  if (isLoggedIn.value && profileStore.profile?.phone !== formattedPhone) {
    await profileStore.updateProfile(
      { phone: formattedPhone },
      { silent: true },
    );
  }

  // Для гостей обязательны данные
  const guestInfo = !isLoggedIn.value
    ? {
        name: orderForm.value.name.trim(),
        email: orderForm.value.email.trim(),
        phone: formattedPhone, // Отправляем в формате +77771234567
      }
    : undefined;

  await cartStore.checkout({
    deliveryMethod: orderForm.value.deliveryMethod,
    paymentMethod: orderForm.value.paymentMethod,
    deliveryAddress:
      orderForm.value.deliveryMethod === "courier"
        ? {
            line1: orderForm.value.address.line1,
            city: orderForm.value.address.city,
          }
        : undefined,
    guestInfo,
    promoCode: appliedPromoCode.value || undefined,
    contactName: isLoggedIn.value
      ? orderForm.value.name.trim() || undefined
      : undefined,
    contactPhone: isLoggedIn.value ? formattedPhone : undefined,
    comment: orderForm.value.comment.trim() || undefined,
  });

  // Очищаем промокод после успешного заказа
  promoCodeStore.clearCode();
}
const containerClass = carouselContainerVariants({ contained: "always" });

// Scroll-aware visibility для sticky bar
const isNavVisible = ref(true);
let lastScrollY = 0;

function handleScroll() {
  const currentScrollY = window.scrollY;
  if (currentScrollY < 60) {
    isNavVisible.value = true;
  } else if (currentScrollY > lastScrollY) {
    isNavVisible.value = false;
  } else {
    isNavVisible.value = true;
  }
  lastScrollY = currentScrollY;
}

onMounted(() =>
  window.addEventListener("scroll", handleScroll, { passive: true }),
);
onUnmounted(() => window.removeEventListener("scroll", handleScroll));
</script>

<template>
  <div :class="containerClass" class="py-12">
    <!-- Модалка для гостей -->
    <GuestBonusModal v-model:open="showGuestModal" />

    <!-- Корзина пуста -->
    <div
      v-if="items.length === 0"
      class="text-center text-muted-foreground py-20 border-2 border-dashed rounded-lg flex flex-col items-center gap-4"
    >
      <h1 class="text-3xl font-bold mb-4">Ваша корзина пуста</h1>
      <NuxtLink to="/catalog">
        <Button class="mt-4" size="lg"> Начать покупки </Button>
      </NuxtLink>
    </div>

    <!-- Есть товары в корзине -->
    <div
      v-else
      class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start pb-32 lg:pb-0"
    >
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
              и получите 1000 бонусов после подтверждения первого заказа! 🎁
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
                  :class="{
                    'border-destructive': orderForm.name && !isValidName,
                  }"
                />
                <p
                  v-if="orderForm.name && !isValidName"
                  class="text-xs text-destructive"
                >
                  Минимум 2 символа
                </p>
              </div>
              <div class="space-y-1">
                <Label for="phone">Телефон *</Label>
                <Input
                  id="phone"
                  v-model="orderForm.phone"
                  v-maska="phoneMaskOptions"
                  required
                  autocomplete="tel"
                  placeholder="+7 (___) ___-__-__"
                  inputmode="tel"
                  :class="{
                    'border-destructive':
                      orderForm.phone &&
                      orderForm.phone.length > 4 &&
                      !isValidPhone,
                  }"
                  @focus="handlePhoneFocus"
                  @blur="handlePhoneBlur"
                />
                <p
                  v-if="
                    orderForm.phone &&
                    orderForm.phone.length > 4 &&
                    phoneErrorMessage
                  "
                  class="text-xs text-destructive"
                >
                  {{ phoneErrorMessage }}
                </p>
                <p
                  v-else-if="orderForm.phone && isValidPhone"
                  class="text-xs text-green-600"
                >
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
                :class="{
                  'border-destructive': orderForm.email && !isValidEmail,
                }"
              />
              <p
                v-if="orderForm.email && !isValidEmail"
                class="text-xs text-destructive"
              >
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
              <RadioGroup
                v-model="orderForm.deliveryMethod"
                class="grid grid-cols-2 gap-4 mt-2"
              >
                <div>
                  <RadioGroupItem
                    id="pickup"
                    value="pickup"
                    class="peer sr-only"
                  />
                  <Label
                    for="pickup"
                    class="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <span class="text-sm font-medium">Самовывоз</span>
                    <span class="text-xs text-muted-foreground mt-1"
                      >Бесплатно</span
                    >
                  </Label>
                </div>
                <div>
                  <RadioGroupItem
                    id="courier"
                    value="courier"
                    class="peer sr-only"
                  />
                  <Label
                    for="courier"
                    class="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <span class="text-sm font-medium">Яндекс Доставка</span>
                    <span class="text-xs text-muted-foreground mt-1"
                      >От 500 ₸</span
                    >
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <!-- Адрес для курьера -->
            <div
              v-if="orderForm.deliveryMethod === 'courier'"
              class="space-y-4 animate-in fade-in"
            >
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
              <div>
                <Label for="comment">Комментарий для курьера</Label>
                <Textarea
                  id="comment"
                  v-model="orderForm.comment"
                  placeholder="Позвоните за час, не работает домофон, оставьте у двери..."
                  rows="3"
                  class="resize-none"
                />
                <p class="text-xs text-muted-foreground mt-1">
                  Необязательно, но поможет курьеру доставить заказ быстрее
                </p>
              </div>
            </div>

            <!-- Способ оплаты -->
            <div class="pt-4 border-t">
              <Label>Способ оплаты</Label>
              <RadioGroup
                v-model="orderForm.paymentMethod"
                class="grid grid-cols-1 gap-3 mt-2"
              >
                <div>
                  <RadioGroupItem
                    id="kaspi"
                    value="kaspi"
                    class="peer sr-only"
                  />
                  <Label
                    for="kaspi"
                    class="flex items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-red-500 [&:has([data-state=checked])]:border-red-500 cursor-pointer transition-colors"
                  >
                    <div class="flex items-center gap-3">
                      <Smartphone class="w-6 h-6 text-red-600" />
                      <div>
                        <span class="text-sm font-medium block"
                          >Kaspi QR / Перевод</span
                        >
                        <span class="text-xs text-muted-foreground"
                          >Переводом на Kaspi.kz</span
                        >
                      </div>
                    </div>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem id="cash" value="cash" class="peer sr-only" />
                  <Label
                    for="cash"
                    class="flex items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-green-500 [&:has([data-state=checked])]:border-green-500 cursor-pointer transition-colors"
                  >
                    <div class="flex items-center gap-3">
                      <Banknote class="w-6 h-6 text-green-600" />
                      <div>
                        <span class="text-sm font-medium block"
                          >Наличными при получении</span
                        >
                        <span class="text-xs text-muted-foreground"
                          >Оплата курьеру или при самовывозе</span
                        >
                      </div>
                    </div>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem id="card" value="card" class="peer sr-only" />
                  <Label
                    for="card"
                    class="flex items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-blue-500 [&:has([data-state=checked])]:border-blue-500 cursor-pointer transition-colors"
                  >
                    <div class="flex items-center gap-3">
                      <CreditCard class="w-6 h-6 text-blue-600" />
                      <div>
                        <span class="text-sm font-medium block"
                          >Картой курьеру</span
                        >
                        <span class="text-xs text-muted-foreground"
                          >Оплата картой при получении</span
                        >
                      </div>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
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
              У вас
              <span class="font-bold text-primary">{{ bonusBalance }}</span>
              активных бонусов (1 бонус = 1 ₸ скидки)
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
                  @click="
                    bonusesInput = Math.min(bonusBalance, Math.floor(subtotal))
                  "
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
                <span
                  v-if="bonusBalance > Math.floor(subtotal)"
                  class="text-amber-600"
                >
                  (ограничено стоимостью корзины)
                </span>
              </p>
              <p class="text-[11px]">
                💡 Бонусы начисляются при подтверждении заказа и активируются
                через 14 дней
              </p>
            </div>
          </CardContent>
        </Card>

        <!-- Блок 4: Промокод -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Tag class="w-5 h-5 text-primary" />
              Промокод
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              v-if="appliedPromoCode"
              class="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 rounded-lg"
            >
              <div>
                <span
                  class="font-semibold text-green-700 dark:text-green-300"
                  >{{ appliedPromoCode }}</span
                >
                <span class="text-sm text-muted-foreground ml-2"
                  >— скидка {{ promoDiscount }} ₸</span
                >
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                @click="clearPromoCode"
              >
                Отменить
              </Button>
            </div>
            <div v-else class="flex items-center gap-2">
              <Input
                v-model="promoCodeInput"
                placeholder="Введите промокод"
                class="flex-1 uppercase"
                @keyup.enter="applyPromoCode"
              />
              <Button
                type="button"
                variant="default"
                :disabled="isPromoValidating || !promoCodeInput.trim()"
                @click="applyPromoCode"
              >
                {{ isPromoValidating ? "Проверяем..." : "Применить" }}
              </Button>
            </div>
          </CardContent>
        </Card>

        <!-- Кнопка оформления удалена отсюда - перенесена в правую колонку -->
      </div>

      <!-- Правая колонка: Состав заказа -->
      <aside class="col-span-1 lg:sticky top-24">
        <Card>
          <CardHeader>
            <CardTitle>Ваш заказ</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4 text-sm">
            <!-- Товары -->
            <div
              v-for="item in items"
              :key="item.product.id"
              class="flex justify-between items-start"
            >
              <span class="pr-2"
                >{{ item.product.name }} × {{ item.quantity }}</span
              >
              <span class="font-semibold whitespace-nowrap">
                {{
                  formatPrice(
                    (item.product.final_price || item.product.price) *
                      item.quantity,
                  )
                }}
                ₸
              </span>
            </div>

            <!-- Разделитель -->
            <div class="pt-4 border-t space-y-2">
              <div class="flex justify-between">
                <span>Сумма:</span>
                <span>{{ formatPrice(subtotal) }} ₸</span>
              </div>

              <!-- Скидка бонусами -->
              <div
                v-if="discountAmount > 0"
                class="flex justify-between text-primary font-medium"
              >
                <span>Скидка бонусами:</span>
                <span>-{{ formatPrice(discountAmount) }} ₸</span>
              </div>

              <!-- Скидка промокодом -->
              <div
                v-if="promoDiscount > 0"
                class="flex justify-between text-green-600 font-medium"
              >
                <span>Промокод {{ appliedPromoCode }}:</span>
                <span>-{{ promoDiscount }} ₸</span>
              </div>

              <!-- Доставка -->
              <div class="flex justify-between items-center">
                <span>Доставка:</span>
                <div class="flex items-center gap-2">
                  <span
                    v-if="deliveryCost === 0"
                    class="text-green-600 font-medium flex items-center gap-1"
                  >
                    Бесплатно
                    <Badge
                      variant="outline"
                      class="bg-green-50 text-green-700 border-green-200"
                    >
                      🎉 Бесплатно
                    </Badge>
                  </span>
                  <span v-else class="font-medium"
                    >{{ formatPrice(deliveryCost) }} ₸</span
                  >
                </div>
              </div>

              <!-- Прогресс до бесплатной доставки (если курьер и не достигнут порог) -->
              <div
                v-if="
                  orderForm.deliveryMethod === 'courier' &&
                  subtotal < FREE_SHIPPING_THRESHOLD
                "
                class="text-xs text-muted-foreground"
              >
                Добавьте товаров на
                {{ formatPrice(FREE_SHIPPING_THRESHOLD - subtotal) }} ₸ для
                бесплатной доставки 🚚
              </div>

              <!-- Будущие бонусы (только для авторизованных) -->
              <div
                v-if="isLoggedIn && bonusesToAward > 0"
                class="flex justify-between text-xs text-muted-foreground"
              >
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger class="flex items-center gap-1 cursor-help">
                      <Star class="w-3 h-3" />
                      Вы получите (через 14 дней):
                    </TooltipTrigger>
                    <TooltipContent class="max-w-xs">
                      <p class="text-xs">
                        Бонусы будут начислены после подтверждения заказа
                        администратором и активируются через 14 дней
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span>+{{ bonusesToAward }} бонусов</span>
              </div>
            </div>
          </CardContent>

          <!-- Итого -->
          <CardFooter class="pt-4 border-t flex-col space-y-4">
            <div class="flex justify-between font-bold text-lg w-full">
              <span>Итого к оплате:</span>
              <span>{{ formatPrice(totalWithDelivery) }} ₸</span>
            </div>

            <!-- Чекбокс согласия -->
            <div class="flex items-start gap-2 w-full">
              <Checkbox id="terms" v-model:checked="agreedToTerms" />
              <Label for="terms" class="text-xs leading-tight cursor-pointer">
                Я согласен с условиями
                <a
                  href="/terms"
                  target="_blank"
                  class="text-primary hover:underline"
                  >Публичной оферты</a
                >
                и
                <a
                  href="/privacy"
                  target="_blank"
                  class="text-primary hover:underline"
                  >политикой обработки персональных данных</a
                >
              </Label>
            </div>

            <!-- Кнопка оформления заказа (скрыта на мобильных) -->
            <Button
              type="button"
              size="lg"
              class="w-full text-lg hidden lg:flex"
              :disabled="isProcessing || !isFormValid"
              @click="placeOrder"
            >
              <span v-if="isProcessing">Оформляем заказ...</span>
              <span v-else
                >Подтвердить заказ на
                {{ formatPrice(totalWithDelivery) }} ₸</span
              >
            </Button>

            <!-- Trust Badges (скрыты на мобильных) -->
            <div
              class="hidden lg:flex items-center justify-center gap-4 text-xs text-muted-foreground w-full pt-2 border-t"
            >
              <div class="flex items-center gap-1">
                <Lock class="w-3 h-3" />
                <span>Безопасная оплата</span>
              </div>
              <div class="flex items-center gap-1">
                <Package class="w-3 h-3" />
                <span>Гарантия возврата 14 дней</span>
              </div>
            </div>
          </CardFooter>
        </Card>
      </aside>
    </div>

    <!-- 🎯 Sticky панель для мобильных -->
    <ClientOnly>
      <div
        v-if="items.length > 0"
        class="lg:hidden fixed left-4 right-4 z-40 checkout-sticky-bar"
        :class="isNavVisible ? 'sticky-above-nav' : 'sticky-at-bottom'"
      >
        <div class="px-4 py-3">
          <div class="flex items-center justify-between gap-3 mb-3">
            <div class="flex flex-col gap-0.5">
              <span class="text-xs text-muted-foreground">Итого к оплате</span>
              <div class="flex items-baseline gap-0.5">
                <span class="text-2xl font-bold leading-none text-primary">
                  {{ formatPrice(totalWithDelivery) }}
                </span>
                <span class="text-xl font-bold text-primary">₸</span>
              </div>
            </div>
            <div class="text-right">
              <p class="text-xs text-muted-foreground">Товары</p>
              <p class="text-sm font-semibold">{{ totalItems }} шт.</p>
            </div>
          </div>
          <Button
            type="button"
            size="lg"
            class="w-full text-base font-semibold"
            :disabled="isProcessing || !isFormValid"
            @click="placeOrder"
          >
            <span v-if="isProcessing">Оформляем заказ...</span>
            <span v-else>Подтвердить заказ</span>
          </Button>
        </div>
      </div>
    </ClientOnly>
  </div>
</template>

<style scoped>
.checkout-sticky-bar {
  /* Базовая позиция — у нижнего края (когда навбар скрыт) */
  bottom: calc(16px + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 20px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.1),
    0 2px 8px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  /* transform анимируется плавно (GPU) в отличие от bottom+env() */
  transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: transform;
}

/* Навбар виден — поднимаем панель на высоту навбара (84px - 16px = 68px) */
.sticky-above-nav {
  transform: translateY(-68px);
}

/* Навбар скрылся — панель на базовой позиции */
.sticky-at-bottom {
  transform: translateY(0);
}
</style>
