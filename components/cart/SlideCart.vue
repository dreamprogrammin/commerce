<script setup lang="ts">
import { useCartStore } from "@/stores/publicStore/cartStore";
import { useSupabaseStorage } from "@/composables/menuItems/useSupabaseStorage";
import { BUCKET_NAME_PRODUCT } from "@/constants";
import { formatPrice } from "@/utils/formatPrice";

const cartStore = useCartStore();
const router = useRouter();
const { getVariantUrl } = useSupabaseStorage();

// 🔥 Константа порога бесплатной доставки
const FREE_SHIPPING_THRESHOLD = 15000;

// Прогресс бесплатной доставки
const shippingProgress = computed(() => {
  const progress = (cartStore.subtotal / FREE_SHIPPING_THRESHOLD) * 100;
  return Math.min(progress, 100);
});

const remainingForFreeShipping = computed(() => {
  const remaining = FREE_SHIPPING_THRESHOLD - cartStore.subtotal;
  return remaining > 0 ? remaining : 0;
});

const hasFreeShipping = computed(
  () => cartStore.subtotal >= FREE_SHIPPING_THRESHOLD,
);

// Закрыть корзину
function closeCart() {
  cartStore.isCartOpen = false;
}

// Перейти к оформлению
function goToCheckout() {
  closeCart();
  router.push("/checkout");
}

// Получить URL изображения товара
function getProductImageUrl(product: any) {
  if (!product.product_images?.[0]?.image_url) return null;
  return getVariantUrl(
    BUCKET_NAME_PRODUCT,
    product.product_images[0].image_url,
    "sm",
  );
}
</script>

<template>
  <Sheet v-model:open="cartStore.isCartOpen">
    <SheetContent side="right" class="w-full sm:max-w-lg flex flex-col p-0">
      <!-- Заголовок -->
      <SheetHeader class="px-6 py-4 border-b">
        <SheetTitle class="flex items-center justify-between">
          <span class="text-xl font-bold">Корзина</span>
          <Badge variant="secondary" class="ml-2">
            {{ cartStore.totalItems }}
            {{ cartStore.totalItems === 1 ? "товар" : "товара" }}
          </Badge>
        </SheetTitle>
      </SheetHeader>

      <!-- Прогресс бесплатной доставки -->
      <div v-if="cartStore.items.length > 0" class="px-6 py-4 bg-muted/30">
        <div class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span v-if="!hasFreeShipping" class="text-muted-foreground">
              До бесплатной доставки
            </span>
            <span
              v-else
              class="text-green-600 font-medium flex items-center gap-1"
            >
              <Icon name="lucide:check-circle" class="w-4 h-4" />
              Бесплатная доставка!
            </span>
            <span v-if="!hasFreeShipping" class="font-semibold text-primary">
              {{ formatPrice(remainingForFreeShipping) }} ₸
            </span>
          </div>
          <Progress :model-value="shippingProgress" class="h-2" />
          <p v-if="!hasFreeShipping" class="text-xs text-muted-foreground">
            Добавьте товаров на {{ formatPrice(remainingForFreeShipping) }} ₸
            для бесплатной доставки 🚚
          </p>
          <p v-else class="text-xs text-green-600">
            🎉 Ура! Доставка за наш счет!
          </p>
        </div>
      </div>

      <!-- Список товаров -->
      <ScrollArea class="flex-1 px-6">
        <div
          v-if="cartStore.items.length === 0"
          class="flex flex-col items-center justify-center py-12 text-center"
        >
          <Icon
            name="lucide:shopping-cart"
            class="w-16 h-16 text-muted-foreground/50 mb-4"
          />
          <h3 class="text-lg font-semibold mb-2">Корзина пуста</h3>
          <p class="text-sm text-muted-foreground mb-4">
            Добавьте товары, чтобы начать покупки
          </p>
          <Button @click="closeCart"> Продолжить покупки </Button>
        </div>

        <div v-else class="space-y-4 py-4">
          <div
            v-for="item in cartStore.items"
            :key="item.product.id"
            class="flex gap-4 pb-4 border-b last:border-b-0"
          >
            <!-- Изображение -->
            <div
              class="w-20 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0"
            >
              <ProgressiveImage
                v-if="getProductImageUrl(item.product)"
                :src="getProductImageUrl(item.product)"
                :alt="item.product.name"
                aspect-ratio="square"
                object-fit="cover"
                placeholder-type="shimmer"
                class="w-full h-full"
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
            </div>

            <!-- Информация о товаре -->
            <div class="flex-1 min-w-0">
              <h4 class="font-medium text-sm leading-tight mb-1 line-clamp-2">
                {{ item.product.name }}
              </h4>

              <!-- Цена -->
              <div class="flex items-center gap-2 mb-2">
                <span class="font-semibold text-primary">
                  {{ formatPrice(item.product.price) }} ₸
                </span>
                <span
                  v-if="item.quantity > 1"
                  class="text-xs text-muted-foreground"
                >
                  × {{ item.quantity }}
                </span>
              </div>

              <!-- Контролы количества -->
              <div class="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  class="h-8 w-8"
                  @click="
                    cartStore.updateQuantity(item.product.id, item.quantity - 1)
                  "
                >
                  <Icon name="lucide:minus" class="w-4 h-4" />
                </Button>
                <span class="text-sm font-medium w-8 text-center">{{
                  item.quantity
                }}</span>
                <Button
                  size="icon"
                  variant="outline"
                  class="h-8 w-8"
                  @click="
                    cartStore.updateQuantity(item.product.id, item.quantity + 1)
                  "
                >
                  <Icon name="lucide:plus" class="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  class="h-8 w-8 ml-auto text-destructive hover:text-destructive"
                  @click="cartStore.removeItem(item.product.id)"
                >
                  <Icon name="lucide:trash-2" class="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>

      <!-- Футер с итогами и кнопкой оформления -->
      <div
        v-if="cartStore.items.length > 0"
        class="border-t px-6 py-4 space-y-4"
      >
        <!-- Бонусы -->
        <div
          class="flex items-center gap-2 px-3 py-2 bg-orange-50 text-orange-600 rounded-lg text-sm"
        >
          <Icon name="lucide:gift" class="w-4 h-4" />
          <span
            >За этот заказ вы получите
            <strong>+{{ cartStore.bonusesToAward }} бонусов</strong> 🎁</span
          >
        </div>

        <!-- Итого -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground"
              >Товары ({{ cartStore.totalItems }})</span
            >
            <span>{{ formatPrice(cartStore.subtotal) }} ₸</span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">Доставка</span>
            <span v-if="hasFreeShipping" class="text-green-600 font-medium"
              >Бесплатно</span
            >
            <span v-else>Рассчитается при оформлении</span>
          </div>
          <Separator />
          <div class="flex items-center justify-between text-lg font-bold">
            <span>Итого</span>
            <span class="text-primary"
              >{{ formatPrice(cartStore.total) }} ₸</span
            >
          </div>
        </div>

        <!-- Кнопки -->
        <div class="space-y-2">
          <Button size="lg" class="w-full" @click="goToCheckout">
            <Icon name="lucide:shopping-bag" class="w-5 h-5 mr-2" />
            Перейти к оформлению
          </Button>
          <Button size="lg" variant="outline" class="w-full" @click="closeCart">
            Продолжить покупки
          </Button>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
