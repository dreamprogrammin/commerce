<script setup lang="ts">
/**
 * Шапка лендинга бренда — макет `Бренд LEGO v2.dc.html`, секция HERO.
 *
 * Синяя полоса во всю ширину экрана с «кирпичной» сеткой шипов: слева
 * хлебные крошки, плашка бренда, заголовок, лид, две кнопки и четыре цифры;
 * справа витрина флагманского товара на белом круге. На телефоне витрина
 * едет наверх отдельной карточкой, а крошки и цифры прячутся.
 *
 * Цифры считаются по выдаче, а не пишутся руками. Срок доставки — из
 * опубликованных условий `/terms` (Алматы 1–3 рабочих дня), а не из макета,
 * где стояло «1–2 дня»: обещание на странице не должно расходиться с
 * условиями магазина.
 */
import type { Brand, IBreadcrumbItem, ProductLine, ProductWithGallery } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_BRANDS, BUCKET_NAME_PRODUCT } from '@/constants'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { formatPrice } from '@/utils/formatPrice'
import { pluralRu } from '@/utils/seoDescription'

const props = defineProps<{
  brand: Brand
  /** Товары бренда — первый идёт витриной. */
  products: ProductWithGallery[]
  lines: ProductLine[]
  breadcrumbs: IBreadcrumbItem[]
}>()

const emit = defineEmits<{ jump: [key: 'series' | 'pick'] }>()

const { getVariantUrl } = useSupabaseStorage()
const cartStore = useCartStore()
const { flyToCart } = useCartFly()

/*
 * Витрина — первый товар выдачи. Отдельного поля «флагман» в базе нет, и
 * заводить его ради картинки значило бы просить владельца вести ещё один
 * список руками; порядок задаёт сортировка страницы.
 */
const flagship = computed(() => props.products[0] ?? null)

/*
 * Витрина нарисована дважды — карточкой для телефона и кругом для десктопа,
 * лишнюю прячет CSS. Полёт в корзину должен стартовать от ВИДИМОЙ: у скрытой
 * `display: none` рект нулевой, и призрак улетал бы из левого верхнего угла.
 * Ссылка — компонент, поэтому берётся её `$el`.
 */
const shotBandRef = ref<{ $el?: HTMLElement } | HTMLElement | null>(null)
const shotStageRef = ref<{ $el?: HTMLElement } | HTMLElement | null>(null)

function nodeOf(source: unknown): HTMLElement | null {
  const node = source as any
  return (node?.$el ?? node ?? null) as HTMLElement | null
}

function visibleShot(): HTMLElement | null {
  const stage = nodeOf(shotStageRef.value)
  if (stage?.offsetParent)
    return stage
  const band = nodeOf(shotBandRef.value)
  if (band?.offsetParent)
    return band
  return stage ?? band
}

const logoUrl = computed(() =>
  props.brand.logo_url
    ? getVariantUrl(BUCKET_NAME_BRANDS, props.brand.logo_url, 'sm')
    : null,
)

const shotImage = computed(() => {
  const path = flagship.value?.product_images?.[0]?.image_url
  return path ? getVariantUrl(BUCKET_NAME_PRODUCT, path, 'md') : null
})

const inStockCount = computed(
  () => props.products.filter(p => (p.stock_quantity ?? 0) > 0).length,
)

/** «Официальный бренд · Дания, 1932» — страна и год из `brands.facts`. */
const pillNote = computed(() => {
  const facts = props.brand.facts ?? []
  const value = (key: string) =>
    facts.find(f => f?.k?.toLowerCase().startsWith(key))?.v?.trim()

  const country = value('стран')
  const founded = value('основан')?.replace(/\s*год\w*$/i, '')
  const origin = [country, founded].filter(Boolean).join(', ')

  return origin ? `Официальный бренд · ${origin}` : 'Официальный бренд'
})

const lead = computed(() => props.brand.seo_description || '')

/**
 * Кэшбэк бренда — наибольшая доля бонусов от цены среди его товаров. В
 * макете стояло «до 10%», по данным выходит 5%: обещание в разметке должно
 * совпадать с тем, что начислится в корзине.
 */
const bonusShare = computed(() => {
  const shares = props.products
    .map((p) => {
      const price = p.final_price ?? p.price
      const bonus = p.bonus_points_award ?? 0
      return price > 0 ? (bonus / price) * 100 : 0
    })
    .filter(share => share > 0)
  return shares.length ? Math.round(Math.max(...shares)) : 0
})

const stats = computed(() => {
  const rows: { num: string, label: string }[] = [
    {
      num: String(inStockCount.value),
      label: pluralRu(inStockCount.value, 'набор', 'набора', 'наборов'),
    },
  ]
  if (props.lines.length > 0) {
    rows.push({
      num: String(props.lines.length),
      label: pluralRu(props.lines.length, 'серия', 'серии', 'серий'),
    })
  }
  rows.push({ num: '1–3 дня', label: 'доставка по Алматы' })
  if (bonusShare.value > 0)
    rows.push({ num: `${bonusShare.value}%`, label: 'бонусами с покупки' })
  return rows
})

const price = computed(() => {
  const product = flagship.value
  if (!product)
    return null
  return {
    final: product.final_price ?? product.price,
    discount: product.discount_percentage
      ? `−${Math.round(product.discount_percentage)}%`
      : '',
  }
})

function addFlagship(event: MouseEvent) {
  if (!flagship.value)
    return
  // До добавления: кнопка остаётся на месте, но рект источника берём заранее.
  flyToCart(visibleShot(), undefined, event.currentTarget as HTMLElement)
  cartStore.addItem(flagship.value as any, 1)
}
</script>

<template>
  <section class="blh">
    <span class="blh__studs" aria-hidden="true" />
    <span class="blh__aura" aria-hidden="true" />

    <div class="blh__inner">
      <!-- Телефон: витрина отдельной карточкой над текстом. -->
      <div v-if="flagship && price" class="blh__shot-band">
        <NuxtLink
          ref="shotBandRef"
          :to="`/catalog/products/${flagship.slug}`"
          class="blh__shot-band-link"
        >
          <ProgressiveImage
            v-if="shotImage"
            :src="shotImage"
            :alt="flagship.name"
            object-fit="contain"
            placeholder-type="shimmer"
            eager
            class="size-full !bg-transparent"
          />
        </NuxtLink>
        <span v-if="price.discount" class="blh__shot-badge">{{ price.discount }}</span>
        <span class="blh__shot-cap">
          <span class="blh__shot-cap-key">Флагман</span>
          <span class="blh__shot-cap-price">{{ formatPrice(price.final) }}&nbsp;₸</span>
        </span>
      </div>

      <div class="blh__copy">
        <nav class="blh__crumbs" aria-label="Хлебные крошки">
          <template v-for="(crumb, index) in breadcrumbs" :key="crumb.href || crumb.name">
            <NuxtLink v-if="crumb.href && index < breadcrumbs.length - 1" :to="crumb.href">
              {{ crumb.name }}
            </NuxtLink>
            <span v-else class="blh__crumbs-current">{{ crumb.name }}</span>
            <Icon
              v-if="index < breadcrumbs.length - 1"
              name="lucide:chevron-right"
              class="size-[13px]"
            />
          </template>
        </nav>

        <span class="blh__pill">
          <span v-if="logoUrl" class="blh__pill-logo">
            <!--
              `eager` оставляем — значок над сгибом и должен появиться сразу,
              а вот `fetchpriority` понижаем: по умолчанию `eager` означает
              `high`, и логотип 24 px соревновался за канал с картинкой
              флагмана, по которой считается LCP.
            -->
            <ProgressiveImage
              :src="logoUrl"
              :alt="`Логотип ${brand.name}`"
              object-fit="contain"
              placeholder-type="shimmer"
              :use-transform="false"
              eager
              fetchpriority="low"
              class="size-full"
            />
          </span>
          {{ pillNote }}
        </span>

        <h1 class="blh__h1">
          Собирайте вместе с <span class="blh__mark">{{ brand.name }}</span>
        </h1>

        <p v-if="lead" class="blh__lead">
          {{ lead }}
        </p>

        <div class="blh__buttons">
          <button type="button" class="blh__cta" @click="emit('jump', 'pick')">
            Подобрать набор
            <Icon name="lucide:chevron-right" class="size-[17px]" />
          </button>
          <button
            v-if="lines.length"
            type="button"
            class="blh__ghost"
            @click="emit('jump', 'series')"
          >
            Все серии {{ brand.name }}
            <Icon name="lucide:chevron-right" class="size-[17px]" />
          </button>
        </div>

        <div class="blh__stats">
          <span v-for="stat in stats" :key="stat.label" class="blh__stat">
            <span class="blh__stat-num">{{ stat.num }}</span>
            <span class="blh__stat-label">{{ stat.label }}</span>
          </span>
        </div>
      </div>

      <!-- Десктоп: витрина на белом круге. -->
      <div v-if="flagship && price" class="blh__stage-wrap">
        <div class="blh__stage">
          <span class="blh__disc" aria-hidden="true" />
          <NuxtLink
            ref="shotStageRef"
            :to="`/catalog/products/${flagship.slug}`"
            class="blh__stage-link"
          >
            <ProgressiveImage
              v-if="shotImage"
              :src="shotImage"
              :alt="flagship.name"
              object-fit="contain"
              placeholder-type="shimmer"
              eager
              class="size-full !bg-transparent"
            />
          </NuxtLink>
          <span v-if="price.discount" class="blh__badge">{{ price.discount }}</span>

          <div class="blh__tag">
            <span class="blh__tag-text">
              <span class="blh__tag-key">Флагман</span>
              <span class="blh__tag-price">{{ formatPrice(price.final) }}&nbsp;₸</span>
            </span>
            <button
              type="button"
              class="blh__add"
              aria-label="Добавить флагманский набор в корзину"
              @click="addFlagship"
            >
              <Icon name="solar:cart-3-bold" class="size-[19px]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .blh {
    position: relative;
    padding: 16px 0 28px;
    background: linear-gradient(122deg, #00396a 0%, #0059c2 62%, #003a78 100%);
    overflow: hidden;
  }

  /* Сетка шипов «кирпичика» — фирменный приём макета. */
  .blh__studs {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(circle at 13px 13px, rgb(255 255 255 / 0.13) 5.5px, rgb(0 0 0 / 0) 6.5px);
    background-size: 42px 42px;
    opacity: 0.55;
    pointer-events: none;
  }

  .blh__aura {
    position: absolute;
    top: -24%;
    left: 50%;
    width: 170%;
    height: 62%;
    background: radial-gradient(closest-side at 50% 50%, rgb(253 199 0 / 0.3) 0%, rgb(0 0 0 / 0) 100%);
    transform: translateX(-50%);
    pointer-events: none;
  }

  .blh__inner {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 18px;
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 var(--page-gutter);
  }

  .blh__copy {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 13px;
    min-width: 0;
  }

  .blh__crumbs {
    display: none;
    flex-wrap: wrap;
    align-items: center;
    gap: 7px;
    color: rgb(255 255 255 / 0.55);
    font-weight: 500;
    font-size: 12.5px;
  }

  .blh__crumbs a {
    color: rgb(255 255 255 / 0.55);
  }

  .blh__crumbs a:hover {
    color: #fff;
  }

  .blh__crumbs-current {
    color: #fff;
    font-weight: 600;
  }

  .blh__pill {
    display: none;
    align-self: flex-start;
    align-items: center;
    gap: 10px;
    padding: 5px 14px 5px 5px;
    border: 1px solid rgb(255 255 255 / 0.18);
    border-radius: 999px;
    background: rgb(255 255 255 / 0.1);
    color: rgb(255 255 255 / 0.82);
    font-weight: 600;
    font-size: 12.5px;
    white-space: nowrap;
  }

  .blh__pill-logo {
    display: grid;
    flex: none;
    place-content: center;
    width: 36px;
    height: 36px;
    padding: 5px;
    border-radius: 999px;
    background: #fff;
  }

  .blh__h1 {
    margin: 0;
    color: #fff;
    font-weight: 800;
    font-size: 30px;
    line-height: 1.02;
    letter-spacing: -0.04em;
    text-wrap: balance;
  }

  /* Имя бренда — жёлтой плашкой, как деталь конструктора. */
  .blh__mark {
    display: inline-block;
    padding: 0 10px;
    border-radius: 8px;
    background: #fdc700;
    box-shadow: 0 6px 18px rgb(253 199 0 / 0.3);
    color: #0b2444;
  }

  .blh__lead {
    margin: 0;
    max-width: 34ch;
    color: #e8f1ff;
    font-size: 13.5px;
    line-height: 1.55;
    text-wrap: pretty;
  }

  .blh__buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 6px;
  }

  .blh__cta,
  .blh__ghost {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    height: 52px;
    padding: 0 20px;
    border-radius: 999px;
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
  }

  .blh__cta {
    border: none;
    background: #ffd84d;
    color: #0b2444;
  }

  .blh__ghost {
    border: 1.5px solid #fff;
    background: transparent;
    color: #fff;
  }

  .blh__stats {
    display: none;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin-top: 10px;
  }

  .blh__stat {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    padding: 10px 13px;
    border: 1px solid rgb(255 255 255 / 0.13);
    border-radius: 12px;
    background: rgb(255 255 255 / 0.08);
  }

  .blh__stat-num {
    color: #fff;
    font-weight: 800;
    font-size: 21px;
    letter-spacing: -0.025em;
  }

  .blh__stat-label {
    color: rgb(255 255 255 / 0.88);
    font-weight: 500;
    font-size: 11.5px;
  }

  /* ── Витрина: телефон ── */
  .blh__shot-band {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    border-radius: 22px;
    background: #fff;
    box-shadow: 0 16px 34px rgb(2 18 44 / 0.28);
    aspect-ratio: 4 / 3;
    overflow: hidden;
  }

  .blh__shot-band-link {
    display: block;
    width: 74%;
    height: 74%;
  }

  .blh__shot-badge {
    position: absolute;
    top: 12px;
    left: 12px;
    padding: 5px 12px;
    border-radius: 999px;
    background: var(--discount);
    color: #fff;
    font-weight: 800;
    font-size: 13.5px;
  }

  .blh__shot-cap {
    position: absolute;
    bottom: 12px;
    left: 12px;
    display: inline-flex;
    align-items: baseline;
    gap: 9px;
    padding: 7px 14px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.95);
    box-shadow: 0 6px 16px rgb(2 18 44 / 0.16);
  }

  .blh__shot-cap-key {
    color: var(--muted-foreground);
    font-weight: 700;
    font-size: 12.5px;
  }

  .blh__shot-cap-price {
    color: var(--discount);
    font-weight: 800;
    font-size: 15px;
  }

  /* ── Витрина: десктоп ── */
  .blh__stage-wrap {
    display: none;
    justify-content: flex-end;
  }

  .blh__stage {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    max-width: 420px;
    aspect-ratio: 1 / 1;
  }

  /*
   * В макете товар — вырезанный рендер на белом круге. У нас фотографии
   * сняты НА БЕЛОМ ФОНЕ, и круг под ними не читается: получается белый
   * прямоугольник поверх подсветки. Поэтому витрина — белая карточка с
   * радиусом, как в мобильной версии того же макета, а круг остался мягкой
   * подсветкой под ней.
   */
  .blh__disc {
    position: absolute;
    inset: 2%;
    border-radius: 999px;
    background: radial-gradient(
      circle at 50% 45%,
      rgb(255 255 255 / 0.35) 0%,
      rgb(255 255 255 / 0) 70%
    );
    pointer-events: none;
  }

  .blh__stage-link {
    position: relative;
    display: grid;
    place-items: center;
    width: 86%;
    height: 86%;
    padding: 6%;
    border-radius: 26px;
    background: #fff;
    box-shadow: 0 22px 44px rgb(2 18 44 / 0.3);
  }

  .blh__badge {
    position: absolute;
    top: 6%;
    left: 4%;
    padding: 6px 13px;
    border-radius: 999px;
    background: var(--discount);
    color: #fff;
    font-weight: 800;
    font-size: 14px;
  }

  .blh__tag {
    position: absolute;
    bottom: 2%;
    left: 50%;
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 9px 9px 9px 16px;
    border-radius: 999px;
    background: #fff;
    box-shadow: 0 12px 26px rgb(2 18 44 / 0.26);
    transform: translateX(-50%);
  }

  .blh__tag-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .blh__tag-key {
    color: var(--muted-foreground);
    font-weight: 700;
    font-size: 10.5px;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  .blh__tag-price {
    color: var(--discount);
    font-weight: 800;
    font-size: 18px;
    white-space: nowrap;
  }

  .blh__add {
    display: grid;
    flex: none;
    place-content: center;
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 999px;
    background: var(--primary);
    color: #fff;
    cursor: pointer;
  }

  @media (min-width: 760px) {
    .blh {
      padding: 24px 0 40px;
    }

    .blh__aura {
      top: -46%;
      right: -6%;
      left: auto;
      width: 52%;
      height: 200%;
      transform: none;
    }

    .blh__inner {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(260px, 0.75fr);
      gap: 36px;
      align-items: center;
    }

    .blh__copy {
      gap: 16px;
    }

    .blh__shot-band {
      display: none;
    }

    .blh__crumbs {
      display: flex;
    }

    .blh__pill {
      display: inline-flex;
    }

    .blh__h1 {
      font-size: 50px;
    }

    .blh__lead {
      max-width: 40ch;
      font-size: 15.5px;
    }

    .blh__cta,
    .blh__ghost {
      justify-content: center;
      width: auto;
      white-space: nowrap;
    }

    .blh__cta {
      padding: 0 22px;
      box-shadow: 0 12px 26px rgb(253 199 0 / 0.28);
    }

    .blh__ghost {
      border: 1px solid rgb(255 255 255 / 0.34);
      background: rgb(255 255 255 / 0.08);
      font-weight: 600;
    }

    .blh__stats {
      display: grid;
    }

    .blh__stage-wrap {
      display: flex;
    }
  }

  @media (min-width: 1200px) {
    .blh__inner {
      grid-template-columns: minmax(0, 1.05fr) minmax(330px, 0.95fr);
    }
  }
}
</style>
