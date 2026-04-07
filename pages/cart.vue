<script setup lang="ts">
import type { ProductWithImages } from "@/types";
import { Trash2 } from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { toast } from "vue-sonner";
import { useSupabaseStorage } from "@/composables/menuItems/useSupabaseStorage";
import { useFlipCounter } from "@/composables/useFlipCounter";
import { BUCKET_NAME_PRODUCT } from "@/constants";
import { carouselContainerVariants } from "@/lib/variants";
import { useCartStore } from "@/stores/publicStore/cartStore";
import { formatPrice } from "@/utils/formatPrice";

// SEO: Закрываем страницу корзины от индексации
useHead({
  meta: [{ name: "robots", content: "noindex, nofollow" }],
});

const cartStore = useCartStore();
const supabase = useSupabaseClient();
const { items, subtotal, totalItems, bonusesToAward } = storeToRefs(cartStore);
const { getVariantUrl } = useSupabaseStorage();

// 🔥 Константа порога бесплатной доставки
const FREE_SHIPPING_THRESHOLD = 15000;

// Прогресс бесплатной доставки
const shippingProgress = computed(() => {
  const progress = (subtotal.value / FREE_SHIPPING_THRESHOLD) * 100;
  return Math.min(progress, 100);
});

const remainingForFreeShipping = computed(() => {
  const remaining = FREE_SHIPPING_THRESHOLD - subtotal.value;
  return remaining > 0 ? remaining : 0;
});

const hasFreeShipping = computed(
  () => subtotal.value >= FREE_SHIPPING_THRESHOLD,
);

// 🔥 Cross-sell: Рекомендованные аксессуары
const suggestedAccessories = ref<ProductWithImages[]>([]);
const isLoadingAccessories = ref(false);
const selectedAccessoryIds = ref<string[]>([]);

// 🔥 Cross-sell: Похожие товары ("С этим товаром покупают")
const similarProducts = ref<ProductWithImages[]>([]);
const isLoadingSimilarProducts = ref(false);

// 🔥 Flip animation для итоговой суммы
const digitColumns = ref<HTMLElement[]>([]);
const mobileDigitColumns = ref<HTMLElement[]>([]);
const totalWithAccessories = computed(() => {
  let total = subtotal.value;
  const selected = suggestedAccessories.value.filter((acc) =>
    selectedAccessoryIds.value.includes(acc.id),
  );
  for (const acc of selected) {
    const accFinalPrice = acc.final_price || acc.price;
    total += accFinalPrice;
  }
  return total;
});

const priceChars = computed(() => {
  const formatted = formatPrice(totalWithAccessories.value);
  let digitIndex = 0;
  return formatted.split("").map((char) => {
    const isDigit = !Number.isNaN(Number(char)) && char !== " ";
    const result = { char, isDigit, digitIndex: isDigit ? digitIndex : -1 };
    if (isDigit) digitIndex++;
    return result;
  });
});

useFlipCounter(totalWithAccessories, digitColumns);
useFlipCounter(subtotal, mobileDigitColumns);

// Загрузка рекомендованных аксессуаров
async function loadSuggestedAccessories() {
  if (items.value.length === 0) {
    suggestedAccessories.value = [];
    return;
  }

  isLoadingAccessories.value = true;
  try {
    // Собираем все accessory_ids из товаров в корзине
    const allAccessoryIds = new Set<string>();
    const cartProductIds = new Set(items.value.map((item) => item.product.id));

    for (const item of items.value) {
      if (item.product.accessory_ids?.length) {
        item.product.accessory_ids.forEach((id) => {
          // Добавляем только если этого товара еще нет в корзине
          if (!cartProductIds.has(id)) {
            allAccessoryIds.add(id);
          }
        });
      }
    }

    if (allAccessoryIds.size === 0) {
      suggestedAccessories.value = [];
      return;
    }

    // Загружаем аксессуары (максимум 3)
    const { data, error } = await supabase
      .from("products")
      .select(
        `
        *,
        product_images (
          id,
          image_url,
          blur_placeholder,
          alt_text,
          display_order
        ),
        categories (
          id,
          name,
          slug
        )
      `,
      )
      .in("id", Array.from(allAccessoryIds).slice(0, 3))
      .eq("is_active", true)
      .order("display_order", {
        foreignTable: "product_images",
        ascending: true,
      });

    if (!error && data) {
      suggestedAccessories.value = data as ProductWithImages[];
    }
  } catch (e) {
    console.error("Error loading suggested accessories:", e);
  } finally {
    isLoadingAccessories.value = false;
  }
}

// Загрузка похожих товаров
async function loadSimilarProducts() {
  if (items.value.length === 0) {
    similarProducts.value = [];
    return;
  }

  isLoadingSimilarProducts.value = true;
  try {
    const cartProductIds = new Set(items.value.map((item) => item.product.id));

    // Собираем категории товаров в корзине
    const categoryIds = new Set<string>();
    items.value.forEach((item) => {
      if (item.product.category_id) {
        categoryIds.add(item.product.category_id);
      }
    });

    if (categoryIds.size === 0) {
      similarProducts.value = [];
      return;
    }

    // Загружаем похожие товары из тех же категорий (максимум 6)
    const { data, error } = await supabase
      .from("products")
      .select(
        `
        *,
        product_images (
          id,
          image_url,
          blur_placeholder,
          alt_text,
          display_order
        ),
        brands (
          id,
          name,
          slug,
          logo_url
        )
      `,
      )
      .in("category_id", Array.from(categoryIds))
      .not("id", "in", `(${Array.from(cartProductIds).join(",")})`)
      .eq("is_active", true)
      .gt("stock_quantity", 0)
      .order("created_at", { ascending: false })
      .limit(6)
      .order("display_order", {
        foreignTable: "product_images",
        ascending: true,
      });

    if (!error && data) {
      similarProducts.value = data as ProductWithImages[];
    }
  } catch (e) {
    console.error("Error loading similar products:", e);
  } finally {
    isLoadingSimilarProducts.value = false;
  }
}

// Загружаем аксессуары и похожие товары при изменении корзины
watch(
  () => items.value,
  () => {
    loadSuggestedAccessories();
    loadSimilarProducts();
  },
  {
    deep: true,
    immediate: true,
  },
);

// Получить URL изображения товара
function getProductImageUrl(product: any, variant: "sm" | "md" = "sm") {
  if (!product.product_images?.[0]?.image_url) return null;
  return getVariantUrl(
    BUCKET_NAME_PRODUCT,
    product.product_images[0].image_url,
    variant,
  );
}

// Добавить аксессуар в корзину
async function addAccessoryToCart(accessory: ProductWithImages) {
  await cartStore.addItem(accessory, 1);
  toast.success("Товар добавлен в корзину");
}

// Добавить выбранные аксессуары в корзину
async function addSelectedAccessoriesToCart() {
  const selected = suggestedAccessories.value.filter((acc) =>
    selectedAccessoryIds.value.includes(acc.id),
  );

  if (selected.length === 0) return;

  for (const acc of selected) {
    if (!cartStore.items.find((item) => item.product.id === acc.id)) {
      await cartStore.addItem(acc, 1);
    }
  }

  toast.success(
    selected.length === 1
      ? "Аксессуар добавлен в корзину"
      : `${selected.length} аксессуара добавлено в корзину`,
  );

  // Очищаем выбор
  selectedAccessoryIds.value = [];
}

// Показать тостер о прогрессе доставки при изменении суммы
let previousSubtotal = subtotal.value;
watch(subtotal, (newSubtotal) => {
  if (newSubtotal > previousSubtotal && newSubtotal < FREE_SHIPPING_THRESHOLD) {
    const remaining = FREE_SHIPPING_THRESHOLD - newSubtotal;
    toast.info(`До бесплатной доставки осталось ${formatPrice(remaining)} ₸`, {
      description: "🚚 Добавьте ещё товаров для бесплатной доставки",
      duration: 3000,
    });
  } else if (
    newSubtotal >= FREE_SHIPPING_THRESHOLD &&
    previousSubtotal < FREE_SHIPPING_THRESHOLD
  ) {
    toast.success("🎉 Поздравляем! Доставка бесплатная!", {
      description: "Вы получили бесплатную доставку",
      duration: 5000,
    });
  }
  previousSubtotal = newSubtotal;
});

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

// Добавляем padding-bottom для мобильной версии, чтобы контент не перекрывался sticky bar
const contentPaddingClass = computed(() =>
  items.value.length > 0 ? "pb-32 lg:pb-0" : "",
);
</script>

<template>
  <div :class="`${containerClass} py-6 sm:py-12 ${contentPaddingClass}`">
    <h1 class="text-2xl sm:text-3xl font-bold mb-4 sm:mb-8">Ваша корзина</h1>

    <!-- Пустая корзина -->
    <div
      v-if="items.length === 0"
      class="text-center text-muted-foreground py-12 sm:py-20 border-2 border-dashed rounded-lg"
    >
      <Icon
        name="lucide:shopping-cart"
        class="w-16 h-16 text-muted-foreground/50 mb-4 mx-auto"
      />
      <h3 class="text-lg font-semibold mb-2">Корзина пуста</h3>
      <p class="text-sm text-muted-foreground mb-4">
        Добавьте товары, чтобы начать покупки
      </p>
      <NuxtLink to="/catalog">
        <Button size="lg"> Начать покупки </Button>
      </NuxtLink>
    </div>

    <!-- Корзина с товарами -->
    <div
      v-else
      class="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8 items-start"
    >
      <!-- Список товаров -->
      <div class="lg:col-span-2 space-y-4">
        <!-- Прогресс бесплатной доставки -->
        <Card
          class="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20"
        >
          <CardContent class="p-4 sm:p-6">
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span v-if="!hasFreeShipping" class="text-sm font-medium">
                  До бесплатной доставки
                </span>
                <span
                  v-else
                  class="text-sm font-medium text-green-600 flex items-center gap-1"
                >
                  <Icon name="lucide:check-circle" class="w-4 h-4" />
                  Бесплатная доставка!
                </span>
                <span
                  v-if="!hasFreeShipping"
                  class="text-lg font-bold text-primary"
                >
                  {{ formatPrice(remainingForFreeShipping) }} ₸
                </span>
              </div>
              <Progress :model-value="shippingProgress" class="h-3" />
              <p v-if="!hasFreeShipping" class="text-xs text-muted-foreground">
                Добавьте товаров на
                {{ formatPrice(remainingForFreeShipping) }} ₸ для бесплатной
                доставки 🚚
              </p>
              <p v-else class="text-xs text-green-600 font-medium">
                🎉 Ура! Доставка за наш счет!
              </p>
            </div>
          </CardContent>
        </Card>

        <!-- Товары в корзине -->
        <div
          v-for="item in items"
          :key="item.product.id"
          class="border rounded-lg bg-card overflow-hidden hover:shadow-md transition-shadow"
        >
          <!-- Мобильная версия -->
          <div class="sm:hidden">
            <div class="flex gap-3 p-3">
              <!-- Изображение -->
              <NuxtLink
                :to="`/catalog/products/${item.product.slug}`"
                class="flex-shrink-0"
              >
                <div class="w-20 h-20 bg-muted rounded-md overflow-hidden">
                  <ProgressiveImage
                    v-if="getProductImageUrl(item.product)"
                    :src="getProductImageUrl(item.product)!"
                    :alt="item.product.name"
                    aspect-ratio="square"
                    object-fit="cover"
                    placeholder-type="shimmer"
                    class="w-full h-full"
                  />
                  <div
                    v-else
                    class="w-full h-full flex items-center justify-center text-muted-foreground text-xs"
                  >
                    Нет фото
                  </div>
                </div>
              </NuxtLink>

              <!-- Информация -->
              <div class="flex-1 min-w-0">
                <NuxtLink :to="`/catalog/products/${item.product.slug}`">
                  <h3
                    class="font-semibold text-sm line-clamp-2 mb-1 hover:text-primary transition-colors"
                  >
                    {{ item.product.name }}
                  </h3>
                </NuxtLink>
                <div class="flex items-center gap-2 mb-2">
                  <p class="text-sm font-medium">
                    {{
                      formatPrice(
                        item.product.final_price || item.product.price,
                      )
                    }}
                    ₸ / шт.
                  </p>
                  <p
                    v-if="item.product.discount_percentage"
                    class="text-xs text-muted-foreground line-through"
                  >
                    {{ formatPrice(item.product.price) }} ₸
                  </p>
                </div>
                <p class="font-bold text-base text-primary">
                  {{
                    formatPrice(
                      (item.product.final_price || item.product.price) *
                        item.quantity,
                    )
                  }}
                  ₸
                </p>
              </div>
            </div>

            <!-- Управление количеством -->
            <div
              class="flex items-center justify-between gap-2 px-3 pb-3 border-t pt-3 bg-muted/30"
            >
              <div class="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  class="h-8 w-8"
                  @click="
                    cartStore.updateQuantity(
                      item.product.id,
                      Math.max(1, item.quantity - 1),
                    )
                  "
                >
                  <Icon name="lucide:minus" class="h-3 w-3" />
                </Button>
                <span class="font-semibold text-sm min-w-[2rem] text-center">{{
                  item.quantity
                }}</span>
                <Button
                  variant="outline"
                  size="icon"
                  class="h-8 w-8"
                  @click="
                    cartStore.updateQuantity(item.product.id, item.quantity + 1)
                  "
                >
                  <Icon name="lucide:plus" class="h-3 w-3" />
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="text-destructive hover:text-destructive"
                @click="cartStore.removeItem(item.product.id)"
              >
                <Trash2 class="h-4 w-4 mr-1" />
                Удалить
              </Button>
            </div>
          </div>

          <!-- Десктопная версия -->
          <div class="hidden sm:flex items-center gap-4 p-4">
            <!-- Изображение товара -->
            <NuxtLink
              :to="`/catalog/products/${item.product.slug}`"
              class="flex-shrink-0"
            >
              <div
                class="w-24 h-24 bg-muted rounded-md overflow-hidden hover:opacity-80 transition-opacity"
              >
                <ProgressiveImage
                  v-if="getProductImageUrl(item.product)"
                  :src="getProductImageUrl(item.product)!"
                  :alt="item.product.name"
                  aspect-ratio="square"
                  object-fit="cover"
                  placeholder-type="shimmer"
                  class="w-full h-full"
                />
                <div
                  v-else
                  class="w-full h-full flex items-center justify-center text-muted-foreground text-xs"
                >
                  Нет фото
                </div>
              </div>
            </NuxtLink>

            <!-- Информация о товаре -->
            <div class="flex-grow">
              <NuxtLink :to="`/catalog/products/${item.product.slug}`">
                <h3 class="font-semibold hover:text-primary transition-colors">
                  {{ item.product.name }}
                </h3>
              </NuxtLink>
              <div class="flex items-center gap-2 mt-1">
                <p class="text-sm font-medium">
                  {{
                    formatPrice(item.product.final_price || item.product.price)
                  }}
                  ₸ / шт.
                </p>
                <p
                  v-if="item.product.discount_percentage"
                  class="text-xs text-muted-foreground line-through"
                >
                  {{ formatPrice(item.product.price) }} ₸
                </p>
              </div>
            </div>

            <!-- Управление количеством и ценой -->
            <div class="flex items-center gap-4">
              <div class="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  class="h-9 w-9"
                  @click="
                    cartStore.updateQuantity(
                      item.product.id,
                      Math.max(1, item.quantity - 1),
                    )
                  "
                >
                  <Icon name="lucide:minus" class="h-4 w-4" />
                </Button>
                <span
                  class="font-semibold text-base min-w-[2.5rem] text-center"
                  >{{ item.quantity }}</span
                >
                <Button
                  variant="outline"
                  size="icon"
                  class="h-9 w-9"
                  @click="
                    cartStore.updateQuantity(item.product.id, item.quantity + 1)
                  "
                >
                  <Icon name="lucide:plus" class="h-4 w-4" />
                </Button>
              </div>
              <p class="font-bold text-lg w-32 text-right text-primary">
                {{
                  formatPrice(
                    (item.product.final_price || item.product.price) *
                      item.quantity,
                  )
                }}
                ₸
              </p>
              <Button
                variant="ghost"
                size="icon"
                class="text-destructive hover:text-destructive"
                @click="cartStore.removeItem(item.product.id)"
              >
                <Trash2 class="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        <!-- Cross-sell: Рекомендованные аксессуары -->
        <AccessoriesBlock
          v-if="suggestedAccessories.length > 0"
          v-model:selected-ids="selectedAccessoryIds"
          :accessories="suggestedAccessories"
          :loading="isLoadingAccessories"
        />

        <!-- 🔥 Cross-sell: С этим товаром покупают -->
        <Card v-if="similarProducts.length > 0" class="border-blue-200">
          <CardHeader>
            <CardTitle class="text-lg flex items-center gap-2">
              <Icon name="lucide:shopping-bag" class="w-5 h-5 text-blue-600" />
              С этим товаром покупают
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
              <NuxtLink
                v-for="product in similarProducts"
                :key="product.id"
                :to="`/catalog/products/${product.slug}`"
                class="group"
              >
                <div
                  class="flex flex-col gap-2 p-3 rounded-lg border hover:border-blue-500 hover:shadow-md transition-all bg-white"
                >
                  <!-- Изображение -->
                  <div
                    class="w-full aspect-square rounded overflow-hidden bg-muted relative"
                  >
                    <ProgressiveImage
                      v-if="getProductImageUrl(product)"
                      :src="getProductImageUrl(product)!"
                      :alt="product.name"
                      aspect-ratio="square"
                      object-fit="contain"
                      placeholder-type="shimmer"
                      class="w-full h-full group-hover:scale-105 transition-transform duration-300"
                    />
                    <div
                      v-else
                      class="w-full h-full flex items-center justify-center"
                    >
                      <Icon
                        name="lucide:image-off"
                        class="w-8 h-8 text-muted-foreground"
                      />
                    </div>

                    <!-- Бейдж скидки -->
                    <div
                      v-if="
                        product.discount_percentage &&
                        product.discount_percentage > 0
                      "
                      class="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded"
                    >
                      -{{ product.discount_percentage }}%
                    </div>
                  </div>

                  <!-- Информация -->
                  <div class="space-y-1">
                    <!-- Бренд -->
                    <p
                      v-if="product.brands?.name"
                      class="text-xs text-muted-foreground line-clamp-1"
                    >
                      {{ product.brands.name }}
                    </p>

                    <!-- Название -->
                    <p
                      class="text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors min-h-[2.5rem]"
                    >
                      {{ product.name }}
                    </p>

                    <!-- Цена -->
                    <div class="flex flex-col gap-1">
                      <div class="flex items-center gap-2">
                        <p class="text-base font-bold text-primary">
                          {{
                            formatPrice(product.final_price || product.price)
                          }}
                          ₸
                        </p>
                        <p
                          v-if="
                            product.discount_percentage &&
                            product.discount_percentage > 0
                          "
                          class="text-xs text-muted-foreground line-through"
                        >
                          {{ formatPrice(product.price) }} ₸
                        </p>
                      </div>

                      <!-- Бонусы -->
                      <div
                        v-if="
                          product.bonus_points_award &&
                          product.bonus_points_award > 0
                        "
                        class="flex items-center gap-1 text-xs text-orange-600"
                      >
                        <Icon name="lucide:gift" class="w-3 h-3" />
                        <span>+{{ product.bonus_points_award }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </NuxtLink>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Итоги и кнопка оформления -->
      <aside class="lg:col-span-1 lg:sticky lg:top-24 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle class="text-xl"> Итого </CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- Бонусы -->
            <div
              class="flex items-center gap-2 px-3 py-2 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-lg text-sm"
            >
              <Icon name="lucide:gift" class="w-4 h-4 flex-shrink-0" />
              <span>
                За этот заказ вы получите
                <strong>+{{ bonusesToAward }} бонусов</strong> 🎁
              </span>
            </div>

            <Separator />

            <!-- Расчёты -->
            <div class="space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-muted-foreground"
                  >Товары ({{ totalItems }})</span
                >
                <span>{{ formatPrice(subtotal) }} ₸</span>
              </div>

              <!-- Выбранные аксессуары -->
              <div
                v-if="selectedAccessoryIds.length > 0"
                class="space-y-1"
              >
                <div
                  v-for="acc in suggestedAccessories.filter(a => selectedAccessoryIds.includes(a.id))"
                  :key="acc.id"
                  class="flex justify-between text-sm text-primary"
                >
                  <span class="line-clamp-1">{{ acc.name }}</span>
                  <span class="flex-shrink-0 ml-2">+{{ formatPrice(acc.final_price || acc.price) }} ₸</span>
                </div>
              </div>

              <div class="flex justify-between text-sm">
                <span class="text-muted-foreground">Доставка</span>
                <span v-if="hasFreeShipping" class="text-green-600 font-medium"
                  >Бесплатно</span
                >
                <span v-else>Рассчитается при оформлении</span>
              </div>
            </div>

            <Separator />

            <!-- Итого с flip-анимацией -->
            <div class="space-y-2">
              <div class="flex justify-between items-center">
                <span class="font-bold text-lg">К оплате:</span>
                <div class="flex items-center gap-1">
                  <div class="flex text-2xl font-bold text-primary">
                    <template v-for="(item, index) in priceChars" :key="index">
                      <!-- Space separator -->
                      <span v-if="item.char === ' '" class="w-1.5" />
                      <!-- Digit with flip animation -->
                      <div
                        v-else-if="item.isDigit"
                        :ref="
                          (el) => {
                            if (el)
                              digitColumns[item.digitIndex] = el as HTMLElement;
                          }
                        "
                        class="digit-column"
                      >
                        <div class="digit-ribbon">
                          <div v-for="d in 10" :key="d" class="digit-item">
                            {{ d - 1 }}
                          </div>
                        </div>
                      </div>
                      <!-- Other characters (like currency symbol inside formatted string) -->
                      <span v-else>{{ item.char }}</span>
                    </template>
                  </div>
                  <span class="text-2xl font-bold text-primary currency-symbol">₸</span>
                </div>
              </div>

              <!-- Кнопка добавления аксессуаров -->
              <Button
                v-if="selectedAccessoryIds.length > 0"
                size="sm"
                variant="outline"
                class="w-full"
                @click="addSelectedAccessoriesToCart"
              >
                <Icon name="lucide:plus-circle" class="w-4 h-4 mr-2" />
                Добавить {{ selectedAccessoryIds.length }} аксессуар(а)
              </Button>
            </div>

            <NuxtLink to="/checkout" class="w-full block">
              <Button size="lg" class="w-full">
                <Icon name="lucide:shopping-bag" class="w-5 h-5 mr-2" />
                Перейти к оформлению
              </Button>
            </NuxtLink>

            <Button size="lg" variant="outline" class="w-full" as-child>
              <NuxtLink to="/catalog"> Продолжить покупки </NuxtLink>
            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>

    <!-- 🎯 Sticky панель для мобильных -->
    <ClientOnly>
      <div
        v-if="items.length > 0"
        class="lg:hidden fixed left-4 right-4 z-40 cart-sticky-bar"
        :class="isNavVisible ? 'sticky-above-nav' : 'sticky-at-bottom'"
      >
        <div class="px-4 py-3">
          <div class="flex items-center justify-between gap-3 mb-3">
            <div class="flex flex-col gap-0.5">
              <span class="text-xs text-muted-foreground">Итого</span>
              <div class="flex items-center gap-0.5">
                <div class="flex text-2xl font-bold leading-none text-primary">
                  <template v-for="(item, index) in priceChars" :key="`mobile-${index}`">
                    <span v-if="item.char === ' '" class="w-1.5" />
                    <div
                      v-else-if="item.isDigit"
                      :ref="(el) => { if (el) mobileDigitColumns[item.digitIndex] = el as HTMLElement; }"
                      class="digit-column"
                    >
                      <div class="digit-ribbon">
                        <div v-for="d in 10" :key="d" class="digit-item">{{ d - 1 }}</div>
                      </div>
                    </div>
                    <span v-else>{{ item.char }}</span>
                  </template>
                </div>
                <span class="text-xl font-bold text-primary">₸</span>
              </div>
            </div>
            <div class="text-right">
              <p class="text-xs text-muted-foreground">Товары</p>
              <p class="text-sm font-semibold">{{ totalItems }} шт.</p>
            </div>
          </div>
          <NuxtLink to="/checkout" class="w-full block">
            <Button size="lg" class="w-full text-base font-semibold">
              <Icon name="lucide:shopping-bag" class="w-5 h-5 mr-2" />
              Перейти к оформлению
            </Button>
          </NuxtLink>
        </div>
      </div>
    </ClientOnly>
  </div>
</template>

<style scoped>
.cart-sticky-bar {
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

/* Flip counter styles */
.digit-column {
  position: relative;
  display: inline-block;
  width: 0.65em;
  height: 1.5em;
  overflow: hidden;
  line-height: 1.5em;
  text-align: center;
  vertical-align: baseline;
}

.digit-ribbon {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  will-change: transform;
}

.digit-item {
  height: 1.5em;
  line-height: 1.5em;
  text-align: center;
}
</style>
