import type { Database } from '@/types'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'

export const usePromoCodeStore = defineStore('promoCodeStore', () => {
  const supabase = useSupabaseClient<Database>()

  const appliedCode = ref<string | null>(null)
  const discountPercent = ref(0)
  const discountAmount = ref(0)
  const isValidating = ref(false)

  async function validateCode(code: string, orderAmount: number) {
    if (!code.trim()) {
      toast.error('Введите промокод')
      return false
    }

    isValidating.value = true
    try {
      const { data, error } = await supabase.rpc('validate_promo_code', {
        p_code: code.trim(),
        p_order_amount: orderAmount,
      })

      if (error)
        throw error

      const result = data as unknown as {
        valid: boolean
        discount_percent?: number
        discount_amount?: number
        error?: string
      }

      if (!result.valid) {
        toast.error(result.error || 'Промокод недействителен')
        clearCode()
        return false
      }

      appliedCode.value = code.trim().toUpperCase()
      discountPercent.value = result.discount_percent || 0
      discountAmount.value = result.discount_amount || 0

      toast.success(`Промокод применён! Скидка ${discountPercent.value}%`, {
        description: `Вы сэкономите ${discountAmount.value} ₸`,
      })
      return true
    }
    catch (e: any) {
      toast.error('Ошибка проверки промокода', { description: e.message })
      clearCode()
      return false
    }
    finally {
      isValidating.value = false
    }
  }

  function clearCode() {
    appliedCode.value = null
    discountPercent.value = 0
    discountAmount.value = 0
  }

  return {
    appliedCode,
    discountPercent,
    discountAmount,
    isValidating,
    validateCode,
    clearCode,
  }
})
