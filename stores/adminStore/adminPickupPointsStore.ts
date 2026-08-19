import { toast } from 'vue-sonner'

export interface PickupPoint {
  id: string
  name: string
  address: string
  working_hours: string | null
  phone: string | null
  note: string | null
  is_active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export type PickupPointInput = Omit<
  PickupPoint,
  'id' | 'created_at' | 'updated_at'
>

/**
 * Пункты самовывоза — справочник, который заполняет администратор.
 *
 * Витрина показывает из него только активные (это же ограничение стоит в RLS),
 * поэтому «удалить» здесь редко нужно: закрытый пункт достаточно снять с
 * публикации, и заказы, которые через него прошли, сохранят ссылку.
 */
export const useAdminPickupPointsStore = defineStore(
  'adminPickupPointsStore',
  () => {
    const supabase = useSupabaseClient()

    const points = ref<PickupPoint[]>([])
    const isLoading = ref(false)

    async function fetchPoints() {
      isLoading.value = true
      try {
        const { data, error } = await supabase
          .from('pickup_points')
          .select('*')
          .order('display_order', { ascending: true })
          .order('name', { ascending: true })

        if (error)
          throw error
        points.value = (data ?? []) as unknown as PickupPoint[]
      }
      catch (e: any) {
        toast.error('Не удалось загрузить пункты самовывоза', {
          description: e.message,
        })
      }
      finally {
        isLoading.value = false
      }
    }

    async function createPoint(input: PickupPointInput): Promise<boolean> {
      try {
        const { error } = await supabase
          .from('pickup_points')
          .insert(input as never)

        if (error)
          throw error
        toast.success('Пункт самовывоза добавлен')
        await fetchPoints()
        return true
      }
      catch (e: any) {
        toast.error('Не удалось добавить пункт', { description: e.message })
        return false
      }
    }

    async function updatePoint(
      id: string,
      input: Partial<PickupPointInput>,
    ): Promise<boolean> {
      try {
        const { error } = await supabase
          .from('pickup_points')
          .update(input as never)
          .eq('id', id)

        if (error)
          throw error
        toast.success('Изменения сохранены')
        await fetchPoints()
        return true
      }
      catch (e: any) {
        toast.error('Не удалось сохранить', { description: e.message })
        return false
      }
    }

    async function deletePoint(point: PickupPoint): Promise<boolean> {
      try {
        const { error } = await supabase
          .from('pickup_points')
          .delete()
          .eq('id', point.id)

        if (error)
          throw error
        toast.success(`Пункт «${point.name}» удалён`)
        await fetchPoints()
        return true
      }
      catch (e: any) {
        toast.error('Не удалось удалить пункт', { description: e.message })
        return false
      }
    }

    return {
      points,
      isLoading,
      fetchPoints,
      createPoint,
      updatePoint,
      deletePoint,
    }
  },
)
