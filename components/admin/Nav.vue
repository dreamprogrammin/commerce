<script setup lang="ts">
import { useAdminQuestionsStore } from '@/stores/adminStore/adminQuestionsStore'
import { useAdminReviewsStore } from '@/stores/adminStore/adminReviewsStore'
import { PURCHASING_PAGES } from '@/utils/smartPurchasing'

/*
 * Меню админки по макету AdminSidebar.dc.html (Claude Design, 9.11.2026):
 * группы с подписью, иконка у пункта, активный — синяя плашка с тенью,
 * счётчик — жёлтая пилюля. В макете 10 пунктов в «Главном» и «Магазине» —
 * они там же и под теми же названиями; остальные страницы макет не показывает,
 * но из меню их не убираем — разложены по группам того же вида.
 * Один список и для боковой панели, и для шторки на телефоне.
 */
const adminQuestionsStore = useAdminQuestionsStore()
const adminReviewsStore = useAdminReviewsStore()
const route = useRoute()

// Умный закуп — одним пунктом (владелец 3.11.2026: «собери всё в одном месте»,
// «лишнее с сайд-меню убрать»). Его страницы — кнопками на дашборде, и пункт
// горит на них так же, как на самом дашборде
const PURCHASING = '/admin/purchasing'

interface NavItem {
  to: string
  label: string
  icon: string
  exact?: boolean
  count?: () => number
  /** Ещё адреса, на которых пункт горит */
  also?: string[]
}

const groups: { title: string, items: NavItem[] }[] = [
  {
    title: 'Главное',
    items: [
      { to: '/admin', label: 'Дашборд', icon: 'lucide:layout-grid', exact: true },
      { to: PURCHASING, label: 'Умный закуп', icon: 'lucide:sparkles', also: PURCHASING_PAGES.map(p => p.to) },
      { to: '/admin/products', label: 'Товары', icon: 'lucide:package' },
      { to: '/admin/sales', label: 'Продажи', icon: 'lucide:receipt' },
      { to: '/admin/pos', label: 'Оффлайн касса', icon: 'lucide:store' },
      { to: '/admin/returns', label: 'Возвраты', icon: 'lucide:undo-2' },
      { to: '/admin/reports', label: 'Отчёты', icon: 'lucide:chart-column' },
    ],
  },
  {
    title: 'Магазин',
    items: [
      { to: '/admin/users', label: 'Пользователи', icon: 'lucide:users' },
      { to: '/admin/promotions', label: 'Акции', icon: 'lucide:percent' },
      { to: '/admin/broadcast', label: 'Рассылка', icon: 'lucide:mail' },
      { to: '/admin/kaspi-export', label: 'Выгрузка Kaspi', icon: 'lucide:upload' },
      { to: '/admin/carts', label: 'Корзины', icon: 'lucide:shopping-cart' },
      { to: '/admin/pickup-points', label: 'Пункты самовывоза', icon: 'lucide:map-pin' },
    ],
  },
  {
    title: 'Покупатели',
    items: [
      { to: '/admin/questions', label: 'Вопросы', icon: 'lucide:message-circle-question', count: () => adminQuestionsStore.unansweredCount },
      { to: '/admin/reviews', label: 'Отзывы', icon: 'lucide:star', count: () => adminReviewsStore.unpublishedCount },
    ],
  },
  {
    title: 'Каталог',
    items: [
      { to: '/admin/categories', label: 'Меню и категории', icon: 'lucide:list-tree' },
      { to: '/admin/popular-categories', label: 'Популярные категории', icon: 'lucide:flame' },
      { to: '/admin/brands', label: 'Бренды', icon: 'lucide:tag' },
      { to: '/admin/attributes', label: 'Атрибуты', icon: 'lucide:sliders-horizontal' },
    ],
  },
  {
    title: 'Витрина и SEO',
    items: [
      { to: '/admin/slides', label: 'Слайды', icon: 'lucide:gallery-horizontal' },
      { to: '/admin/banners', label: 'Баннеры', icon: 'lucide:image' },
      { to: '/admin/brand-seo', label: 'SEO: бренд + категория', icon: 'lucide:search' },
      { to: '/admin/image-seo', label: 'SEO: alt-тексты фото', icon: 'lucide:image-play' },
    ],
  },
]

const under = (path: string, to: string) => path === to || path.startsWith(`${to}/`)
function isActive(item: NavItem): boolean {
  if (item.exact)
    return route.path === item.to
  return [item.to, ...(item.also ?? [])].some(to => under(route.path, to))
}
</script>

<template>
  <nav class="flex flex-col gap-[22px]" aria-label="Разделы админки">
    <div v-for="g in groups" :key="g.title" class="flex flex-col gap-0.5">
      <span class="px-3 pb-1.5 text-xs font-medium text-muted-foreground">{{ g.title }}</span>
      <NuxtLink
        v-for="item in g.items"
        :key="item.to"
        :to="item.to"
        class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors"
        :class="isActive(item)
          ? 'bg-primary font-semibold text-white shadow-[0_6px_16px_rgba(43,127,255,0.3)]'
          : 'font-medium text-foreground hover:bg-muted'"
        :aria-current="isActive(item) ? 'page' : undefined"
        data-testid="admin-nav-link"
      >
        <Icon :name="item.icon" class="shrink-0 text-[18px]" />
        <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
        <span
          v-if="item.count && item.count() > 0"
          class="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums"
          :class="isActive(item) ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700'"
          data-testid="admin-nav-count"
        >{{ item.count() }}</span>
      </NuxtLink>
    </div>
  </nav>
</template>
