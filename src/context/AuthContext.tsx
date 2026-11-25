import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onIdTokenChanged, signOut } from 'firebase/auth';
import { apiFetch, getAuthToken, setAuthToken, verifyCookieSession } from '../lib/api';
import { auth } from '../lib/firebase';
import type { AccountSubView, CartItem, MainTab, User } from '../types/wdup';

interface ToastMessage {
  id: string;
  text: string;
  tone: 'sage' | 'coral' | 'brown';
}

interface AuthContextValue {
  user: User | null;
  adminClaimed: boolean;
  envPasscodeConfigured: boolean;
  adminPasscodeConfigured: boolean;
  mentorPasscodeConfigured: boolean;
  loadingAuth: boolean;
  activeTab: MainTab;
  setActiveTab: (tab: MainTab) => void;
  accountSubView: AccountSubView;
  setAccountSubView: (view: AccountSubView) => void;
  publicStoreUsername: string | null;
  openPublicStore: (username: string) => void;
  closePublicStore: () => void;
  cart: CartItem[];
  addToCart: (item: CartItem, openDrawer?: boolean) => void;
  removeFromCart: (itemType: string, itemId: string) => void;
  updateCartQty: (itemType: string, itemId: string, qty: number) => void;
  clearCart: () => void;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  aiDrawerOpen: boolean;
  setAiDrawerOpen: (open: boolean) => void;
  activeReferral: string | null;
  setActiveReferral: (username: string | null) => void;
  marketFilterPillar: string;
  setMarketFilterPillar: (pillar: string) => void;
  selectedClassId: string | null;
  setSelectedClassId: (id: string | null) => void;
  catalogVersion: number;
  notifyCatalogUpdated: () => void;
  unreadNotifications: number;
  refreshNotifications: () => Promise<void>;
  notifyNotificationsUpdated: () => void;
  refreshAuth: () => Promise<void>;
  loginSuccess: (token: string, user: User) => void;
  logout: () => void;
  cookieBlockedInIframe: boolean;
  enablePersistentCookieSession: () => Promise<boolean>;
  toast: (text: string, tone?: 'sage' | 'coral' | 'brown') => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const userRef = useRef<User | null>(null);
  const [adminClaimed, setAdminClaimed] = useState(true);
  const [envPasscodeConfigured, setEnvPasscodeConfigured] = useState(false);
  const [adminPasscodeConfigured, setAdminPasscodeConfigured] = useState(false);
  const [mentorPasscodeConfigured, setMentorPasscodeConfigured] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [cookieBlockedInIframe, setCookieBlockedInIframe] = useState(false);

  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [accountSubView, setAccountSubView] = useState<AccountSubView>('overview');
  const [publicStoreUsername, setPublicStoreUsername] = useState<string | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [activeReferral, setActiveReferral] = useState<string | null>(null);
  const [marketFilterPillar, setMarketFilterPillar] = useState<string>('Semua');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    const onCatalogUpdated = () => setCatalogVersion((v) => v + 1);
    window.addEventListener('wdup:catalog-updated', onCatalogUpdated);
    return () => window.removeEventListener('wdup:catalog-updated', onCatalogUpdated);
  }, []);

  const notifyCatalogUpdated = useCallback(() => {
    window.dispatchEvent(new Event('wdup:catalog-updated'));
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!userRef.current) {
      setUnreadNotifications(0);
      return;
    }
    try {
      const res = await apiFetch<{ unreadCount: number }>('/api/notifications');
      setUnreadNotifications(res.unreadCount || 0);
    } catch {
      // ignore transient notification fetch failure
    }
  }, []);

  const notifyNotificationsUpdated = useCallback(() => {
    window.dispatchEvent(new Event('wdup:notifications-updated'));
  }, []);

  useEffect(() => {
    const onNotifUpdated = () => {
      refreshNotifications();
    };
    window.addEventListener('wdup:notifications-updated', onNotifUpdated);
    return () => window.removeEventListener('wdup:notifications-updated', onNotifUpdated);
  }, [refreshNotifications]);

  useEffect(() => {
    if (user?.id) {
      refreshNotifications();
    } else {
      setUnreadNotifications(0);
    }
  }, [user?.id, refreshNotifications]);

  const toast = useCallback((text: string, tone: 'sage' | 'coral' | 'brown' = 'sage') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      const data = await apiFetch<{
        adminClaimed: boolean;
        envPasscodeConfigured: boolean;
        adminPasscodeConfigured?: boolean;
        mentorPasscodeConfigured?: boolean;
        currentUser: User | null;
        authenticatedVia?: 'cookie' | 'bearer' | 'none';
      }>('/api/auth/status');
      setAdminClaimed(data.adminClaimed);
      setEnvPasscodeConfigured(data.envPasscodeConfigured);
      setAdminPasscodeConfigured(Boolean(data.adminPasscodeConfigured));
      setMentorPasscodeConfigured(Boolean(data.mentorPasscodeConfigured));
      if (data.currentUser) {
        setUser(data.currentUser);
      } else if (data.authenticatedVia === 'none' && !getAuthToken()) {
        setUser(null);
      }
    } catch {
      // keep active session intact on transient network/wake-up errors
    } finally {
      setLoadingAuth(false);
    }
  }, []);

  const hadFirebaseUserRef = useRef(false);

  useEffect(() => {
    refreshAuth();
    // Check URL parameters for referral or store landing page
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    const store = params.get('store');
    if (ref) {
      setActiveReferral(ref);
      apiFetch('/api/affiliate/track-click', {
        method: 'POST',
        body: JSON.stringify({ ref }),
      }).catch(() => {});
    }
    if (store) {
      setPublicStoreUsername(store);
    }
  }, [refreshAuth]);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (fbUser) => {
      if (fbUser) {
        hadFirebaseUserRef.current = true;
        try {
          const token = await fbUser.getIdToken();
          setAuthToken(token);
          await refreshAuth();
        } catch {
          // ignore transient token refresh failures
        }
      } else if (hadFirebaseUserRef.current) {
        hadFirebaseUserRef.current = false;
        if (!getAuthToken()?.startsWith('wdup_')) {
          setAuthToken(null);
          await refreshAuth();
        }
      }
    });
    return () => unsubscribe();
  }, [refreshAuth]);

  // Keep session & connection alive stably without re-creating listeners on every user update
  useEffect(() => {
    const keepAliveTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        apiFetch('/api/health').catch(() => {});
        if (getAuthToken() || userRef.current) {
          refreshAuth();
          refreshNotifications();
        }
      }
    }, 4 * 60 * 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshAuth();
        refreshNotifications();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(keepAliveTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshAuth, refreshNotifications]);

  const loginSuccess = useCallback((token: string, nextUser: User) => {
    setAuthToken(token);
    setUser(nextUser);
    setAdminClaimed((prev) => prev || nextUser.role === 'admin');
    setAuthModalOpen(false);
    verifyCookieSession().then((accepted) => {
      setCookieBlockedInIframe(!accepted);
    });
  }, []);

  const enablePersistentCookieSession = useCallback(async (): Promise<boolean> => {
    try {
      if (typeof document !== 'undefined' && typeof document.requestStorageAccess === 'function') {
        await document.requestStorageAccess();
      }
    } catch {
      // Browser denied storage access inside iframe; check cookie anyway after refresh-cookie
    }
    try {
      await apiFetch('/api/auth/refresh-cookie', { method: 'POST' });
    } catch {
      return false;
    }
    const accepted = await verifyCookieSession();
    setCookieBlockedInIframe(!accepted);
    if (accepted) {
      toast('Simpan sesi otomatis aktif! Akun Anda kini tetap login saat aplikasi diperbarui.', 'sage');
    } else {
      toast('Browser masih memblokir cookie di mode preview. Gunakan tombol "Buka di Tab Baru".', 'coral');
    }
    return accepted;
  }, [toast]);

  const logout = useCallback(() => {
    signOut(auth).catch(() => {});
    apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setAuthToken(null);
    setUser(null);
    setCookieBlockedInIframe(false);
    setAccountSubView('overview');
    toast('Anda telah keluar dari akun WD.UP.', 'brown');
  }, [toast]);

  const openPublicStore = useCallback((username: string) => {
    setPublicStoreUsername(username);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const closePublicStore = useCallback(() => {
    setPublicStoreUsername(null);
  }, []);

  const addToCart = useCallback(
    (item: CartItem, openDrawer = false) => {
      setCart((prev) => {
        const existing = prev.find((c) => c.item_type === item.item_type && c.item_id === item.item_id);
        if (existing) {
          if (item.item_type !== 'product') {
            return prev;
          }
          const hasCustomConfig = item.custom_price !== undefined || (item.selected_addons && item.selected_addons.length > 0);
          return prev.map((c) =>
            c.item_type === item.item_type && c.item_id === item.item_id
              ? {
                  ...c,
                  price: hasCustomConfig ? item.price : c.price,
                  custom_price: item.custom_price !== undefined ? item.custom_price : c.custom_price,
                  selected_addons: item.selected_addons !== undefined ? item.selected_addons : c.selected_addons,
                  quantity: hasCustomConfig ? item.quantity : c.quantity + item.quantity,
                  affiliate_username: item.affiliate_username || c.affiliate_username,
                }
              : c
          );
        }
        return [...prev, { ...item, affiliate_username: item.affiliate_username || activeReferral || undefined }];
      });
      if (openDrawer) {
        setCartOpen(true);
      } else {
        toast(`"${item.title}" ditambahkan ke keranjang.`, 'sage');
      }
    },
    [activeReferral, toast]
  );

  const removeFromCart = useCallback((itemType: string, itemId: string) => {
    setCart((prev) => prev.filter((c) => !(c.item_type === itemType && c.item_id === itemId)));
  }, []);

  const updateCartQty = useCallback((itemType: string, itemId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => !(c.item_type === itemType && c.item_id === itemId)));
      return;
    }
    setCart((prev) =>
      prev.map((c) => (c.item_type === itemType && c.item_id === itemId ? { ...c, quantity: qty } : c))
    );
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        adminClaimed,
        envPasscodeConfigured,
        adminPasscodeConfigured,
        mentorPasscodeConfigured,
        loadingAuth,
        activeTab,
        setActiveTab,
        accountSubView,
        setAccountSubView,
        publicStoreUsername,
        openPublicStore,
        closePublicStore,
        cart,
        addToCart,
        removeFromCart,
        updateCartQty,
        clearCart,
        cartOpen,
        setCartOpen,
        authModalOpen,
        setAuthModalOpen,
        aiDrawerOpen,
        setAiDrawerOpen,
        activeReferral,
        setActiveReferral,
        marketFilterPillar,
        setMarketFilterPillar,
        selectedClassId,
        setSelectedClassId,
        catalogVersion,
        notifyCatalogUpdated,
        unreadNotifications,
        refreshNotifications,
        notifyNotificationsUpdated,
        refreshAuth,
        loginSuccess,
        logout,
        cookieBlockedInIframe,
        enablePersistentCookieSession,
        toast,
      }}
    >
      {children}
      {/* Toast feedback container */}
      <div className="fixed top-4 right-4 z-[90] flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${
              t.tone === 'coral'
                ? 'bg-[#FFF5F2] border-[#E07A5F]/40 text-[#3D2C24]'
                : t.tone === 'brown'
                ? 'bg-[#3D2C24] border-[#3D2C24] text-[#FAF6F0]'
                : 'bg-[#F1F6F3] border-[#6B8E7B]/40 text-[#3D2C24]'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
