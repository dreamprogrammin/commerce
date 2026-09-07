<script setup lang="ts">
/**
 * Полоса доверия под шапкой бренда. Порт секции TRUST из `Бренд.dc.html`.
 *
 * Содержимое неизменное для всех брендов — это обещания магазина, а не
 * свойства бренда. Поэтому лежит здесь константой, а не в базе: заводить
 * четыре строки на каждый бренд значило бы дублировать одно и то же
 * тридцать два раза и следить, чтобы они не разъехались.
 *
 * Сроки доставки и размер кешбэка повторяют те, что показывает карточка
 * товара и бонусный баннер на главной. Меняются вместе с ними.
 */
interface TrustItem {
  icon: string
  title: string
  note: string
  /** Подложка иконки. Литералы, а не токены: у токенов нет пастельных пар. */
  tint: string
  color: string
}

const ITEMS: TrustItem[] = [
  {
    icon: 'lucide:badge-check',
    title: 'Официальный поставщик',
    note: 'Сертификаты на каждую модель',
    tint: 'rgb(0 188 125 / 0.12)',
    color: '#00875c',
  },
  {
    icon: 'lucide:truck',
    title: 'Доставка 1–2 дня',
    note: 'По Алматы, самовывоз бесплатно',
    tint: 'rgb(43 127 255 / 0.12)',
    color: 'var(--primary)',
  },
  {
    icon: 'lucide:gift',
    title: 'Бонусы 1=1 ₸',
    note: 'До 10% кешбэка на следующий заказ',
    tint: 'var(--bonus-surface)',
    color: 'var(--bonus)',
  },
  {
    icon: 'lucide:rotate-ccw',
    title: 'Возврат 14 дней',
    note: 'Если конструктор не подошёл',
    tint: 'rgb(168 85 247 / 0.12)',
    color: '#8b3fd6',
  },
]
</script>

<template>
  <ul class="btr">
    <li v-for="item in ITEMS" :key="item.title" class="btr__item">
      <span class="btr__icon" :style="{ background: item.tint }">
        <Icon :name="item.icon" class="size-5" :style="{ color: item.color }" />
      </span>
      <span class="btr__text">
        <span class="btr__title">{{ item.title }}</span>
        <span class="btr__note">{{ item.note }}</span>
      </span>
    </li>
  </ul>
</template>

<style scoped>
/* Стили намеренно в @layer components — scoped-стиль SFC компилируется вне
   слоёв и молча отменял бы утилиты Tailwind на том же элементе.
   См. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .btr {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .btr__item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border: 1px solid rgb(255 255 255 / 0.9);
    border-radius: 18px;
    background: linear-gradient(150deg, #fff, rgb(247 249 252 / 0.9));
    box-shadow:
      inset 0 1px 0 #fff,
      0 6px 16px rgb(15 23 42 / 0.06);
  }

  .btr__icon {
    display: grid;
    flex: none;
    place-content: center;
    width: 40px;
    height: 40px;
    border-radius: 13px;
  }

  .btr__text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .btr__title {
    color: var(--foreground);
    font-weight: 700;
    font-size: 13.5px;
  }

  .btr__note {
    color: var(--muted-foreground);
    font-size: 12.5px;
  }

  /* Границы 900/1180 повторяют макет: он разводит раскладку по ним,
     а не по брейкпоинтам Tailwind. */
  @media (min-width: 900px) {
    .btr {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
  }

  @media (min-width: 1180px) {
    .btr {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
}
</style>
