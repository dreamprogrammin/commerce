<script setup lang="ts">
import { useSlides } from '~/composables/slides/useSlides';
import Skeleton from '../ui/skeleton/Skeleton.vue';

const {isLoading, slides, error} = useSlides()
</script>

<template>
    <div class="w-full">
        <div v-if="isLoading"> 
            <div class="p-1">
                <Skeleton class="w-full aspect-[16/7] rounded-2xl"/>
            </div>
        </div>

        <div v-else-if="error" class="w-full aspect-[16/7] bg-destructive/10 text-destructive rounded-lg flex flex-col items-center justify-center p-4 text-center">
            <h3 class="mt-4 text-lg font-semibold">Не удалось загрузить слайдер</h3>
            <p class="text-sm">{{ error.message }}</p>
        </div>

        <Carousel
      v-else-if="slides && slides.length > 0"
      class="w-full"
      :opts="{
        align: 'start',
        loop: true,
      }"
    >
      <CarouselContent>
        <CarouselItem v-for="slide in slides" :key="slide.id">
          <div class="p-1">
            <Card class="overflow-hidden border-none shadow-xl rounded-2xl group">
              <NuxtLink :to="slide.cta_link || '#'" :external="!!(slide.cta_link?.startsWith('http'))" class="block">
                <CardContent class="relative flex aspect-[16/7] items-center justify-center p-0">
                  <img v-if="slide.image_url" :src="slide.image_url" :alt="slide.title" class="w-full h-full object-cover transition-transform duration-500 ease-in-out group-hover:scale-105" />
                  <div v-else class="w-full h-full bg-gradient-to-br from-primary to-secondary" />
                  <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/10" />
                  <div class="absolute bottom-0 left-0 p-6 md:p-10 text-left text-white w-full md:w-3/4 lg:w-2/3">
                    <h2 class="text-3xl md:text-5xl font-extrabold drop-shadow-lg leading-tight">
                      {{ slide.title }}
                    </h2>
                    <p v-if="slide.description" class="mt-4 text-lg max-w-2xl drop-shadow-md hidden md:block">
                      {{ slide.description }}
                    </p>
                    <Button v-if="slide.cta_text && slide.cta_link" class="mt-6" size="lg" as-child :aria-label="slide.cta_text">
                      <div>
                        {{ slide.cta_text }}
                        <Icon name="lucide:arrow-right" class="ml-2 h-4 w-4" />
                      </div>
                    </Button>
                  </div>
                </CardContent>
              </NuxtLink>
            </Card>
          </div>
        </CarouselItem>
      </CarouselContent>
      <CarouselPrevious class="absolute left-4 hidden sm:inline-flex" />
      <CarouselNext class="absolute right-4 hidden sm:inline-flex" />
    </Carousel>

        <div v-else class="w-full aspect-[16/7] bg-secondary/50 rounded-lg flex items-center justify-center border-2 border-dashed">
            <p class="text-muted-foreground">Нет активных слайдов для отображения.</p>
        </div>
    </div>
</template>

<style scoped>
/* Ваши стили */
</style>