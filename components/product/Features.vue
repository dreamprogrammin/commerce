<script setup lang="ts">
import type { PropType } from 'vue'
import type { FullProduct } from '@/types'

interface FeatureItem {
  label: string
  value: string
  // Делаем эти поля необязательными
  isLink?: boolean
  href?: string
}

const props = defineProps({
  product: {
    type: Object as PropType<FullProduct>,
    required: true,
  },
})

// === ВЫЧИСЛЯЕМЫЕ ХАРАКТЕРИСТИКИ ===

// 1. Возраст
const ageRange = computed(() => {
  if (!props.product)
    return null

  const min = props.product.min_age_years
  const max = props.product.max_age_years

  if (min === null && max === null)
    return null
  if (min !== null && max === null)
    return `от ${min} лет`
  if (min === null && max !== null)
    return `до ${max} лет`
  if (min === 0 && max !== null)
    return `с рождения до ${max} лет`

  return `${min} – ${max} лет`
})

// 2. Основные атрибуты
const staticFeatures = computed<FeatureItem[]>(() => {
  if (!props.product)
    return []

  const features = []

  // Бренд
  if (props.product.brands) {
    features.push({
      label: 'Бренд',
      value: props.product.brands.name,
      isLink: true,
      href: `/brand/${props.product.brands.slug}`,
    })
  }

  // Страна
  if (props.product.countries) {
    features.push({
      label: 'Страна',
      value: props.product.countries.name,
      isLink: false,
    })
  }

  // Материал
  if (props.product.materials) {
    features.push({
      label: 'Материал',
      value: props.product.materials.name,
      isLink: false,
    })
  }

  // Возраст
  if (ageRange.value) {
    features.push({
      label: 'Возраст',
      value: ageRange.value,
      isLink: false,
    })
  }

  return features
})

// 3. Динамические атрибуты
const dynamicAttributes = computed(() => {
  // Теперь product_attribute_values гарантированно есть в FullProduct
  if (!props.product?.product_attribute_values)
    return []

  // Группируем значения по имени атрибута
  const grouped = new Map<string, { name: string, values: string[] }>()

  // Используем обновленный тип для итерации
  for (const pav of props.product.product_attribute_values) {
    const attrName = pav.attributes?.name || 'Атрибут'
    const displayType = pav.attributes?.display_type
    const unit = pav.attributes?.unit || ''

    let displayValue: string

    // Для числовых атрибутов используем numeric_value
    if (displayType === 'numeric' && pav.numeric_value !== null) {
      displayValue = `${pav.numeric_value}${unit ? ` ${unit}` : ''}`
    }
    else {
      // Для select/color используем option_value
      displayValue = pav.attributes?.attribute_options?.[0]?.value || '—'
    }

    // Если атрибут уже есть в группе, добавляем значение
    if (grouped.has(attrName)) {
      grouped.get(attrName)!.values.push(displayValue)
    }
    else {
      grouped.set(attrName, { name: attrName, values: [displayValue] })
    }
  }

  return Array.from(grouped.values())
})

// --- ФОРМАТИРОВАНИЕ ДИНАМИЧЕСКИХ АТРИБУТОВ ---
const formattedDynamicAttributes = computed<FeatureItem[]>(() => {
  return dynamicAttributes.value.map(attr => ({
    label: attr.name,
    value: attr.values.join(', '),
  }))
})

const allFeatures = computed<FeatureItem[]>(() => [
  ...staticFeatures.value,
  ...formattedDynamicAttributes.value,
])
</script>

<template>
  <!-- Используем компонент Card из Shadcn -->
  <Card class="w-full shadow-lg">
    <CardHeader class="pb-3">
      <CardTitle class="text-xl font-bold">
        Характеристики
      </CardTitle>
    </CardHeader>

    <CardContent>
      <dl v-if="allFeatures.length > 0" class="divide-y divide-border">
        <div v-for="item in allFeatures" :key="item.label" class="py-3 flex justify-between items-start">
          <!-- Название характеристики (слева) - жирный шрифт, чтобы выглядело как DT -->
          <dt class="text-sm font-medium text-muted-foreground w-1/2">
            {{ item.label }}
          </dt>

          <!-- Значение (справа) - занимает оставшееся место -->
          <dd class="text-sm text-foreground text-right w-1/2">
            <NuxtLink
              v-if="item.isLink && item.href"
              :to="item.href"
              class="inline-flex items-center text-primary font-semibold hover:underline transition-colors"
            >
              {{ item.value }}
              <Icon name="lucide:arrow-right" class="w-4 h-4 ml-1" />
            </NuxtLink>
            <!-- Простое значение -->
            <span v-else>
              <!-- Выделяем важные статические значения (например, возраст, страна) бейджем -->
              <Badge
                v-if="item.label === 'Возраст' || item.label === 'Страна' || item.label === 'Материал'"
                variant="secondary"
              >
                {{ item.value }}
              </Badge>
              <span v-else>{{ item.value }}</span>
            </span>
          </dd>
        </div>
      </dl>

      <!-- Сообщение об отсутствии характеристик -->
      <p v-else class="text-muted-foreground text-sm">
        Дополнительные характеристики отсутствуют.
      </p>
    </CardContent>

    <!-- Опционально: Футер, если нужно добавить информацию о гарантии -->
    <CardFooter class="pt-3 border-t">
      <p class="text-xs text-muted-foreground">
        * Детальные характеристики могут быть изменены производителем без предварительного уведомления.
      </p>
    </CardFooter>
  </Card>
</template>
