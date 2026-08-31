/**
 * Типизация `meta.shell` для макета `layouts/Shell.vue`.
 *
 * Без этого `route.meta.shell` имеет тип `unknown`, и макет пришлось бы
 * приводить вручную.
 */
import type { ShellOptions } from '@/lib/shell'

declare module 'vue-router' {
  interface RouteMeta {
    /** Настройки оболочки страницы: шапка, подвал, отступы. */
    shell?: ShellOptions
  }
}

export {}
