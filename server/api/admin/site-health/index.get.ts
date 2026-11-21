/** «Состояние сайта» и платные сервисы для дашборда админки (21.11.2026) */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  return siteHealthPage(db)
})
