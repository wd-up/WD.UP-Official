import React, { useEffect, useRef, useState } from 'react';
import { Bell, BookOpen, CheckCheck, Home, ShoppingBag, ShoppingCart, Sparkles, User as UserIcon } from 'lucide-react';
import { apiFetch, formatDateTimeId } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { MainTab, NotificationItem } from '../types/wdup';

export function Navbar() {
  const {
    user,
    activeTab,
    setActiveTab,
    setAccountSubView,
    closePublicStore,
    cart,
    setCartOpen,
    setAuthModalOpen,
    setAiDrawerOpen,
    unreadNotifications,
    refreshNotifications,
    notifyNotificationsUpdated,
  } = useAuth();

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifItems, setNotifItems] = useState<NotificationItem[]>([]);
  const [loadingNotif, setLoadingNotif] = useState(false);
  const notifContainerRef = useRef<HTMLDivElement | null>(null);

  const totalCartItems = cart.reduce((acc, item) => acc + item.quantity, 0);

  const loadNotificationsList = async () => {
    if (!user) {
      setNotifItems([]);
      return;
    }
    setLoadingNotif(true);
    try {
      const res = await apiFetch<{ notifications: NotificationItem[]; unreadCount: number }>('/api/notifications');
      setNotifItems(res.notifications || []);
    } catch {
      // ignore
    } finally {
      setLoadingNotif(false);
    }
  };

  useEffect(() => {
    if (notifOpen && user) {
      loadNotificationsList();
    }
  }, [notifOpen, user?.id]);

  useEffect(() => {
    if (!notifOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (notifContainerRef.current && !notifContainerRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [notifOpen]);

  const handleSelectTab = (tab: MainTab) => {
    closePublicStore();
    setNotifOpen(false);
    setActiveTab(tab);
    if (tab === 'account') {
      setAccountSubView('overview');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navItems: Array<{ id: MainTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'home', label: 'WD.UP HOME', icon: Home },
    { id: 'academy', label: 'WD.UP ACADEMY', icon: BookOpen },
    { id: 'market', label: 'WD.UP MARKET', icon: ShoppingBag },
    { id: 'account', label: 'MY ACCOUNT', icon: UserIcon },
  ];

  return (
    <>
      {/* Desktop & Mobile Top Header (3-zone contract on desktop, compact 52px bar on mobile) */}
      <header className="sticky top-0 z-40 bg-[#FCF5F1]/95 backdrop-blur-md border-b border-[#3D2C24]/10">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-14 md:h-16 flex items-center justify-between gap-4 md:gap-8">
          {/* Zone 1: Official WD.UP Logo (unmodified, matched #FCF5F1 background) */}
          <button
            onClick={() => handleSelectTab('home')}
            aria-label="Beranda WD.UP"
            className="shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B8E7B] rounded-lg flex items-center"
          >
            <img
              src="/assets/aistudio/file_000000009ff08207aa2f6020b9727e1d_734b5d00.png"
              alt="WD.UP — Women Digital Level Up"
              className="h-12 md:h-14 w-auto object-contain"
            />
          </button>

          {/* Zone 2: 4 single-line nav links on desktop */}
          <nav className="hidden md:flex items-center gap-7" aria-label="Navigasi Utama">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectTab(item.id)}
                  className={`text-sm font-medium whitespace-nowrap shrink-0 py-1.5 border-b-2 transition-colors cursor-pointer ${
                    isActive
                      ? 'text-[#3D2C24] border-[#6B8E7B]'
                      : 'text-[#6E5A50] border-transparent hover:text-[#3D2C24]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary actions (WD.UP AI, Cart, Notification Bell, Account CTA) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setAiDrawerOpen(true)}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#B8A9C9]/20 hover:bg-[#B8A9C9]/35 text-[#3D2C24] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              title="Buka WD.UP AI Asisten Resmi"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#3D2C24]" />
              <span>WD.UP AI</span>
            </button>

            <button
              onClick={() => {
                setNotifOpen(false);
                setCartOpen(true);
              }}
              aria-label="Buka Keranjang Belanja"
              className="relative min-h-[40px] min-w-[40px] px-2.5 rounded-xl bg-[#F2EAE0] hover:bg-[#E7DDD0] text-[#3D2C24] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4" />
              {totalCartItems > 0 && (
                <span className="font-mono tabular-nums text-xs font-semibold text-[#E07A5F]">
                  {totalCartItems}
                </span>
              )}
            </button>

            {/* Notification Bell beside Cart */}
            <div ref={notifContainerRef} className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                aria-label="Notifikasi"
                title="Notifikasi Pesanan & Akun"
                className="relative min-h-[40px] min-w-[40px] px-2.5 rounded-xl bg-[#F2EAE0] hover:bg-[#E7DDD0] text-[#3D2C24] flex items-center justify-center transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E07A5F] text-white font-mono text-[10px] font-bold flex items-center justify-center">
                    {unreadNotifications > 99 ? '99+' : unreadNotifications}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-[#FAF6F0] border border-[#3D2C24]/15 shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-[#3D2C24]/10 bg-[#F2EAE0]/70 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-[#3D2C24]">Notifikasi WD.UP</p>
                      <p className="text-[10px] text-[#6E5A50]">
                        {user
                          ? `${unreadNotifications} belum dibaca`
                          : 'Masuk untuk melihat notifikasi pesanan & kelas Anda'}
                      </p>
                    </div>
                    {user && unreadNotifications > 0 && (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch('/api/notifications/read-all', { method: 'PUT' }).catch(() => {});
                          setNotifItems((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
                          refreshNotifications();
                          notifyNotificationsUpdated();
                        }}
                        className="text-[11px] font-semibold text-[#527362] hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Tandai Semua</span>
                      </button>
                    )}
                  </div>

                  {!user ? (
                    <div className="p-5 text-center space-y-2.5">
                      <Bell className="w-7 h-7 text-[#6E5A50]/50 mx-auto" />
                      <p className="text-xs text-[#6E5A50]">
                        Notifikasi transaksi email/WA, ACC mentor, dan update kelas akan tampil otomatis di sini.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setNotifOpen(false);
                          setAuthModalOpen(true);
                        }}
                        className="px-4 py-2 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold cursor-pointer"
                      >
                        Masuk / Daftar
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="max-h-80 overflow-y-auto divide-y divide-[#3D2C24]/10">
                        {loadingNotif && notifItems.length === 0 ? (
                          <div className="p-4 text-xs text-center text-[#6E5A50]">Memuat notifikasi...</div>
                        ) : notifItems.length === 0 ? (
                          <div className="p-5 text-xs text-center text-[#6E5A50]">Belum ada notifikasi.</div>
                        ) : (
                          notifItems.map((n) => (
                            <button
                              key={n.id}
                              type="button"
                              onClick={async () => {
                                if (!n.is_read) {
                                  await apiFetch(`/api/notifications/${n.id}/read`, { method: 'PUT' }).catch(() => {});
                                  setNotifItems((prev) =>
                                    prev.map((item) => (item.id === n.id ? { ...item, is_read: 1 } : item))
                                  );
                                  refreshNotifications();
                                }
                              }}
                              className={`w-full text-left px-4 py-3 transition-colors cursor-pointer space-y-1 ${
                                n.is_read ? 'bg-white/60 hover:bg-white' : 'bg-[#EFF5F1] hover:bg-[#E4EFE8]'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-semibold text-[#3D2C24] flex items-center gap-1.5">
                                  {!n.is_read && <span className="w-2 h-2 rounded-full bg-[#E07A5F] shrink-0" />}
                                  <span>{n.title}</span>
                                </p>
                                <span className="text-[10px] text-[#6E5A50] shrink-0">
                                  {formatDateTimeId(n.created_at)}
                                </span>
                              </div>
                              <p className="text-[11px] text-[#3D2C24]/85 leading-snug">{n.message}</p>
                              <p className="text-[10px] font-mono text-[#6E5A50]">
                                Email: {n.email_status} · WA: {n.whatsapp_status}
                              </p>
                            </button>
                          ))
                        )}
                      </div>
                      <div className="px-4 py-2.5 border-t border-[#3D2C24]/10 bg-white flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            closePublicStore();
                            setActiveTab('account');
                            setAccountSubView('activity');
                          }}
                          className="text-xs font-semibold text-[#527362] hover:underline cursor-pointer"
                        >
                          Lihat Semua di My Activity
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {user ? (
              <button
                onClick={() => handleSelectTab('account')}
                className="hidden sm:flex min-h-[40px] px-3.5 py-2 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold hover:bg-[#2A1D17] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {user.name.split(' ')[0]}
              </button>
            ) : (
              <button
                onClick={() => setAuthModalOpen(true)}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold hover:bg-[#2A1D17] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Masuk
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Fixed Bottom Navigation — Strictly 4 items */}
      <nav
        aria-label="Navigasi Bawah Mobile"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FAF6F0]/95 backdrop-blur-md border-t border-[#3D2C24]/10"
      >
        <div className="grid grid-cols-4 items-center h-16 px-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelectTab(item.id)}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-1 rounded-xl transition-colors cursor-pointer ${
                  isActive ? 'text-[#527362]' : 'text-[#6E5A50]'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.4]' : 'stroke-[1.8]'}`} />
                <span className="text-[10px] font-semibold tracking-tight leading-none whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
