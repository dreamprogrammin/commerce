<script setup lang="ts">
import { storeToRefs } from 'pinia'
import ProfileNav from '@/components/profile/ProfileNav.vue'
import { useAuthStore } from '@/stores/core/useAuthStore'

/**
 * Обвязка личного кабинета: гейт авторизации, фон, навигация и колонки.
 *
 * Раньше всё это было макетом `layouts/Profile.vue`. Переехало в компонент,
 * когда страницы профиля перевели на общую оболочку `Shell.vue`.
 *
 * Почему не через настройку оболочки, как у оформления. У оформления обвязка
 * стоит НАД содержимым — её достаточно отрисовать рядом. Здесь боковое меню
 * обнимает содержимое, то есть страница лежит внутри чужой раскладки. Сделать
 * это условной обёрткой в самой оболочке нельзя: положение страницы в дереве
 * менялось бы от маршрута к маршруту, и Vue пересоздавал бы её на каждом
 * переходе — на этом уже спотыкались корзина и оформление (см. `grow` в
 * lib/shell.ts). Поэтому обвязку разворачивает сама страница.
 */
const authStore = useAuthStore()
const { isLoggedIn } = storeToRefs(authStore)
const route = useRoute()

// Страницы, уже переведённые на новый дизайн, рисуют карточки сами.
// Остальные пока живут внутри общей карточки-обёртки — снимаем её по мере
// переноса.
const isBare = computed(() => route.meta.profileBare === true)

// SEO: личный кабинет закрыт от индексации.
useHead({
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>

<template>
  <!-- Показываем только авторизованным: middleware уже откроет окно входа и
       прервёт навигацию, здесь защита от гонки. -->
  <!-- Ни высоты, ни фона: и то и другое живёт на корне оболочки. Полный
       экран здесь добавлял бы к странице высоту шапки (замер поймал ровно
       +74px), а процентная высота внутри flex не срабатывает вовсе —
       градиент покрывал 739px из 826. -->
  <div v-if="isLoggedIn">
    <div
      class="mx-auto w-full max-w-[1240px] px-4 pt-[76px] pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 lg:pt-5 lg:pb-10"
    >
      <!-- Узкий экран: навигация чипсами, в край экрана -->
      <div class="-mx-4 mb-3.5 sm:-mx-6 lg:hidden">
        <ProfileNav mobile class="px-4 sm:px-6" />
      </div>

      <div class="lg:flex lg:items-start lg:gap-[26px]">
        <!-- Широкий экран: боковое меню -->
        <aside
          class="profile-scroll sticky top-5 hidden max-h-[calc(100vh-40px)] w-[264px] flex-none overflow-y-auto lg:block"
        >
          <ProfileNav />
        </aside>

        <div
          class="min-w-0 flex-1"
          :class="
            isBare
              ? ''
              : 'rounded-[18px] border border-border bg-white p-4 shadow-sm sm:p-6'
          "
        >
          <slot />
        </div>
      </div>
    </div>
  </div>

  <!-- Не авторизован — крутилка на случай гонки. -->
  <div v-else class="min-h-[60vh] flex items-center justify-center">
    <div class="text-center space-y-4">
      <div
        class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"
      />
      <p class="text-muted-foreground">
        Проверка авторизации...
      </p>
    </div>
  </div>
</template>

<style scoped>
/* Стили намеренно лежат в @layer components.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты Tailwind
   живут в @layer utilities. Бесслойное правило бьёт слой независимо от
   специфичности, поэтому свой класс молча отменял бы утилиту на том же
   элементе (так на проекте умирали `hidden`, `lg:flex` и `gap-[...]`).

   Подробности и порядок слоёв: docs/SCOPED_STYLES_TAILWIND_LAYERS.md */

@layer components {
  .profile-scroll {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .profile-scroll::-webkit-scrollbar {
    display: none;
  }
}
</style>
