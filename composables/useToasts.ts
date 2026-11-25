import { Icon } from '#components'
import { h } from 'vue'
import { toast } from 'vue-sonner'
import { isBottomNavShown } from '@/composables/useCartAdded'

/**
 * Уведомления по макету «Тосты.dc.html».
 *
 * Библиотека прежняя (vue-sonner), вид задан в `assets/css/toast.css`. Здесь
 * собраны только те тосты, которым макет дал собственный разговор: заголовок,
 * название товара отдельной строкой и действие прямо в уведомлении.
 *
 * Всё остальное приложение продолжает звать `toast.success/error/info`
 * напрямую — они выглядят так же, просто без фотографии и действия.
 */

/** Чип с иконкой, а рядом — фотография товара, если она есть. */
function figure(icon: string, thumbUrl?: string | null) {
  return () =>
    h('span', { class: 'uh-toast-figure' }, [
      h('span', { class: 'uh-toast-chip' }, [h(Icon, { name: icon, mode: 'svg' })]),
      thumbUrl
        ? h('span', { class: 'uh-toast-thumb' }, [
            h('img', { src: thumbUrl, alt: '', loading: 'lazy' }),
          ])
        : null,
    ])
}

interface RichToast {
  title: string
  /** Название товара: показывается второй строкой, не длиннее двух строк. */
  description?: string | null
  icon: string
  thumbUrl?: string | null
  /** Класс задаёт акцент там, где типа тоста не хватает (бонусы, избранное). */
  accentClass?: string
  /**
   * Описание — название товара: на телефоне оно в одну строку (тост там
   * плотнее, см. toast.css). Остальным описаниям — ошибкам, бонусам — строки
   * не урезаются: в них смысл, а не подпись.
   */
  product?: boolean
  type?: 'success' | 'info' | 'error'
  action?: { label: string, onClick: () => void }
}

function show({ title, description, icon, thumbUrl, accentClass, product, type, action }: RichToast) {
  const options = {
    description: description || undefined,
    icon: figure(icon, thumbUrl),
    class: ['uh-toast--rich', product && 'uh-toast--product', accentClass].filter(Boolean).join(' '),
    action,
  }

  if (type === 'error')
    return toast.error(title, options)
  if (type === 'info')
    return toast.info(title, options)
  return toast.success(title, options)
}

export function useToasts() {
  return {
    /**
     * Товар положили в корзину.
     *
     * Только там, где нет нижней панели (десктоп, админка): на телефоне и
     * планшете о добавлении говорит она сама — подсказкой над корзиной и
     * кольцом пути до бесплатной доставки (макет MobileNav.dc.html, см.
     * `composables/useCartAdded.ts`).
     */
    cartAdded(name: string, thumbUrl?: string | null) {
      if (isBottomNavShown())
        return
      show({
        title: 'Добавили в корзину',
        description: name,
        icon: 'solar:cart-3-bold',
        thumbUrl,
        product: true,
        action: {
          label: 'Перейти в корзину',
          onClick: () => {
            navigateTo('/cart')
          },
        },
      })
    },

    /** Товар убрали из корзины — с возвратом, пока тост на экране. */
    cartRemoved(name: string, undo: () => void, thumbUrl?: string | null) {
      show({
        title: 'Товар убрали из корзины',
        description: name,
        icon: 'lucide:trash-2',
        thumbUrl,
        product: true,
        type: 'info',
        action: { label: 'Вернуть', onClick: undo },
      })
    },

    /** Начисление бонусов. */
    bonusEarned(points: number, description = 'Начислим на счёт после получения заказа') {
      show({
        title: `+${points} бонусов`,
        description,
        icon: 'lucide:gift',
        accentClass: 'uh-toast--bonus',
      })
    },

    /** Избранное. */
    wishAdded(name: string) {
      show({
        title: 'Добавили в избранное',
        description: name,
        icon: 'line-md:heart-filled',
        accentClass: 'uh-toast--wish',
        product: true,
        action: {
          label: 'Смотреть избранное',
          onClick: () => {
            navigateTo('/profile/wishlist')
          },
        },
      })
    },

    wishRemoved(name: string) {
      show({
        title: 'Убрали из избранного',
        description: name,
        icon: 'line-md:heart',
        accentClass: 'uh-toast--wish',
        product: true,
        type: 'info',
      })
    },

    /** Не получилось — с повтором, если есть что повторять. */
    failed(title: string, description?: string, retry?: () => void) {
      show({
        title,
        description: description ?? 'Проверьте соединение и попробуйте ещё раз',
        icon: 'lucide:circle-alert',
        type: 'error',
        action: retry ? { label: 'Повторить', onClick: retry } : undefined,
      })
    },
  }
}
