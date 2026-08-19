<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useHomeStickySearch } from '@/composables/useHomeChrome'
import { carouselContainerVariants } from '@/lib/variants'
import { useProfileStore } from '@/stores/core/profileStore'
import { useAuthStore } from '@/stores/core/useAuthStore'
import { useModalStore } from '@/stores/modal/useModalStore'

/**
 * Мобильная липкая строка: поиск + бонусы/вход + уведомления
 * (Homepage.dc.html: mobile search + bonus row).
 *
 * Заменяет удалённую мобильную шапку. Прилипает к верху через нулевой сентинел
 * (useHomeStickySearch); в момент прилипания подставляется распорка, чтобы лист
 * не «дёрнулся». Показывается только на мобильном (< lg) — обёртка в index.vue.
 */
const authStore = useAuthStore()
const profileStore = useProfileStore()
const modalStore = useModalStore()

// Ширина ровно как у секций страницы: фон/блюр тянутся на всю ширину,
// содержимое живёт в общем контейнере (в т.ч. когда строка прилипла).
const containerClass = carouselContainerVariants({ contained: 'always' })

const { isLoggedIn, user } = storeToRefs(authStore)
const { bonusBalance } = storeToRefs(profileStore)

onMounted(() => {
  if (user.value && !profileStore.profile)
    profileStore.loadProfile()
})

const bonusLabel = computed(() =>
  `${(bonusBalance.value ?? 0).toLocaleString('ru-KZ')} ₸`,
)

const sentinelEl = ref<HTMLElement | null>(null)
const searchRowEl = ref<HTMLElement | null>(null)
const { isSearchStuck, stuckRowHeight } = useHomeStickySearch({
  sentinelEl,
  searchRowEl,
})

const isSearchOpen = ref(false)
function openSearch() {
  isSearchOpen.value = true
}
function onLogin() {
  modalStore.openLoginModal()
}
</script>

<template>
  <div>
    <div ref="sentinelEl" class="h-0" />
    <div
      ref="searchRowEl"
      class="sticky-row"
      :class="{ 'sticky-row--stuck': isSearchStuck }"
    >
      <div :class="containerClass" class="sticky-row__inner">
        <button type="button" class="sticky-row__search" @click="openSearch">
          <Icon name="lucide:search" class="size-[22px] text-muted-foreground shrink-0" />
          <span class="sticky-row__placeholder">Найти товары</span>
        </button>

        <ClientOnly>
          <div v-if="isLoggedIn" class="sticky-row__bonus">
            <Icon name="lucide:coins" class="size-[18px]" />
            {{ bonusLabel }}
          </div>
          <button v-else type="button" class="sticky-row__login" @click="onLogin">
            <Icon name="lucide:user" class="size-[18px]" />
            Войти
          </button>
        </ClientOnly>

        <ClientOnly>
          <CommonNotificationBell v-if="isLoggedIn" />
        </ClientOnly>
      </div>
    </div>

    <!-- распорка под fixed-строкой -->
    <div :style="{ height: isSearchStuck ? `${stuckRowHeight}px` : '0px' }" />

    <SearchDrawer v-model:is-open="isSearchOpen" />
  </div>
</template>

<style scoped>
/* Стили ниже намеренно лежат в @layer components.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты
   Tailwind живут в @layer utilities. Беслойное правило бьёт слой независимо
   от специфичности, поэтому свой класс молча отменял бы утилиту на том же
   элементе (так на проекте умирали `hidden`, `lg:flex` и `gap-[...]`).

   Внутри слоя порядок нормальный: components объявлен раньше utilities, и
   утилита всегда перебивает класс. Значит раскладку можно править классом
   в разметке, не трогая этот блок.

   Подробности и порядок слоёв: docs/SCOPED_STYLES_TAILWIND_LAYERS.md */

@layer components {
  /* Боковые отступы задаёт контейнер на .sticky-row__inner — здесь только
     вертикальные, иначе строка разъедется с секциями страницы. */
  .sticky-row {
    padding: 16px 0 4px;
    position: relative;
    z-index: 1;
  }

  .sticky-row__inner {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .sticky-row--stuck {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    padding: 10px 0;
    background: rgb(255 255 255 / 0.86);
    -webkit-backdrop-filter: blur(20px) saturate(1.4);
    backdrop-filter: blur(20px) saturate(1.4);
    box-shadow: 0 6px 20px rgb(15 23 42 / 0.1);
  }

  .sticky-row__search {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 52px;
    padding: 0 18px;
    background: var(--muted);
    border: none;
    border-radius: 16px;
    cursor: pointer;
    text-align: left;
  }

  .sticky-row__placeholder {
    color: var(--muted-foreground);
    font-weight: 500;
    font-size: 16px;
  }

  .sticky-row__bonus {
    flex: none;
    height: 52px;
    padding: 0 16px;
    border-radius: 16px;
    background: var(--bonus-surface);
    border: 1px solid var(--bonus-border);
    color: var(--bonus);
    font-weight: 800;
    font-size: 15px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .sticky-row__login {
    flex: none;
    height: 52px;
    padding: 0 18px;
    border: none;
    border-radius: 16px;
    background: var(--primary);
    color: #fff;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    transition: background 0.15s ease;
  }

  .sticky-row__login:hover {
    background: var(--brand-hover);
  }

  :global(.dark) .sticky-row--stuck {
    background: rgb(20 20 20 / 0.86);
  }
}
</style>
