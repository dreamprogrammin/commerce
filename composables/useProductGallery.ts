import type { CarouselApi } from '@/components/ui/carousel'
import type { ProductImageRow } from '@/types'

export function useProductGallery(
  images: Ref<ProductImageRow[]>,
  visibleThumbs: number = 4,
) {
  const emblaMainApi = ref<CarouselApi>()
  const emblaThumbApi = ref<CarouselApi>()
  const selectedIndex = ref(0)

  const thumbBasisClass = computed(() => {
    return `basis-1/${visibleThumbs}` // -> 'basis-1/4'
  })

  const onInitMain = (api: CarouselApi) => {
    emblaMainApi.value = api
  }
  const onInitThumb = (api: CarouselApi) => {
    emblaThumbApi.value = api
  }

  const onSelect = () => {
    if (!emblaMainApi.value || !emblaThumbApi.value)
      return
    selectedIndex.value = emblaMainApi.value.selectedScrollSnap()
    emblaThumbApi.value.scrollTo(selectedIndex.value)
  }

  const onThumbClick = (index: number) => {
    if (!emblaMainApi.value || !emblaThumbApi.value)
      return
    emblaMainApi.value.scrollTo(index)
  }

  watch(emblaMainApi, (api, oldApi) => {
    if (oldApi) {
      oldApi.off('select', onSelect)
      oldApi.off('reInit', onSelect)
    }
    if (api) {
      onSelect()
      api.on('select', onSelect)
      api.on('reInit', onSelect)
    }
  }, { immediate: true })

  return {
    emblaMainApi,
    emblaThumbApi,
    selectedIndex,
    thumbBasisClass, // Возвращаем класс
    onInitMain,
    onInitThumb,
    onThumbClick,
    onSelect,
  }
}
