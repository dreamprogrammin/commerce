<script setup lang="ts">
import { pageShell } from '@/lib/shell'

definePageMeta({ layout: 'shell', shell: pageShell })

const supabase = useSupabaseClient()

/*
 * Что здесь считается и почему это не написано текстом.
 *
 * До 15 сентября 2026 страница обещала «более 1000 наименований» при 178
 * активных товарах и перечисляла бренды, которых в каталоге нет вовсе
 * (Hasbro, Rainbow High, Qman). Сверено с `products` и `brands` на бою. Для
 * Google это ровно то, что описано в принципах качества как вводящие в
 * заблуждение сведения, а для покупателя — обещание, которое не сбывается
 * на первой же странице каталога.
 *
 * Поэтому число товаров, список брендов и разделы берутся из базы. Текст,
 * который нельзя опровергнуть выдачей каталога, не устареет ни при завозе,
 * ни при распродаже, и его не придётся править руками.
 *
 * Запросы дешёвые: три выборки маленьких колонок (178 строк товаров,
 * 32 бренда, 64 категории), страница закеширована на час (`routeRules`).
 */
const { data: catalogFacts } = await useAsyncData('about-catalog-facts', async () => {
  const [products, brands, categories] = await Promise.all([
    supabase.from('products').select('brand_id, category_id').eq('is_active', true),
    supabase.from('brands').select('id, name'),
    supabase.from('categories').select('id, name, slug, parent_id'),
  ])

  const rows = products.data ?? []
  if (!rows.length)
    return null

  const countBy = (key: 'brand_id' | 'category_id') => {
    const counts = new Map<string, number>()
    for (const row of rows) {
      const id = row[key]
      if (id)
        counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return counts
  }

  const byBrand = countBy('brand_id')
  const byCategory = countBy('category_id')

  const brandNames = (brands.data ?? [])
    .filter(brand => byBrand.has(brand.id))
    .sort((a, b) => (byBrand.get(b.id) ?? 0) - (byBrand.get(a.id) ?? 0))
    .map(brand => brand.name)

  /*
   * Адрес категории — цепочка слагов от корня, как в карте сайта
   * (`/catalog/kiddy/katalki`). Каталог отвечает 200 и на короткий путь из
   * одного слага, но canonical считается от `route.path`, и такая ссылка
   * плодила бы второй адрес той же страницы.
   */
  const categoryById = new Map((categories.data ?? []).map(category => [category.id, category]))
  const pathOf = (id: string) => {
    const chain: string[] = []
    let current = categoryById.get(id)
    while (current) {
      chain.unshift(current.slug)
      current = current.parent_id ? categoryById.get(current.parent_id) : undefined
    }
    return chain.length ? `/catalog/${chain.join('/')}` : null
  }

  const sections = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, count]) => ({
      name: categoryById.get(id)?.name?.trim() ?? '',
      count,
      path: pathOf(id),
    }))
    .filter(section => section.name && section.path)

  return { products: rows.length, brandNames, sections }
})

/** «178 игрушек» — с правильным окончанием, число приходит из базы. */
const productsPhrase = computed(() => {
  const total = catalogFacts.value?.products ?? 0
  const tail = total % 10
  const teen = total % 100
  const word = tail === 1 && teen !== 11
    ? 'игрушка'
    : tail >= 2 && tail <= 4 && (teen < 12 || teen > 14)
      ? 'игрушки'
      : 'игрушек'
  return `${total} ${word}`
})

/** Первые шесть брендов по числу живых товаров — остальные уводим в «и другие». */
const topBrands = computed(() => (catalogFacts.value?.brandNames ?? []).slice(0, 6))

// BreadcrumbList JSON-LD
useBreadcrumbSchema([{ name: 'О нас' }])

// Страница отдавала только title, description и robots — ни одного og-тега.
// При шаринге в мессенджеры и соцсети карточка выходила пустой: ни заголовка,
// ни картинки. Остальные статические страницы (returns.vue, privacy-policy.vue)
// уже описаны через useSeoMeta, здесь то же самое плюс og:image.
// «Ухтышка» — единое наименование по всему сайту, см. pages/index.vue
const TITLE = 'О нас — Ухтышка'
const DESCRIPTION
  = 'Интернет-магазин игрушек Ухтышка в Алматы. Широкий ассортимент качественных игрушек для детей всех возрастов с доставкой по Казахстану.'

defineOgImageComponent('OgImageCatalog', {
  title: 'О нас',
  description: 'Локальный магазин игрушек в Алматы со своим складом',
  kicker: 'О КОМПАНИИ',
})

useSeoMeta({
  title: TITLE,
  description: DESCRIPTION,
  ogTitle: TITLE,
  ogDescription: DESCRIPTION,
  ogType: 'website',
  ogUrl: 'https://uhti.kz/about',
  ogSiteName: 'Ухтышка',
  ogLocale: 'ru_RU',
  twitterCard: 'summary_large_image',
  twitterTitle: TITLE,
  twitterDescription: DESCRIPTION,
  robots: useRobotsContent('index, follow'),
})
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-10">
    <h1 class="mb-8 text-3xl font-bold">
      О нас
    </h1>

    <div class="prose prose-sm max-w-none space-y-6 text-foreground">
      <!-- Введение -->
      <section>
        <p class="text-lg leading-relaxed">
          <strong>Ухтышка</strong> — это интернет-магазин игрушек в Алматы, где
          каждый родитель может найти качественные и безопасные игрушки для
          своих детей.
        </p>
        <p>
          Мы специализируемся на продаже развивающих игрушек, конструкторов,
          кукол, машинок и многого другого для детей всех возрастов — от малышей
          до подростков.
        </p>
      </section>

      <!-- Наша миссия -->
      <section>
        <h2 class="text-xl font-semibold">
          Наша миссия
        </h2>
        <p>
          Мы верим, что игра — это не просто развлечение, а важная часть
          развития ребёнка. Наша миссия — предоставить родителям доступ к
          качественным игрушкам, которые помогают детям учиться, развиваться и
          радоваться каждому дню.
        </p>
      </section>

      <!-- Почему выбирают нас -->
      <section>
        <h2 class="text-xl font-semibold">
          Почему выбирают нас
        </h2>
        <ul class="list-disc space-y-2 pl-6">
          <li v-if="catalogFacts">
            <strong>Каталог, который можно проверить:</strong> сейчас в нём
            {{ productsPhrase }} от {{ catalogFacts.brandNames.length }} брендов —
            {{ topBrands.join(', ') }}<span v-if="catalogFacts.brandNames.length > topBrands.length"> и другие</span>.
            Число берётся из каталога, а не из рекламного текста.
          </li>
          <li v-else>
            <strong>Игрушки известных брендов:</strong> конструкторы, куклы,
            радиоуправляемые машинки и развивающие игрушки — всё, что есть в
            каталоге, лежит на нашем складе в Алматы.
          </li>
          <li>
            <strong>Качество и безопасность:</strong> Все товары сертифицированы
            и соответствуют международным стандартам безопасности.
          </li>
          <li>
            <strong>Удобная доставка:</strong> Быстрая доставка по Алматы (1-3
            дня) и всему Казахстану (3-7 дней).
          </li>
          <li>
            <strong>Бонусная программа:</strong> Зарегистрированные пользователи
            получают бонусы за каждую покупку, которые можно использовать для
            оплаты следующих заказов.
          </li>
          <li>
            <strong>Гибкие условия возврата:</strong> 14 дней на возврат или
            обмен товара без лишних вопросов.
          </li>
          <li>
            <strong>Персональные рекомендации:</strong> Наша система подбирает
            игрушки с учётом возраста и интересов вашего ребёнка.
          </li>
        </ul>
      </section>

      <!-- Наш ассортимент -->
      <section>
        <h2 class="text-xl font-semibold">
          Наш ассортимент
        </h2>
        <p v-if="catalogFacts">
          Самые полные разделы каталога на сегодня — с числом товаров в каждом:
        </p>
        <p v-else>
          В нашем каталоге вы найдёте:
        </p>
        <ul v-if="catalogFacts" class="list-disc space-y-1 pl-6">
          <li v-for="section in catalogFacts.sections" :key="section.path!">
            <NuxtLink :to="section.path!" class="text-primary hover:underline">
              {{ section.name }}
            </NuxtLink>
            — {{ section.count }}
          </li>
        </ul>
        <ul v-else class="list-disc space-y-1 pl-6">
          <li>Конструкторы</li>
          <li>Куклы и аксессуары</li>
          <li>
            Машинки и транспорт (радиоуправляемые, металлические, игровые
            наборы)
          </li>
          <li>
            Развивающие игрушки для малышей (бизиборды, сортеры, пирамидки)
          </li>
          <li>Мягкие игрушки</li>
          <li>Игрушки для активного отдыха</li>
          <li>Творчество и рукоделие</li>
        </ul>
      </section>

      <!-- Как мы работаем -->
      <section>
        <h2 class="text-xl font-semibold">
          Как мы работаем
        </h2>
        <ol class="list-decimal space-y-2 pl-6">
          <li>
            <strong>Выбирайте товары:</strong> Просматривайте каталог,
            используйте фильтры по возрасту, полу, бренду и цене.
          </li>
          <li>
            <strong>Оформляйте заказ:</strong> Добавьте товары в корзину и
            оформите заказ онлайн. Можно заказать как гость или
            зарегистрироваться для участия в бонусной программе.
          </li>
          <li>
            <strong>Подтверждение:</strong> Мы свяжемся с вами для подтверждения
            заказа и уточнения деталей доставки.
          </li>
          <li>
            <strong>Доставка:</strong> Получите заказ удобным способом —
            курьером на дом или самовывозом.
          </li>
          <li>
            <strong>Оплата:</strong> Оплатите заказ наличными при получении
            или переводом Kaspi.
          </li>
        </ol>
      </section>

      <!-- Наши ценности -->
      <section>
        <h2 class="text-xl font-semibold">
          Наши ценности
        </h2>
        <ul class="list-disc space-y-2 pl-6">
          <li>
            <strong>Забота о детях:</strong> Мы тщательно отбираем игрушки,
            которые безопасны и полезны для развития.
          </li>
          <li>
            <strong>Честность:</strong> Мы предоставляем достоверную информацию
            о товарах и не завышаем цены.
          </li>
          <li>
            <strong>Клиентоориентированность:</strong> Ваше удовлетворение — наш
            главный приоритет. Мы всегда готовы помочь с выбором и решить любые
            вопросы.
          </li>
          <li>
            <strong>Инновации:</strong> Мы постоянно улучшаем наш сервис,
            внедряем новые технологии и расширяем ассортимент.
          </li>
        </ul>
      </section>

      <!-- Контакты -->
      <section>
        <h2 class="text-xl font-semibold">
          Контакты
        </h2>
        <p>Мы всегда рады вашим вопросам и предложениям!</p>
        <ul class="space-y-2">
          <li>
            <strong>Телефон:</strong>
            <a href="tel:+77025379473" class="text-primary hover:underline">
              +7 (702) 537-94-73
            </a>
          </li>
          <li>
            <strong>Email:</strong>
            <a href="mailto:info@uhti.kz" class="text-primary hover:underline">
              info@uhti.kz
            </a>
          </li>
          <li>
            <strong>Адрес:</strong> г. Алматы, мкр. Шапагат, ул. Амангельды
          </li>
          <!--
            Часы держим ровно те же, что в разметке `Store` на главной
            (`pages/index.vue`, `openingHours: 'Mo-Su 09:00-21:00'`). До
            15 сентября 2026 страница писала «с 10:00 до 20:00», и сайт
            противоречил сам себе; какие часы верные — сказал владелец.
            Меняете здесь — меняйте и там.
          -->
          <li><strong>Режим работы:</strong> Ежедневно с 9:00 до 21:00</li>
        </ul>
      </section>

      <!-- Присоединяйтесь к нам -->
      <section class="rounded-lg bg-primary/5 p-6">
        <h2 class="text-xl font-semibold">
          Присоединяйтесь к нам!
        </h2>
        <p>
          Зарегистрируйтесь на сайте, чтобы получать бонусы за покупки,
          персональные рекомендации и первыми узнавать о новинках и акциях.
        </p>
        <div class="mt-4">
          <NuxtLink
            to="/catalog"
            class="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Перейти в каталог
            <Icon name="lucide:arrow-right" class="h-5 w-5" />
          </NuxtLink>
        </div>
      </section>
    </div>
  </div>
</template>
