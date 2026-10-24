import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, CartItem, Cart, Warehouse, SyncStatus } from "@/types";
import { accountIdentity, advanceAccountRevision, readAccountState } from '@/lib/auth/account-state';
import { setOfflineAccountNamespace } from '@/lib/offline/auth-cache';
import { roundMoney } from '@/lib/utils/money';

// ── Auth Store ────────────────────────────────────────────────
interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isLoading: true,
  setUser: (user) => {
    const activeUser = user?.status === 'active' ? user : null;
    if (accountIdentity(get().user) !== accountIdentity(activeUser)) {
      advanceAccountRevision();
      switchAccountState(activeUser);
    }
    set({ user: activeUser });
  },
  setLoading: (isLoading) => set({ isLoading }),
}));

// ── Organization Store (currency, org-level settings) ──────────
interface OrgState {
  currency: string;
  organizationName: string;
  /** Organization's postal/street address, used on receipt headers. */
  organizationAddress: string;
  /** Organization's phone number, shown as "Telp: ..." on receipt headers. */
  organizationPhone: string;
  setCurrency: (currency: string) => void;
  setOrganizationName: (name: string) => void;
  setOrganizationAddress: (address: string) => void;
  setOrganizationPhone: (phone: string) => void;
}

export const useOrgStore = create<OrgState>()(
  persist(
    (set) => ({
      currency: "NGN",
      organizationName: "TracKasuwa",
      organizationAddress: "",
      organizationPhone: "",
      setCurrency: (currency) => set({ currency }),
      setOrganizationName: (organizationName) => set({ organizationName }),
      setOrganizationAddress: (organizationAddress) =>
        set({ organizationAddress }),
      setOrganizationPhone: (organizationPhone) => set({ organizationPhone }),
    }),
    { name: 'TracKasuwa-org:signed-out', skipHydration: true },
  ),
);

// ── Cart Store (POS) ──────────────────────────────────────────
interface CartState extends Cart {
  addItem: (item: Omit<CartItem, "discount"> & { discount?: number }) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  updateDiscount: (productId: string, discount: number) => void;
  setCartDiscount: (discount: number) => void;
  setTaxRate: (rate: number) => void;
  setWarehouse: (warehouseId: string) => void;
  setPaymentMethod: (method: Cart["payment_method"]) => void;
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
  warehouse_id: "",
  payment_method: "cash",
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
          (i) => i.product.id === item.product.id,
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
            i.product.id === productId ? { ...i, quantity } : i,
          ),
        });
      },

      updateDiscount: (productId, discount) => {
        set({
          items: get().items.map((i) =>
            i.product.id === productId ? { ...i, discount } : i,
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
        return roundMoney(get().items.reduce((sum, item) => {
          const itemTotal = item.unit_price * item.quantity;
          const itemDiscount = (itemTotal * item.discount) / 100;
          return sum + roundMoney(itemTotal - itemDiscount);
        }, 0));
      },

      getDiscountAmount: () => {
        const subtotal = get().getSubtotal();
        return roundMoney((subtotal * get().discount) / 100);
      },

      getTaxAmount: () => {
        const subtotal = get().getSubtotal();
        const discountAmount = get().getDiscountAmount();
        return roundMoney(((subtotal - discountAmount) * get().tax_rate) / 100);
      },

      getTotal: () => {
        const subtotal = get().getSubtotal();
        const discount = get().getDiscountAmount();
        const tax = get().getTaxAmount();
        return roundMoney(subtotal - discount + tax);
      },
    }),
    {
      name: 'TracKasuwa-cart:signed-out',
      skipHydration: true,
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
    },
  ),
);

// ── UI Store ──────────────────────────────────────────────────
// `density` is the Retail design system's user-facing density preference
// (README §4.6 / §10): 'comfortable' | 'balanced' | 'dense'. It drives the
// [data-density="..."] attribute applied near the app root (see AppScreen /
// DashboardLayout), which in turn sets the --row-h/--input-h/--btn-h/
// --card-pad CSS vars in globals.css. POS/KDS screens force Comfortable and
// Reports/Admin screens force Dense regardless of this global setting, via
// their own [data-pos-mode]/[data-dense-mode] attributes (higher CSS
// specificity is not needed there since those attributes live on a
// descendant element and simply redeclare the same custom properties).
interface UIState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
  toggleMobileSidebar: () => void;
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;
  density: "comfortable" | "balanced" | "dense";
  setDensity: (density: "comfortable" | "balanced" | "dense") => void;
  locale: string;
  setLocale: (locale: string) => void;
  /** ⌘K command palette open state (README §9.1) — not persisted, so it
   * always starts closed on load; shared here (rather than local
   * component state) so both the Header's search field/kbd hint and the
   * global ⌘K keyboard shortcut listener in CommandPalette can open it. */
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarOpen: true,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
      mobileSidebarOpen: false,
      setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
      toggleMobileSidebar: () =>
        set({ mobileSidebarOpen: !get().mobileSidebarOpen }),
      theme: "light",
      setTheme: (theme) => set({ theme }),
      density: "balanced",
      setDensity: (density) => set({ density }),
      locale: "en",
      setLocale: (locale) => set({ locale }),
      commandPaletteOpen: false,
      setCommandPaletteOpen: (commandPaletteOpen) =>
        set({ commandPaletteOpen }),
    }),
    {
      name: "TracKasuwa-ui",
      // Never persist the transient command-palette open flag across
      // reloads/tabs — only sidebarOpen/theme/density/locale are durable
      // preferences.
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        theme: state.theme,
        density: state.density,
        locale: state.locale,
      }),
    },
  ),
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
  syncStatus: "pending",
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

function switchAccountState(user: User | null): void {
  const accountKey = user ? `${user.organization_id ?? 'platform'}:${user.id}` : 'signed-out';
  const cartKey = `TracKasuwa-cart:${accountKey}`;
  const orgKey = `TracKasuwa-org:${accountKey}`;
  // Read before changing persistence options: resetting the in-memory store
  // must not overwrite a returning account's saved draft with an empty one.
  const savedCart = user ? readAccountState(cartKey) : {};
  const savedOrg = user ? readAccountState(orgKey) : {};
  const items = Array.isArray(savedCart.items) && savedCart.items.every(item =>
    item?.product?.organization_id === user?.organization_id && Number.isSafeInteger(item.quantity) && item.quantity > 0)
    ? savedCart.items as CartItem[] : [];
  const cart = { ...defaultCart, items };
  for (const key of ['discount', 'tax_rate'] as const) {
    if (typeof savedCart[key] === 'number' && Number.isFinite(savedCart[key]) && savedCart[key] >= 0 && savedCart[key] <= 100) {
      cart[key] = savedCart[key];
    }
  }
  if (typeof savedCart.warehouse_id === 'string') cart.warehouse_id = savedCart.warehouse_id;
  if (typeof savedCart.notes === 'string') cart.notes = savedCart.notes;
  if (typeof savedCart.customer_name === 'string') cart.customer_name = savedCart.customer_name;
  if (typeof savedCart.customer_phone === 'string') cart.customer_phone = savedCart.customer_phone;
  if (['cash', 'transfer', 'pos_terminal', 'split', 'partial'].includes(String(savedCart.payment_method))) {
    cart.payment_method = savedCart.payment_method as Cart['payment_method'];
  }
  useCartStore.persist.setOptions({ name: cartKey });
  useCartStore.setState(cart);
  useOrgStore.persist.setOptions({ name: orgKey });
  useOrgStore.setState({
    currency: typeof savedOrg.currency === 'string' ? savedOrg.currency : 'NGN',
    organizationName: typeof savedOrg.organizationName === 'string' ? savedOrg.organizationName : 'TracKasuwa',
    organizationAddress: typeof savedOrg.organizationAddress === 'string' ? savedOrg.organizationAddress : '',
    organizationPhone: typeof savedOrg.organizationPhone === 'string' ? savedOrg.organizationPhone : '',
  });
  useNotificationStore.setState({ unreadCount: 0, selectedWarehouse: null });
  useSyncStore.setState({ syncStatus: 'pending', lastSync: null, pendingCount: 0 });
  if (user) setOfflineAccountNamespace(user as unknown as Record<string, unknown>);
}
