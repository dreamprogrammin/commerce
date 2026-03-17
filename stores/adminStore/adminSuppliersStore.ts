import type { Supplier, SupplierInsert, SupplierUpdate } from '@/types'
import { toast } from 'vue-sonner'

export const useAdminSuppliersStore = defineStore('adminSuppliersStore', () => {
  const supabase = useSupabaseClient()

  const suppliers = ref<Supplier[]>([])
  const currentSupplier = ref<Supplier | null>(null)
  const isLoading = ref(false)

  async function fetchSuppliers() {
    isLoading.value = true
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name', { ascending: true })
      if (error)
        throw error
      suppliers.value = (data as Supplier[]) || []
    }
    catch (error: any) {
      toast.error('Ошибка загрузки поставщиков', { description: error.message })
    }
    finally {
      isLoading.value = false
    }
  }

  async function fetchSupplierById(id: string) {
    isLoading.value = true
    currentSupplier.value = null
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', id)
        .single()
      if (error)
        throw error
      currentSupplier.value = data as Supplier
    }
    catch (error: any) {
      toast.error('Ошибка загрузки поставщика', { description: error.message })
    }
    finally {
      isLoading.value = false
    }
  }

  async function createSupplier(supplierData: SupplierInsert): Promise<Supplier | null> {
    isLoading.value = true
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert(supplierData)
        .select()
        .single()
      if (error)
        throw error

      const newSupplier = data as Supplier
      toast.success(`Поставщик "${newSupplier.name}" создан`)
      await fetchSuppliers()
      return newSupplier
    }
    catch (error: any) {
      toast.error('Ошибка создания поставщика', { description: error.message })
      return null
    }
    finally {
      isLoading.value = false
    }
  }

  async function updateSupplier(id: string, supplierData: SupplierUpdate): Promise<boolean> {
    isLoading.value = true
    try {
      const { error } = await supabase
        .from('suppliers')
        .update(supplierData)
        .eq('id', id)
      if (error)
        throw error

      toast.success(`Поставщик "${supplierData.name}" обновлён`)
      await fetchSuppliers()
      return true
    }
    catch (error: any) {
      toast.error('Ошибка обновления поставщика', { description: error.message })
      return false
    }
    finally {
      isLoading.value = false
    }
  }

  async function deleteSupplier(supplier: Supplier): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', supplier.id)
      if (error)
        throw error

      toast.success(`Поставщик "${supplier.name}" удалён`)
      suppliers.value = suppliers.value.filter(s => s.id !== supplier.id)
      return true
    }
    catch (error: any) {
      toast.error('Ошибка удаления поставщика', { description: error.message })
      return false
    }
  }

  return {
    suppliers,
    currentSupplier,
    isLoading,
    fetchSuppliers,
    fetchSupplierById,
    createSupplier,
    updateSupplier,
    deleteSupplier,
  }
})
