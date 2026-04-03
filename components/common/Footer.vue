<script setup lang="ts">
const currentYear = new Date().getFullYear();
</script>

<template>
  <footer class="border-t bg-muted/30 mt-auto">
    <div class="container mx-auto px-4 py-8 md:py-12">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
        <!-- О магазине -->
        <div>
          <h3 class="font-semibold text-lg mb-4">Ухтышка</h3>
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

        <!-- Покупателям -->
        <div>
          <h3 class="font-semibold text-lg mb-4">Покупателям</h3>
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
                to="/returns"
                class="text-muted-foreground hover:text-foreground transition-colors"
              >
                Возврат и обмен
              </NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/profile/orders"
                class="text-muted-foreground hover:text-foreground transition-colors"
              >
                Мои заказы
              </NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/profile/bonuses"
                class="text-muted-foreground hover:text-foreground transition-colors"
              >
                Бонусная программа
              </NuxtLink>
            </li>
          </ul>
        </div>

        <!-- Информация -->
        <div>
          <h3 class="font-semibold text-lg mb-4">Информация</h3>
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
          <h3 class="font-semibold text-lg mb-4">Контакты</h3>
          <div class="space-y-2 text-sm text-muted-foreground">
            <p>г. Алматы, Казахстан</p>
            <p>мкр. Шапагат, ул. Амангельды</p>
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
