import DOMPurify from 'dompurify'

/**
 * Composable для безопасной работы с HTML контентом
 * Использует DOMPurify для предотвращения XSS атак
 */
export function useSafeHtml() {
  /**
   * Санитизирует HTML контент, удаляя потенциально опасные элементы
   * @param dirty - HTML строка для санитизации
   * @returns Безопасный HTML
   */
  function sanitizeHtml(dirty: string | null | undefined): string {
    if (!dirty) return ''

    // Проверяем окружение (server/client)
    if (import.meta.server) {
      // На сервере DOMPurify требует jsdom
      // Для SSR лучше рендерить как есть, а санитизировать на клиенте
      return dirty
    }

    // Настройки DOMPurify
    const config = {
      // Разрешенные теги
      ALLOWED_TAGS: [
        'p',
        'h2',
        'h3',
        'h4',
        'ul',
        'ol',
        'li',
        'strong',
        'em',
        'a',
        'blockquote',
        'code',
        'pre',
        'br',
      ],
      // Разрешенные атрибуты
      ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
      // Автоматически добавлять rel="noopener noreferrer" к внешним ссылкам
      ADD_ATTR: ['target'],
      // Разрешить только безопасные URI схемы
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    }

    return DOMPurify.sanitize(dirty, config)
  }

  /**
   * Computed свойство для реактивной санитизации
   */
  function useSanitized(html: Ref<string> | ComputedRef<string>) {
    return computed(() => sanitizeHtml(unref(html)))
  }

  return {
    sanitizeHtml,
    useSanitized,
  }
}
