import type { Supplier, SupplierChannel, SupplierInsert, SupplierUpdate } from '@/types'
import type { ChannelCheck } from '@/utils/telegramChannel'
import { toast } from 'vue-sonner'

export const useAdminSuppliersStore = defineStore('adminSuppliersStore', () => {
  const supabase = useSupabaseClient()

  const suppliers = ref<Supplier[]>([])
  const currentSupplier = ref<Supplier | null>(null)
  const isLoading = ref(false)

  // Каналы в Telegram (3.11.2026) — через сервер админки: канал он проверяет
  // у самого Telegram. false — на этой базе ещё нет миграции каналов
  const channels = ref<SupplierChannel[]>([])
  const channelsInstalled = ref(true)

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
      // Каналы база удалила вместе с поставщиком
      channels.value = channels.value.filter(c => c.supplier_id !== supplier.id)
      return true
    }
    catch (error: any) {
      toast.error('Ошибка удаления поставщика', { description: error.message })
      return false
    }
  }

  async function fetchChannels() {
    try {
      const res = await adminFetch<{ installed: boolean, channels: SupplierChannel[] }>('/api/admin/suppliers/channels')
      channelsInstalled.value = res.installed
      channels.value = res.channels
    }
    catch (error: any) {
      toast.error('Ошибка загрузки каналов', { description: error.data?.message || error.message })
    }
  }

  /** Канал по ссылке — у Telegram, без записи. Отказ — исключением, причина в `data.message`. */
  function checkChannel(link: string) {
    return adminFetch<ChannelCheck>('/api/admin/suppliers/channels/check', { method: 'POST', body: { link } })
  }

  function addChannel(supplierId: string, link: string) {
    return adminFetch<SupplierChannel>('/api/admin/suppliers/channels', { method: 'POST', body: { supplierId, link } })
  }

  function removeChannel(id: string) {
    return adminFetch(`/api/admin/suppliers/channels/${id}`, { method: 'DELETE' })
  }

  return {
    suppliers,
    currentSupplier,
    isLoading,
    channels,
    channelsInstalled,
    fetchSuppliers,
    fetchSupplierById,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    fetchChannels,
    checkChannel,
    addChannel,
    removeChannel,
  }
})
