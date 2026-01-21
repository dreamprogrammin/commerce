<script setup lang="ts">
import type { AccessoryProduct } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { formatPrice } from '@/utils/formatPrice'

const props = defineProps<{
  accessories: AccessoryProduct[]
  selectedIds: string[]
}>()

const emit = defineEmits<{
  close: []
  toggle: [id: string]
}>()

const { getImageUrl } = useSupabaseStorage()

function getAccessoryImageUrl(imageUrl: string | null) {
  if (!imageUrl)
    return null
  return getImageUrl(BUCKET_NAME_PRODUCT, imageUrl, IMAGE_SIZES.CARD)
}

function isSelected(id: string) {
  return props.selectedIds.includes(id)
}
</script>

<template>
  <div v-if="accessories.length === 0" class="text-center py-8 text-muted-foreground">
    Нет доступных аксессуаров
  </div>

  <Carousel
    v-else
    class="w-full"
    :opts="{
      align: 'start',
      loop: accessories.length > 2,
    }"
  >
    <CarouselContent class="-ml-2 md:-ml-4">
      <CarouselItem
        v-for="accessory in accessories"
        :key="accessory.id"
        class="pl-2 md:pl-4 basis-[80%] sm:basis-1/2 lg:basis-1/3"
      >
        <div
          class="bg-white border rounded-xl overflow-hidden h-full flex flex-col cursor-pointer transition-all"
          :class="{
            'border-primary ring-2 ring-primary/20 bg-primary/5': isSelected(accessory.id),
            'hover:border-gray-300': !isSelected(accessory.id),
          }"
          @click="emit('toggle', accessory.id)"
        >
          <!-- Image with checkbox overlay -->
          <div class="relative bg-gray-50 aspect-square overflow-hidden">
            <!-- Checkbox in corner -->
            <div class="absolute top-2 right-2 z-10" @click.stop>
              <Checkbox
                :model-value="isSelected(accessory.id)"
                class="h-5 w-5 border-2 bg-white shadow-sm"
                @update:model-value="emit('toggle', accessory.id)"
              />
            </div>

            <!-- Selected overlay -->
            <div
              v-if="isSelected(accessory.id)"
              class="absolute inset-0 bg-primary/10 pointer-events-none"
            />

            <NuxtLink
              :to="`/catalog/products/${accessory.slug}`"
              @click.stop="emit('close')"
            >
              <ProgressiveImage
                v-if="accessory.product_images?.[0]?.image_url"
                :src="getAccessoryImageUrl(accessory.product_images[0].image_url)"
                :alt="accessory.name"
                aspect-ratio="square"
                object-fit="cover"
                placeholder-type="lqip"
                :blur-data-url="accessory.product_images[0].blur_placeholder"
              />
              <div
                v-else
                class="w-full h-full flex items-center justify-center text-muted-foreground"
              >
                <Icon name="lucide:image-off" class="w-8 h-8" />
              </div>
            </NuxtLink>
          </div>

          <!-- Info -->
          <div class="p-3 flex-grow flex flex-col">
            <NuxtLink
              :to="`/catalog/products/${accessory.slug}`"
              class="font-medium text-sm line-clamp-2 hover:text-primary transition-colors mb-2"
              @click.stop="emit('close')"
            >
              {{ accessory.name }}
            </NuxtLink>

            <p v-if="accessory.description" class="text-xs text-muted-foreground line-clamp-2 mb-3">
              {{ accessory.description }}
            </p>

            <div class="mt-auto space-y-2">
              <p class="text-lg font-bold" :class="isSelected(accessory.id) ? 'text-primary' : ''">
                + {{ formatPrice(accessory.price) }} ₸
              </p>

              <!-- Bonus points -->
              <Badge
                v-if="accessory.bonus_points_award && accessory.bonus_points_award > 0"
                variant="secondary"
                class="inline-flex items-center gap-1 bg-orange-50 text-orange-600 text-xs"
              >
                <Icon name="lucide:gift" class="w-3 h-3" />
                +{{ accessory.bonus_points_award }} бонусов
              </Badge>

              <!-- Stock info -->
              <p v-if="!accessory.stock_quantity || accessory.stock_quantity <= 0" class="text-xs text-destructive">
                Нет в наличии
              </p>
            </div>
          </div>
        </div>
      </CarouselItem>
    </CarouselContent>

    <!-- Navigation arrows -->
    <div v-if="accessories.length > 2" class="flex justify-center gap-2 mt-4">
      <CarouselPrevious class="static translate-y-0" />
      <CarouselNext class="static translate-y-0" />
    </div>
  </Carousel>
</template>
