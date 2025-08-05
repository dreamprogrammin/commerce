import type { Database, ICartItem, Product } from "@/types";
import { toast } from "vue-sonner";

export const useCartStore = defineStore('cartStore', () => {
  const supabase = useSupabaseClient<Database>();
  const router = useRouter();

  const items = ref<ICartItem[]>([]);
  const isProcessing = ref(false); // Переименовал isLoading в isProcessing для ясности

  const totalItems = computed(() => items.value.reduce((sum, item) => sum + item.quantity, 0));
  const subtotal = computed(() => items.value.reduce((sum, item) => sum + (Number(item.product.price) * item.quantity), 0));
  
  function addItem(product: Product, quantity: number = 1) {
    const existingItem = items.value.find(i => i.product.id === product.id);
    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      items.value.push({ product, quantity });
    }
    toast.success(`"${product.name}" добавлен в корзину`);
  }

  function removeItem(productId: string) {
    items.value = items.value.filter(i => i.product.id !== productId);
  }
  
  function updateQuantity(productId: string, quantity: number) {
     const item = items.value.find(i => i.product.id === productId);
     if (item) {
        if (quantity > 0) { item.quantity = quantity; } 
        else { removeItem(productId); }
     }
  }

  function clearCart() {
    items.value = [];
  }

  async function checkout(orderData: {
    deliveryMethod: 'pickup' | 'courier';
    paymentMethod: string;
    deliveryAddress?: { line1: string; city: string; postalCode?: string };
    guestInfo?: { name: string; email: string; phone: string };
    bonusesToSpend?: number;
  }) {
    if (items.value.length === 0) {
      toast.error('Ваша корзина пуста');
      return;
    }
    isProcessing.value = true;
    try {
      const cartItemsForRpc = items.value.map(item => ({
        product_id: item.product.id,
        quantity: item.quantity,
      }));

      const { data: newOrderId, error } = await supabase.rpc('create_order', {
        p_cart_items: cartItemsForRpc,
        p_delivery_method: orderData.deliveryMethod,
        p_payment_method: orderData.paymentMethod,
        p_delivery_address: orderData.deliveryAddress,
        p_guest_info: orderData.guestInfo,
        p_bonuses_to_spend: orderData.bonusesToSpend,
      });

      if (error) throw error;
      
      toast.success('Заказ успешно создан!', {
        description: 'Наш менеджер скоро свяжется с вами.',
      });
      
      clearCart();
      await router.push(`/order/success/${newOrderId}`);

    } catch (e: any) {
      toast.error('Ошибка оформления заказа', {
        description: e.message || 'Пожалуйста, попробуйте еще раз.',
      });
    } finally {
      isProcessing.value = false;
    }
  }

  return { items, isProcessing, totalItems, subtotal, addItem, removeItem, updateQuantity, clearCart, checkout };
}, {
  persist: true, // Включаем сохранение корзины в localStorage
});