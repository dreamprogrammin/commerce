/** «К закупке»: поставщики, активные товары и спрос по каждому — `server/utils/adminRestock.ts`. */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  return loadRestock(db)
})
