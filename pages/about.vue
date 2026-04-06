<script setup lang="ts">
// BreadcrumbList JSON-LD
useBreadcrumbSchema([{ name: "О нас" }]);

useHead({
  title: "О нас — uhti.kz",
  meta: [
    {
      name: "description",
      content:
        "Интернет-магазин игрушек Ухтышка в Алматы. Широкий ассортимент качественных игрушек для детей всех возрастов с доставкой по Казахстану.",
    },
    { name: "robots", content: "index, follow" },
  ],
});
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-10">
    <h1 class="mb-8 text-3xl font-bold">О нас</h1>

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
        <h2 class="text-xl font-semibold">Наша миссия</h2>
        <p>
          Мы верим, что игра — это не просто развлечение, а важная часть
          развития ребёнка. Наша миссия — предоставить родителям доступ к
          качественным игрушкам, которые помогают детям учиться, развиваться и
          радоваться каждому дню.
        </p>
      </section>

      <!-- Почему выбирают нас -->
      <section>
        <h2 class="text-xl font-semibold">Почему выбирают нас</h2>
        <ul class="list-disc space-y-2 pl-6">
          <li>
            <strong>Широкий ассортимент:</strong> Более 1000 наименований
            игрушек от ведущих мировых брендов — LEGO, MGA Entertainment,
            Mattel, Hasbro и многих других.
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
        <h2 class="text-xl font-semibold">Наш ассортимент</h2>
        <p>В нашем каталоге вы найдёте:</p>
        <ul class="list-disc space-y-1 pl-6">
          <li>Конструкторы (LEGO, CADA, Qman и другие)</li>
          <li>Куклы и аксессуары (LOL Surprise, Barbie, Rainbow High)</li>
          <li>
            Машинки и транспорт (радиоуправляемые, металлические, игровые
            наборы)
          </li>
          <li>
            Развивающие игрушки для малышей (бизиборды, сортеры, пирамидки)
          </li>
          <li>Настольные игры и пазлы</li>
          <li>Мягкие игрушки</li>
          <li>Игрушки для активного отдыха</li>
          <li>Творчество и рукоделие</li>
        </ul>
      </section>

      <!-- Как мы работаем -->
      <section>
        <h2 class="text-xl font-semibold">Как мы работаем</h2>
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
            <strong>Оплата:</strong> Оплатите заказ при получении наличными или
            картой.
          </li>
        </ol>
      </section>

      <!-- Наши ценности -->
      <section>
        <h2 class="text-xl font-semibold">Наши ценности</h2>
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
        <h2 class="text-xl font-semibold">Контакты</h2>
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
          <li><strong>Режим работы:</strong> Ежедневно с 10:00 до 20:00</li>
        </ul>
      </section>

      <!-- Присоединяйтесь к нам -->
      <section class="rounded-lg bg-primary/5 p-6">
        <h2 class="text-xl font-semibold">Присоединяйтесь к нам!</h2>
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
