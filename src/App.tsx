import React, { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { HomeView } from './components/HomeView';
import { AcademyView } from './components/AcademyView';
import { MarketView } from './components/MarketView';
import { AccountView } from './components/AccountView';
import { StorefrontView } from './components/StorefrontView';
import { AuthModal } from './components/AuthModal';
import { CartCheckoutDrawer } from './components/CartCheckoutDrawer';
import { WdupAiDrawer } from './components/WdupAiDrawer';

interface ErrorBoundaryState {
  hasError: boolean;
  resetCounter: number;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, resetCounter: 0 };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[WD.UP UI Boundary]', error?.message || error, info?.componentStack);
  }

  handleRecover = () => {
    this.setState((prev) => ({ hasError: false, resetCounter: prev.resetCounter + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FCF5F1] text-[#3D2C24] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-3xl border border-[#3D2C24]/12 p-6 text-center space-y-3 shadow-sm">
            <h1 className="font-display text-xl font-semibold text-[#3D2C24]">
              Tampilan Perlu Disegarkan
            </h1>
            <p className="text-xs text-[#6E5A50] leading-relaxed">
              Koneksi atau halaman sempat terjeda saat terbuka lama. Ketuk tombol di bawah untuk memulihkan tampilan tanpa mengeluarkan akun Anda.
            </p>
            <button
              onClick={this.handleRecover}
              className="px-5 py-2.5 rounded-xl bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] text-xs font-semibold cursor-pointer"
            >
              Muat Ulang Tampilan
            </button>
          </div>
        </div>
      );
    }
    return <React.Fragment key={this.state.resetCounter}>{this.props.children}</React.Fragment>;
  }
}

function WdupShell() {
  const { user, activeTab, publicStoreUsername, cookieBlockedInIframe, enablePersistentCookieSession } = useAuth();

  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();
    };
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', onUnhandledRejection);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#FCF5F1] text-[#3D2C24]">
      <Navbar />
      {user && cookieBlockedInIframe && (
        <div className="bg-[#FDF4DE] border-b border-[#F3C669]/70 px-4 md:px-8 py-2">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#3D2C24]">
            <span>
              Browser Anda memblokir cookie otomatis di mode preview, sehingga akun akan keluar saat aplikasi diperbarui.
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void enablePersistentCookieSession()}
                className="px-3 py-1 rounded-lg bg-[#6B8E7B] hover:bg-[#527362] text-white text-[11px] font-semibold cursor-pointer"
              >
                Izinkan Simpan Login
              </button>
              <a
                href={typeof window !== 'undefined' ? window.location.href : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 rounded-lg bg-[#3D2C24] text-[#FAF6F0] text-[11px] font-semibold"
              >
                Buka di Tab Baru
              </a>
            </div>
          </div>
        </div>
      )}
      <main className="flex-1">
        {publicStoreUsername ? (
          <StorefrontView />
        ) : activeTab === 'home' ? (
          <HomeView />
        ) : activeTab === 'academy' ? (
          <AcademyView />
        ) : activeTab === 'market' ? (
          <MarketView />
        ) : (
          <AccountView />
        )}
      </main>
      <AuthModal />
      <CartCheckoutDrawer />
      <WdupAiDrawer />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppErrorBoundary>
        <WdupShell />
      </AppErrorBoundary>
    </AuthProvider>
  );
}
