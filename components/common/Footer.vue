<script setup lang="ts">
import { SHOP, SHOP_ADDRESS_FULL } from '@/constants/shop'
import { formatPrice } from '@/utils/formatPrice'

const currentYear = new Date().getFullYear()

const FOOTER_FOCUS_LINKS = [
  { name: 'Конструкторы LEGO', to: '/brand/lego' },
  { name: 'Радиоуправляемые машинки', to: '/catalog/boys/mashinki/radioupravlyaemye-mashinki' },
]
const supabase = useSupabaseClient()

// lazy: true — не блокируем SSR-рендер страницы, футер загружается параллельно
const { data: footerCategories } = useAsyncData('footer-categories', async () => {
  const { data } = await supabase
    .from('categories')
    .select('id, name, slug, href')
    .eq('is_featured', true)
    .order('display_order', { ascending: true })
    .limit(6)

  return data || []
}, { lazy: true, server: true })

const { data: popularProducts } = useAsyncData('footer-popular-products', async () => {
  const { data } = await supabase
    .from('products')
    .select('id, name, slug, price, final_price')
    .eq('is_active', true)
    .gt('stock_quantity', 0)
    .order('created_at', { ascending: false })
    .limit(5)

  return data || []
}, { lazy: true, server: true })
</script>

<template>
  <footer class="border-t bg-muted/30 mt-auto">
    <div class="container mx-auto px-4 py-8 md:py-12">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-8">
        <!-- О магазине -->
        <div>
          <h3 class="font-semibold text-lg mb-4">
            Ухтышка
          </h3>
          <p class="text-sm text-muted-foreground mb-4">
            Интернет-магазин детских игрушек в Алматы
          </p>
          <div class="flex flex-col gap-2 text-sm">
            <a
              href="tel:+77025379473"
              class="text-muted-foreground hover:text-foreground transition-colors"
            >
              +7 (702) 537-94-73
            </a>
            <a
              href="mailto:info@uhti.kz"
              class="text-muted-foreground hover:text-foreground transition-colors"
            >
              info@uhti.kz
            </a>
          </div>
        </div>

        <!-- Популярные категории -->
        <div>
          <h3 class="font-semibold text-lg mb-4">
            Популярные категории
          </h3>
          <ul class="space-y-2 text-sm">
            <template v-if="footerCategories?.length">
              <li v-for="category in footerCategories" :key="category.id">
                <NuxtLink
                  :to="category.href || `/catalog/${category.slug}`"
                  class="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {{ category.name }}
                </NuxtLink>
              </li>
            </template>
            <template v-else>
              <li v-for="i in 4" :key="`skeleton-${i}`">
                <div class="h-4 bg-muted rounded animate-pulse w-3/4" />
              </li>
            </template>
            <!--
              Две страницы, которые владелец 23 сентября 2026 назвал главными
              для поиска: по LEGO сайт на 25-м месте, по радиоуправляемым
              машинкам — на 24-м. Ссылка из подвала стоит на каждой странице
              сайта; до этого на них вели одна-две ссылки со всего сайта.
              Вне v-if: от загрузки избранных разделов ссылки не зависят.
            -->
            <li v-for="link in FOOTER_FOCUS_LINKS" :key="link.to">
              <NuxtLink
                :to="link.to"
                class="text-muted-foreground hover:text-foreground transition-colors"
              >
                {{ link.name }}
              </NuxtLink>
            </li>
          </ul>
        </div>

        <!-- Популярные товары -->
        <div>
          <h3 class="font-semibold text-lg mb-4">
            Хиты продаж
          </h3>
          <ul v-if="popularProducts?.length" class="space-y-2 text-sm">
            <li v-for="product in popularProducts" :key="product.id">
              <NuxtLink
                :to="`/catalog/products/${product.slug}`"
                class="text-muted-foreground hover:text-foreground transition-colors flex justify-between items-baseline gap-2"
              >
                <span class="truncate">{{ product.name }}</span>
                <span class="text-xs whitespace-nowrap font-medium">
                  {{ formatPrice(product.final_price || product.price) }}&nbsp;₸
                </span>
              </NuxtLink>
            </li>
          </ul>
          <ul v-else class="space-y-2 text-sm">
            <li v-for="i in 4" :key="`skeleton-${i}`">
              <div class="h-4 bg-muted rounded animate-pulse w-3/4" />
            </li>
          </ul>
        </div>

        <!-- Покупателям -->
        <div>
          <h3 class="font-semibold text-lg mb-4">
            Покупателям
          </h3>
          <ul class="space-y-2 text-sm">
            <li>
              <NuxtLink
                to="/catalog/all"
                class="text-muted-foreground hover:text-foreground transition-colors"
              >
                Каталог товаров
              </NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/cart"
                class="text-muted-foreground hover:text-foreground transition-colors"
              >
                Корзина
              </NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/profile/wishlist"
                class="text-muted-foreground hover:text-foreground transition-colors"
              >
                Избранное
              </NuxtLink>
            </li>
          </ul>
        </div>

        <!-- Информация -->
        <div>
          <h3 class="font-semibold text-lg mb-4">
            Информация
          </h3>
          <ul class="space-y-2 text-sm">
            <li>
              <NuxtLink
                to="/about"
                class="text-muted-foreground hover:text-foreground transition-colors"
              >
                О магазине
              </NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/privacy-policy"
                class="text-muted-foreground hover:text-foreground transition-colors"
              >
                Политика конфиденциальности
              </NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/terms"
                class="text-muted-foreground hover:text-foreground transition-colors"
              >
                Условия использования
              </NuxtLink>
            </li>
          </ul>
        </div>

        <!-- Контакты -->
        <div>
          <h3 class="font-semibold text-lg mb-4">
            Контакты
          </h3>
          <div class="space-y-2 text-sm text-muted-foreground">
            <p>{{ SHOP_ADDRESS_FULL }}</p>
            <!-- Часы работы видимым текстом: их не было на страницах вовсе,
                 только в разметке для роботов, а 42 заказа из 45 — самовывоз. -->
            <p>{{ SHOP.openingHoursHuman }}</p>
            <div class="flex gap-3 mt-4">
              <a
                href="https://wa.me/77025379473"
                target="_blank"
                rel="noopener noreferrer"
                class="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="WhatsApp"
              >
                <Icon name="lucide:message-circle" class="w-5 h-5" />
              </a>
              <a
                href="https://t.me/uhtikz"
                target="_blank"
                rel="noopener noreferrer"
                class="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Telegram"
              >
                <Icon name="lucide:send" class="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- Copyright -->
      <div class="mt-8 pt-8 border-t text-center text-sm text-muted-foreground">
        <p>&copy; {{ currentYear }} Ухтышка. Все права защищены.</p>
      </div>
    </div>
  </footer>
</template>
