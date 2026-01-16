import type { Meta, StoryObj } from '@nuxtjs/storybook'
import ActiveOrderStatus from './ActiveOrderStatus.vue'

// Mock data
const mockOrder = {
  id: 'order-abc123',
  created_at: '2025-12-29T10:00:00Z',
  status: 'processing',
  final_amount: 15000,
  delivery_method: 'delivery',
  payment_method: 'cash',
  delivery_address: {
    city: 'Алматы',
    street: 'Абая',
    building: '10',
  },
  bonuses_spent: 500,
  bonuses_awarded: 150,
  order_items: [
    {
      id: 'item-1',
      quantity: 2,
      product: {
        id: 'prod-1',
        name: 'Конструктор LEGO Technic',
        price: 5500,
        product_images: [
          {
            image_url: 'https://via.placeholder.com/400x400/4F46E5/FFFFFF?text=LEGO',
            blur_placeholder: 'data:image/jpeg;base64,/9j/4AAQSkZJRg',
          },
        ],
      },
    },
    {
      id: 'item-2',
      quantity: 1,
      product: {
        id: 'prod-2',
        name: 'Кукла Barbie',
        price: 4000,
        product_images: [
          {
            image_url: 'https://via.placeholder.com/400x400/EC4899/FFFFFF?text=Barbie',
            blur_placeholder: 'data:image/jpeg;base64,/9j/4AAQSkZJRg',
          },
        ],
      },
    },
  ],
}

const meta = {
  title: 'Orders/ActiveOrderStatus',
  component: ActiveOrderStatus,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Компонент отображения активного заказа на главной странице с real-time обновлениями.',
      },
    },
  },
} satisfies Meta<typeof ActiveOrderStatus>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Заказ в обработке - админ взял заказ в работу
 */
export const Processing: Story = {
  render: () => ({
    components: { ActiveOrderStatus },
    setup() {
      // Mock composable
      const mockComposable = () => ({
        activeOrder: ref({ ...mockOrder, status: 'processing' }),
        isLoading: ref(false),
        getStatusColor: (status: string) => 'bg-yellow-100 text-yellow-800',
        getStatusLabel: (status: string) => 'В обработке',
        fetchOrders: async () => {},
        subscribeToOrderUpdates: () => null,
      })

      return { mockComposable }
    },
    template: '<ActiveOrderStatus />',
  }),
}

/**
 * Заказ подтверждён - клиент согласен, готов к доставке
 */
export const Confirmed: Story = {
  render: () => ({
    components: { ActiveOrderStatus },
    setup() {
      const mockComposable = () => ({
        activeOrder: ref({ ...mockOrder, status: 'confirmed' }),
        isLoading: ref(false),
        getStatusColor: (status: string) => 'bg-green-100 text-green-800',
        getStatusLabel: (status: string) => 'Подтверждён',
        fetchOrders: async () => {},
        subscribeToOrderUpdates: () => null,
      })

      return { mockComposable }
    },
    template: '<ActiveOrderStatus />',
  }),
}

/**
 * Новый заказ - только что создан, ждёт обработки
 */
export const NewOrder: Story = {
  render: () => ({
    components: { ActiveOrderStatus },
    setup() {
      const mockComposable = () => ({
        activeOrder: ref({ ...mockOrder, status: 'new' }),
        isLoading: ref(false),
        getStatusColor: (status: string) => 'bg-blue-100 text-blue-800',
        getStatusLabel: (status: string) => 'Новый заказ',
        fetchOrders: async () => {},
        subscribeToOrderUpdates: () => null,
      })

      return { mockComposable }
    },
    template: '<ActiveOrderStatus />',
  }),
}

/**
 * Заказ отправлен - в пути к клиенту
 */
export const Shipped: Story = {
  render: () => ({
    components: { ActiveOrderStatus },
    setup() {
      const mockComposable = () => ({
        activeOrder: ref({ ...mockOrder, status: 'shipped' }),
        isLoading: ref(false),
        getStatusColor: (status: string) => 'bg-indigo-100 text-indigo-800',
        getStatusLabel: (status: string) => 'Отправлен',
        fetchOrders: async () => {},
        subscribeToOrderUpdates: () => null,
      })

      return { mockComposable }
    },
    template: '<ActiveOrderStatus />',
  }),
}

/**
 * Нет активного заказа - компонент скрыт
 */
export const NoActiveOrder: Story = {
  render: () => ({
    components: { ActiveOrderStatus },
    setup() {
      const mockComposable = () => ({
        activeOrder: ref(null),
        isLoading: ref(false),
        getStatusColor: (status: string) => '',
        getStatusLabel: (status: string) => '',
        fetchOrders: async () => {},
        subscribeToOrderUpdates: () => null,
      })

      return { mockComposable }
    },
    template: '<ActiveOrderStatus />',
  }),
}

/**
 * Состояние загрузки
 */
export const Loading: Story = {
  render: () => ({
    components: { ActiveOrderStatus },
    setup() {
      const mockComposable = () => ({
        activeOrder: ref(null),
        isLoading: ref(true),
        getStatusColor: (status: string) => '',
        getStatusLabel: (status: string) => '',
        fetchOrders: async () => {},
        subscribeToOrderUpdates: () => null,
      })

      return { mockComposable }
    },
    template: '<ActiveOrderStatus />',
  }),
}
