import type { SiteHealthPage } from '@/utils/siteHealth'

const loadSiteHealth = () => adminFetch<SiteHealthPage>('/api/admin/site-health')

/**
 * Сводка «Состояние сайта» для дашборда — одна на страницу: строка над
 * продажами (AdminSiteHealthStrip) и карточки внизу (AdminSiteHealthPanel)
 * берут её по одному ключу. `dedupe: 'defer'` — второй вызов ждёт уже
 * идущий запрос: по умолчанию ('cancel') он отменял бы первый и слал свой,
 * а сервер всё равно отрабатывал бы оба.
 */
export function useSiteHealth() {
  return useAsyncData('admin-site-health', loadSiteHealth, { server: false, dedupe: 'defer' })
}
