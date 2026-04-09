/**
 * Генерация SEO-оптимизированных alt текстов для изображений товаров
 * 
 * Формат: [Бренд] [Название товара] [Серия] [Контекст]
 * Пример: "LEGO Конструктор Железный Человек Marvel купить в Казахстане"
 */

interface ProductAltTextData {
  productName: string
  brandName?: string
  lineName?: string
  index: number
  totalImages: number
}

export function useSeoAltText() {
  /**
   * Генерирует SEO-оптимизированный alt текст для изображения товара
   */
  function generateProductImageAlt(data: ProductAltTextData): string {
    const { productName, brandName, lineName, index, totalImages } = data
    const parts: string[] = []

    // 1. Бренд (если есть)
    if (brandName) {
      parts.push(brandName)
    }

    // 2. Название товара (обязательно)
    parts.push(productName)

    // 3. Серия/линейка (если есть)
    if (lineName) {
      parts.push(lineName)
    }

    // 4. Контекст в зависимости от позиции изображения
    if (index === 0) {
      // Первое фото - самое важное для SEO
      parts.push('купить в Казахстане')
    } else if (index === 1 && totalImages > 1) {
      // Второе фото - обычно показывает товар с другого ракурса
      parts.push('вид сбоку')
    } else if (index === 2 && totalImages > 2) {
      // Третье фото - детали
      parts.push('детальное фото')
    } else if (index === totalImages - 1 && totalImages > 3) {
      // Последнее фото - упаковка или комплектация
      parts.push('в упаковке')
    } else {
      // Остальные фото
      parts.push(`фото ${index + 1}`)
    }

    return parts.join(' ')
  }

  /**
   * Генерирует alt текст для логотипа бренда
   */
  function generateBrandLogoAlt(brandName: string): string {
    return `Логотип ${brandName}`
  }

  /**
   * Генерирует alt текст для логотипа серии
   */
  function generateLineLogoAlt(lineName: string, brandName?: string): string {
    if (brandName) {
      return `Логотип серии ${lineName} от ${brandName}`
    }
    return `Логотип серии ${lineName}`
  }

  return {
    generateProductImageAlt,
    generateBrandLogoAlt,
    generateLineLogoAlt,
  }
}
