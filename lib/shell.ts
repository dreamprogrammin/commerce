import type { MaybeRefOrGetter, ShallowRef } from 'vue'

/**
 * Настройки оболочки страницы для макета `Shell.vue`.
 *
 * Страница объявляет их в `definePageMeta({ shell: ... })`. Раньше каждое
 * такое сочетание было отдельным макетом, из-за чего переход между страницами
 * уничтожал дерево целиком — см. комментарий в `layouts/Shell.vue`.
 */
export interface ShellOptions {
  /** Шапка на десктопе. `none` — не показывать вовсе. */
  header?: 'overlay' | 'default' | 'static' | 'none'
  /**
   * Показывать ли шапку и на узком экране.
   *
   * На витрине её роль там играет герой или собственный таббар страницы,
   * поэтому по умолчанию шапка только десктопная. У флоу оформления своего
   * мобильного заголовка нет, и прежний `Checkout.vue` рисовал `SiteHeader`
   * без обёртки — он сам подстраивается под ширину. Без этого флага шапка на
   * мобилке пропадала.
   */
  headerOnMobile?: boolean
  /** Собственная шапка на узком экране. */
  mobileHeader?: 'catalog' | 'app' | 'none'
  /**
   * Обвязка поверх содержимого: шаги заказа и локейшн-панель.
   *
   * Живёт отдельным компонентом (`OrderCheckoutChrome`), а не в самой
   * оболочке: оболочка не должна знать про шаги заказа.
   */
  chrome?: 'checkout' | 'none'
  /**
   * Собственный фон страницы.
   *
   * `surface` — у карточки товара, `profile` — градиент личного кабинета.
   * Фон живёт на корне оболочки, а не внутри страницы: в личном кабинете он
   * должен покрывать и область под шапкой, а процентная высота внутри
   * flex-потомка не срабатывает — замер поймал 739px градиента на 826px
   * содержимого.
   */
  background?: 'none' | 'surface' | 'profile'
  /**
   * Растягивать ли `<main>` во всю высоту (`flex-1`).
   *
   * Сам `<main>` рисуется ВСЕГДА, даже там, где прежний макет обходился без
   * него. Условная обёртка меняет положение страницы в дереве, и Vue
   * пересоздаёт её при каждом переходе — удержание при этом молча
   * перестаёт работать. Проверено меткой 1 сентября: через каталог главная
   * переживала переход, через корзину — нет.
   */
  grow?: boolean
  /** Подвал. `layered` нужен там, где под ним фиксированный герой. */
  footer?: 'layered' | 'plain' | 'none'
  /**
   * Отступ сверху у `<main>` на узком экране, под фиксированный таббар.
   * Значение в пикселях: у таббара каталога 56, у общего таббара 76.
   */
  padTop?: 0 | 56 | 76
  /** Резерв под нижнюю навигацию у `<main>` на узком экране. */
  padBottom?: boolean
}

/** Прежний `CatalogListing.vue`: обычная нелипкая шапка, обычный подвал. */
export const catalogShell: Required<ShellOptions> = {
  background: 'none',
  headerOnMobile: false,
  header: 'static',
  mobileHeader: 'none',
  chrome: 'none',
  grow: true,
  footer: 'plain',
  padTop: 0,
  padBottom: true,
}

/** Прежний `Home.vue`: шапка поверх героя, подвал в слое, отступов нет. */
export const homeShell: Required<ShellOptions> = {
  background: 'none',
  headerOnMobile: false,
  header: 'overlay',
  mobileHeader: 'none',
  chrome: 'none',
  grow: true,
  footer: 'layered',
  padTop: 0,
  padBottom: false,
}

/** Прежний `Catalog.vue`: обычная шапка, мобильный таббар, без подвала. */
export const catalogRootShell: Required<ShellOptions> = {
  background: 'none',
  headerOnMobile: false,
  header: 'default',
  mobileHeader: 'catalog',
  chrome: 'none',
  grow: true,
  footer: 'none',
  padTop: 56,
  padBottom: true,
}

/**
 * Прежний `Checkout.vue`: обычная шапка, обвязка шагов заказа, без подвала.
 *
 * `grow: false` — прежний макет не растягивал содержимое во всю высоту.
 */
export const checkoutShell: Required<ShellOptions> = {
  background: 'none',
  headerOnMobile: true,
  header: 'default',
  mobileHeader: 'none',
  chrome: 'checkout',
  grow: false,
  footer: 'none',
  padTop: 0,
  padBottom: false,
}

/**
 * Прежний `ProductDetail.vue`: липкая шапка, свой фон, обычный подвал.
 *
 * Мобильный тулбар карточки — часть содержимого страницы
 * (`ProductMobileHeader`), а не оболочки: он `position: sticky` и сам
 * резервирует высоту в потоке, поэтому `padTop` здесь не нужен.
 */
export const productShell: Required<ShellOptions> = {
  background: 'surface',
  headerOnMobile: false,
  header: 'default',
  mobileHeader: 'none',
  chrome: 'none',
  grow: true,
  footer: 'plain',
  padTop: 0,
  padBottom: true,
}

/**
 * Прежний `default.vue`: липкая шапка, общий мобильный таббар, обычный подвал.
 *
 * Сюда переехали страницы, у которых не было своего макета: бренды, «о нас»,
 * правовые тексты, регистрация, уведомления. Пока они жили на `default`,
 * переход на них уничтожал оболочку целиком — и на экране оставалась прежняя
 * страница, уже подскочившая наверх (замер 1 сентября, `/brands`: 976 мс).
 */
export const pageShell: Required<ShellOptions> = {
  background: 'none',
  headerOnMobile: false,
  header: 'default',
  mobileHeader: 'app',
  chrome: 'none',
  grow: true,
  footer: 'plain',
  padTop: 76,
  padBottom: true,
}

/**
 * Личный кабинет: липкая шапка, общий мобильный таббар, без подвала.
 *
 * Отступы и фон разворачивает сама страница через `ProfileShell` — боковое
 * меню обнимает содержимое, и условной обёрткой в оболочке это не сделать.
 */
export const profilePageShell: Required<ShellOptions> = {
  background: 'profile',
  headerOnMobile: false,
  header: 'default',
  mobileHeader: 'app',
  chrome: 'none',
  grow: true,
  footer: 'none',
  padTop: 0,
  padBottom: false,
}

/**
 * Разовая правка оболочки от самой страницы.
 *
 * `definePageMeta` статичен, а `pages/brand/[slug].vue` обслуживает и обычные
 * бренды, и лендинг: у лендинга своя липкая панель разделов, и вторая липкая
 * шапка над ней — это две полосы друг на друге. Менять `meta.shell` на всю
 * страницу нельзя, иначе шапка перестанет липнуть у остальных 31 бренда.
 *
 * Поэтому страница выставляет правку на время своей жизни, а оболочка
 * подмешивает её поверх `meta.shell`.
 *
 * ГДЕ ЛЕЖИТ ПРАВКА — в `nuxtApp`, а не в переменной модуля. До 23 сентября
 * 2026 была переменная модуля, и на этом стояли две ошибки, обе на бою:
 *
 * 1. Сервер. Модуль там один на все запросы, а `onScopeDispose` при серверной
 *    отрисовке не вызывается. Правка лендинга LEGO переживала свой запрос, и
 *    следующие страницы того же процесса уходили с нелипкой шапкой: на бою
 *    в разметке `/about`, `/terms`, `/brands`, `/brand/mokatoys` стояло
 *    `position:static`. Клиент ждал липкую — расхождение гидратации, в DOM
 *    оставались `static` и распорка под fixed-шапку, и над шапкой висела
 *    пустая полоса 74 px до первой прокрутки. `nuxtApp` на сервере свой у
 *    каждого запроса.
 * 2. Клиент. `<NuxtPage :keepalive>` в `app.vue` удерживает ВСЕ страницы
 *    (атрибут главнее флага страницы), и при уходе с LEGO её scope не
 *    умирал: шапка оставалась нелипкой на следующих страницах. Поэтому
 *    правка снимается и при уходе в кэш, а при возврате ставится снова.
 *
 * И КОГДА — после монтирования, а не в `setup`. Пока страница грузится, её
 * `<Suspense>` ждёт, и перерисовка макета в этот момент ломала удержание:
 * `NuxtPage` при уходе пересоздавал `Suspense`, удержанная LEGO оставалась
 * привязанной к уничтоженной границе, и возврат на неё падал с «Cannot read
 * properties of null (reading 'suspenseId')». На бою с LEGO любой уход и
 * «Назад» оставлял на экране прежнюю страницу под адресом `/brand/lego`.
 * Без правки в `setup` — проверено отключением — возврат работает.
 */
type ShellOverrideSource = MaybeRefOrGetter<Partial<ShellOptions> | null>

const overrideSlots = new WeakMap<object, ShallowRef<ShellOverrideSource>>()

function overrideSlot(): ShallowRef<ShellOverrideSource> {
  const nuxtApp = useNuxtApp()
  let slot = overrideSlots.get(nuxtApp)
  if (!slot) {
    slot = shallowRef<ShellOverrideSource>(null)
    overrideSlots.set(nuxtApp, slot)
  }
  return slot
}

/** Читает оболочка. */
export function useShellOverride() {
  const slot = overrideSlot()
  return computed(() => toValue(slot.value))
}

/**
 * Ставит страница. Принимает не снимок, а источник: страница `[slug].vue`
 * переживает смену параметра без пересоздания, и снимок остался бы от
 * прежнего бренда.
 *
 * Ставится после монтирования (см. выше, почему не сразу) и снова при
 * возврате из кэша — `onActivated` при первом монтировании не вызывается.
 * Снимается при уходе в кэш и при уничтожении, причём только своя: следующая
 * страница могла успеть поставить свою. На сервере не ставится вовсе:
 * шапка там отрисована раньше страницы, и правка до неё всё равно не дошла бы.
 */
export function setShellOverride(source: ShellOverrideSource) {
  const slot = overrideSlot()
  const apply = () => {
    slot.value = source
  }
  const release = () => {
    if (slot.value === source)
      slot.value = null
  }
  onMounted(apply)
  onActivated(apply)
  onDeactivated(release)
  onScopeDispose(release)
}
