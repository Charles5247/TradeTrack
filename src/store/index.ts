import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, CartItem, Cart, Warehouse, SyncStatus } from '@/types';

// ── Auth Store ────────────────────────────────────────────────
interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
}));

// ── Cart Store (POS) ──────────────────────────────────────────
interface CartState extends Cart {
  addItem: (item: Omit<CartItem, 'discount'> & { discount?: number }) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  updateDiscount: (productId: string, discount: number) => void;
  setCartDiscount: (discount: number) => void;
  setTaxRate: (rate: number) => void;
  setWarehouse: (warehouseId: string) => void;
  setPaymentMethod: (method: Cart['payment_method']) => void;
  setCustomer: (name?: string, phone?: string) => void;
  setNotes: (notes: string) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getDiscountAmount: () => number;
  getTaxAmount: () => number;
  getTotal: () => number;
}

const defaultCart: Cart = {
  items: [],
  discount: 0,
  tax_rate: 0,
  warehouse_id: '',
  payment_method: 'cash',
  customer_name: undefined,
  customer_phone: undefined,
  notes: undefined,
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      ...defaultCart,

      addItem: (item) => {
        const { items } = get();
        const existingIndex = items.findIndex(
          (i) => i.product.id === item.product.id
        );

        if (existingIndex >= 0) {
          const updated = [...items];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: updated[existingIndex].quantity + item.quantity,
          };
          set({ items: updated });
        } else {
          set({ items: [...items, { ...item, discount: item.discount ?? 0 }] });
        }
      },

      removeItem: (productId) => {
        set({ items: get().items.filter((i) => i.product.id !== productId) });
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }
        set({
          items: get().items.map((i) =>
            i.product.id === productId ? { ...i, quantity } : i
          ),
        });
      },

      updateDiscount: (productId, discount) => {
        set({
          items: get().items.map((i) =>
            i.product.id === productId ? { ...i, discount } : i
          ),
        });
      },

      setCartDiscount: (discount) => set({ discount }),
      setTaxRate: (tax_rate) => set({ tax_rate }),
      setWarehouse: (warehouse_id) => set({ warehouse_id }),
      setPaymentMethod: (payment_method) => set({ payment_method }),
      setCustomer: (customer_name, customer_phone) =>
        set({ customer_name, customer_phone }),
      setNotes: (notes) => set({ notes }),
      clearCart: () => set({ ...defaultCart }),

      getSubtotal: () => {
        return get().items.reduce((sum, item) => {
          const itemTotal = item.unit_price * item.quantity;
          const itemDiscount = (itemTotal * item.discount) / 100;
          return sum + itemTotal - itemDiscount;
        }, 0);
      },

      getDiscountAmount: () => {
        const subtotal = get().getSubtotal();
        return (subtotal * get().discount) / 100;
      },

      getTaxAmount: () => {
        const subtotal = get().getSubtotal();
        const discountAmount = get().getDiscountAmount();
        return ((subtotal - discountAmount) * get().tax_rate) / 100;
      },

      getTotal: () => {
        const subtotal = get().getSubtotal();
        const discount = get().getDiscountAmount();
        const tax = get().getTaxAmount();
        return subtotal - discount + tax;
      },
    }),
    {
      name: 'tradetrack-cart',
      partialize: (state) => ({
        items: state.items,
        discount: state.discount,
        tax_rate: state.tax_rate,
        warehouse_id: state.warehouse_id,
        payment_method: state.payment_method,
        customer_name: state.customer_name,
        customer_phone: state.customer_phone,
        notes: state.notes,
      }),
    }
  )
);

// ── UI Store ──────────────────────────────────────────────────
interface UIState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  locale: string;
  setLocale: (locale: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarOpen: true,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
      theme: 'light',
      setTheme: (theme) => set({ theme }),
      locale: 'en',
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'tradetrack-ui' }
  )
);

// ── Sync Store ────────────────────────────────────────────────
interface SyncState {
  syncStatus: SyncStatus;
  lastSync: Date | null;
  pendingCount: number;
  setSyncStatus: (status: SyncStatus) => void;
  setLastSync: (date: Date) => void;
  setPendingCount: (count: number) => void;
}

export const useSyncStore = create<SyncState>()((set) => ({
  syncStatus: 'pending',
  lastSync: null,
  pendingCount: 0,
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  setLastSync: (lastSync) => set({ lastSync }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
}));

// ── Notification Store ────────────────────────────────────────
interface NotificationState {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
  decrementUnread: () => void;
  selectedWarehouse: Warehouse | null;
  setSelectedWarehouse: (warehouse: Warehouse | null) => void;
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  unreadCount: 0,
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  incrementUnread: () => set({ unreadCount: get().unreadCount + 1 }),
  decrementUnread: () =>
    set({ unreadCount: Math.max(0, get().unreadCount - 1) }),
  selectedWarehouse: null,
  setSelectedWarehouse: (selectedWarehouse) => set({ selectedWarehouse }),
}));
