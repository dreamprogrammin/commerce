/**
 * Прочесть скриншот Kaspi моделью со страницы «Модели ИИ». Картинку страница
 * сжимает до JPEG; здесь только проверка вида и размера.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ mediaType?: unknown, data?: unknown }>(event)
  const mediaType = body?.mediaType
  const data = body?.data
  if (mediaType !== 'image/jpeg' && mediaType !== 'image/png' && mediaType !== 'image/webp')
    throw createError({ statusCode: 400, message: 'Нужна картинка JPEG, PNG или WebP' })
  if (typeof data !== 'string' || !data || !/^[A-Z0-9+/]+={0,2}$/i.test(data))
    throw createError({ statusCode: 400, message: 'Нет картинки' })
  if (data.length > KASPI_IMAGE_MAX)
    throw createError({ statusCode: 413, message: 'Скриншот слишком большой' })
  return readKaspiScreenshot(db, { mediaType, data })
})
