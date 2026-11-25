import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Award,
  Bell,
  BookOpen,
  CheckCircle2,
  Crown,
  ExternalLink,
  Eye,
  EyeOff,
  GraduationCap,
  Lock,
  LogOut,
  Shield,
  Store as StoreIcon,
  Upload,
  User as UserIcon,
  Wallet,
} from 'lucide-react';
import { apiFetch, formatDateTimeId, formatRupiah } from '../lib/api';
import { compressImageFile } from '../lib/imageUtils';
import { useAuth } from '../context/AuthContext';
import type { AcademyClass, Enrollment, NotificationItem, Order, ProBenefit, ProPlan } from '../types/wdup';
import { StoreBuilderView } from './StoreBuilderView';
import { AdminDashboardView } from './AdminDashboardView';
import { MentorAcademyView } from './MentorAcademyView';
import { ProductAccessViewer } from './ProductAccessViewer';

interface AccountSummaryResponse {
  store: { id: string; name: string; username: string; visitors_count: number } | null;
  stats: {
    ownProductsCount: number;
    affiliateProductsCount: number;
    enrollmentsCount: number;
    avgProgress: number;
    studioEntriesCount: number;
    ordersCount: number;
    unreadNotifications: number;
    commissionsTotal: number;
  };
}

export function AccountView() {
  const {
    user,
    loadingAuth,
    cookieBlockedInIframe,
    adminClaimed,
    accountSubView,
    setAccountSubView,
    setAuthModalOpen,
    setActiveTab,
    setSelectedClassId,
    addToCart,
    refreshAuth,
    notifyNotificationsUpdated,
    logout,
    toast,
  } = useAuth();

  const [summary, setSummary] = useState<AccountSummaryResponse | null>(null);
  const [proPlans, setProPlans] = useState<ProPlan[]>([]);
  const [proBenefits, setProBenefits] = useState<ProBenefit[]>([]);
  const [showProDrawer, setShowProDrawer] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);

  const displayMoney = (amount: number) => (hideBalance ? 'Rp ••••••' : formatRupiah(amount));

  // Profile state
  const [profileForm, setProfileForm] = useState({
    name: '',
    whatsapp: '',
    bio: '',
    notify_email: true,
    notify_whatsapp: true,
  });

  // Learning state
  const [learningData, setLearningData] = useState<{
    classes: AcademyClass[];
    enrollments: Enrollment[];
  }>({ classes: [], enrollments: [] });

  // Activity state
  const [activityData, setActivityData] = useState<{
    orders: Order[];
    commissions: Array<{ id: string; order_code: string; amount: number; status: string; created_at: string }>;
    engagements: Array<{ id: string; title: string; subtitle: string; section_type: string; created_at: string }>;
    notifications: NotificationItem[];
  }>({ orders: [], commissions: [], engagements: [], notifications: [] });

  // Payment proof upload inline inside My Activity
  const [uploadOrderId, setUploadOrderId] = useState<string | null>(null);
  const [proofForm, setProofForm] = useState({ sender_name: '', transfer_reference: '', proof_note: '', proof_image_data: '' });

  // Wallet state
  const [walletData, setWalletData] = useState<{
    wallet_available: number;
    wallet_pending: number;
    totalIncome: number;
    totalCommissions: number;
    transactions: Array<{ id: string; type: string; amount: number; description: string; created_at: string }>;
    withdrawals: Array<{
      id: string;
      amount: number;
      transfer_fee?: number;
      net_amount?: number;
      bank_or_ewallet: string;
      account_number: string;
      status: string;
      created_at: string;
    }>;
  } | null>(null);
  const [wdForm, setWdForm] = useState({ amount: 50000, bank_or_ewallet: 'Bank BCA', account_number: '', account_holder: '' });

  const loadSummary = async () => {
    if (!user) return;
    try {
      const res = await apiFetch<AccountSummaryResponse>('/api/account/summary');
      setSummary(res);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    apiFetch<{ plans: ProPlan[]; benefits: ProBenefit[] }>('/api/pro/plans')
      .then((res) => {
        setProPlans(res.plans || []);
        setProBenefits(res.benefits || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      setProfileForm({
        name: user.name,
        whatsapp: user.whatsapp || '',
        bio: user.bio || '',
        notify_email: user.notify_email === 1,
        notify_whatsapp: user.notify_whatsapp === 1,
      });
      loadSummary();
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (accountSubView === 'learning') {
      apiFetch<{ classes: AcademyClass[]; enrollments: Enrollment[] }>('/api/academy')
        .then(setLearningData)
        .catch(() => {});
    } else if (accountSubView === 'activity') {
      apiFetch<typeof activityData>('/api/account/activity')
        .then((res) => {
          setActivityData(res);
          apiFetch('/api/account/notifications/read', { method: 'POST' })
            .then(() => notifyNotificationsUpdated())
            .catch(() => {});
        })
        .catch(() => {});
    } else if (accountSubView === 'wallet') {
      apiFetch<typeof walletData>('/api/wallet')
        .then(setWalletData)
        .catch(() => {});
    }
  }, [accountSubView, user]);

  useEffect(() => {
    if (user) {
      refreshAuth();
    }
  }, [user?.id]);

  if (loadingAuth && !user) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-10 space-y-4">
        <div className="h-28 rounded-2xl bg-[#F2EAE0] animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-28 rounded-2xl bg-[#F2EAE0] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Guest Screen (only shown if user has not logged in yet)
  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-16 pb-24">
        <div className="bg-white rounded-3xl border border-[#3D2C24]/10 p-8 sm:p-10 text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-[#6B8E7B]/15 text-[#527362] flex items-center justify-center mx-auto">
            <UserIcon className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#3D2C24]">
              Satu Akun Terintegrasi WD.UP
            </h1>
            <p className="text-sm text-[#6E5A50] max-w-md mx-auto leading-relaxed">
              Masuk satu kali di awal untuk langsung mengakses seluruh fitur: My Profile, My Store, My Learning, My Activity, dan My Wallet tanpa verifikasi ulang.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              onClick={() => setAuthModalOpen(true)}
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] text-sm font-semibold cursor-pointer"
            >
              Masuk / Daftar Akun WD.UP
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // SUB-VIEW HEADER WRAPPER
  // ==========================================
  if (accountSubView !== 'overview') {
    const titles: Record<string, string> = {
      profile: 'My Profile',
      store: 'My Store & Affiliate',
      learning: 'My Learning',
      activity: 'My Activity & Orders',
      wallet: 'My Wallet',
      mentor: 'Panel Mentor Academy',
      admin: user.role === 'admin' ? 'Admin Dashboard' : 'Editor Dashboard',
    };

    const isApprovedMentor =
      user.role === 'admin' ||
      user.role === 'editor' ||
      (user.role === 'mentor' && user.mentor_status === 'approved');

    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4 space-y-4 pb-24 md:pb-10">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => {
              setAccountSubView('overview');
              loadSummary();
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#527362] hover:text-[#3D2C24] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke My Account</span>
          </button>
          <span className="text-[11px] font-medium text-[#6E5A50] truncate">{user.email}</span>
        </div>

        <h1 className="font-display text-xl sm:text-2xl font-semibold text-[#3D2C24]">
          {titles[accountSubView] || 'My Account'}
        </h1>

        {accountSubView === 'store' && <StoreBuilderView />}
        {accountSubView === 'mentor' && isApprovedMentor && <MentorAcademyView />}
        {accountSubView === 'admin' && (user.role === 'admin' || user.role === 'editor') && <AdminDashboardView />}

        {/* A. MY PROFILE */}
        {accountSubView === 'profile' && (
          <div className="grid lg:grid-cols-12 gap-6 items-start">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await apiFetch('/api/account/profile', {
                    method: 'PUT',
                    body: JSON.stringify(profileForm),
                  });
                  await refreshAuth();
                  toast('Profil dan preferensi notifikasi disimpan.', 'sage');
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'Gagal memperbarui profil.', 'coral');
                }
              }}
              className="lg:col-span-7 bg-white rounded-3xl border border-[#3D2C24]/10 p-6 space-y-4"
            >
              <h2 className="text-base font-semibold text-[#3D2C24]">Informasi Akun & Kontak</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#3D2C24] mb-1">Nama Lengkap</label>
                  <input
                    type="text"
                    required
                    value={profileForm.name}
                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#3D2C24] mb-1">Nomor WhatsApp</label>
                  <input
                    type="text"
                    value={profileForm.whatsapp}
                    onChange={(e) => setProfileForm({ ...profileForm, whatsapp: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#3D2C24] mb-1">Bio Singkat</label>
                <textarea
                  rows={3}
                  value={profileForm.bio}
                  onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                  className="w-full p-3 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-sm"
                />
              </div>
              <div className="space-y-2 pt-2 border-t border-[#3D2C24]/10 text-xs">
                <p className="font-semibold text-[#3D2C24]">Pengaturan Notifikasi (Pengirim: notif@wdup.com)</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profileForm.notify_email}
                    onChange={(e) => setProfileForm({ ...profileForm, notify_email: e.target.checked })}
                  />
                  <span>Terima notifikasi email ({user.email})</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profileForm.notify_whatsapp}
                    onChange={(e) => setProfileForm({ ...profileForm, notify_whatsapp: e.target.checked })}
                  />
                  <span>Terima notifikasi WhatsApp</span>
                </label>
              </div>
              <button
                type="submit"
                className="min-h-[42px] px-5 py-2 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold cursor-pointer"
              >
                Simpan Profil
              </button>
            </form>

            <div className="lg:col-span-5 bg-white rounded-3xl border border-[#3D2C24]/10 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#527362]" />
                <h2 className="text-base font-semibold text-[#3D2C24]">Keamanan Akun</h2>
              </div>
              <p className="text-xs text-[#6E5A50]">
                User ID Terintegrasi: <span className="font-mono font-semibold text-[#3D2C24]">{user.id}</span> · Role:{' '}
                <span className="font-semibold uppercase">{user.role}</span>
              </p>
              <div className="p-4 rounded-2xl bg-[#EFF5F1] border border-[#6B8E7B]/30 text-xs text-[#3D2C24] space-y-1.5 leading-relaxed">
                <p className="font-semibold text-[#527362]">Autentikasi Akun Google Aktif</p>
                <p className="text-[#6E5A50]">
                  Autentikasi dikelola aman melalui Akun Google (Firebase Auth) untuk email{' '}
                  <span className="font-semibold text-[#3D2C24]">{user.email}</span>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* C. MY LEARNING */}
        {accountSubView === 'learning' && (
          <div className="space-y-4">
            {learningData.enrollments.length === 0 ? (
              <div className="bg-white rounded-3xl border border-[#3D2C24]/10 p-8 text-center space-y-3">
                <BookOpen className="w-10 h-10 text-[#6E5A50]/50 mx-auto" />
                <p className="text-sm font-semibold text-[#3D2C24]">Belum ada kelas yang aktif</p>
                <p className="text-xs text-[#6E5A50]">
                  Kelas yang sudah Anda beli dan terverifikasi Paid otomatis muncul di sini.
                </p>
                <button
                  onClick={() => setActiveTab('academy')}
                  className="px-5 py-2.5 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold cursor-pointer"
                >
                  Jelajahi WD.UP Academy
                </button>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {learningData.enrollments.map((enr) => {
                  const cls = learningData.classes.find((c) => c.id === enr.class_id);
                  if (!cls) return null;
                  return (
                    <div key={enr.id} className="bg-white rounded-2xl border border-[#3D2C24]/10 p-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[11px] text-[#527362] font-medium">{cls.category_name}</p>
                          <h3 className="text-base font-semibold text-[#3D2C24]">{cls.title}</h3>
                          <p className="text-xs text-[#6E5A50]">Mentor: {cls.mentor_name}</p>
                        </div>
                        {enr.certificate_code && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#527362]">
                            <Award className="w-4 h-4" />
                            <span>Sertifikat</span>
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span>Progress</span>
                          <span className="font-mono font-semibold">{enr.progress_pct}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-[#F2EAE0] overflow-hidden">
                          <div className="h-full bg-[#6B8E7B]" style={{ width: `${enr.progress_pct}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="font-mono text-[11px] text-[#6E5A50]">
                          {enr.certificate_code ? `Kode: ${enr.certificate_code}` : 'Worksheet & Tugas Tersedia'}
                        </span>
                        <button
                          onClick={() => {
                            setSelectedClassId(cls.id);
                            setActiveTab('academy');
                          }}
                          className="px-4 py-2 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold cursor-pointer"
                        >
                          Buka Ruang Belajar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* E. MY ACTIVITY */}
        {accountSubView === 'activity' && (
          <div className="space-y-4">
            {/* Orders & Payment Proof + Unlocked Digital Access */}
            <div className="bg-white rounded-2xl border border-[#3D2C24]/10 p-4 space-y-3">
              <h2 className="text-sm font-semibold text-[#3D2C24]">Riwayat Pembelian & Akses Produk</h2>
              {activityData.orders.length === 0 ? (
                <p className="text-xs text-[#6E5A50]">Belum ada pesanan.</p>
              ) : (
                <div className="space-y-3">
                  {activityData.orders.map((ord) => (
                    <div key={ord.id} className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/10 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-mono text-xs font-bold text-[#3D2C24]">
                            {ord.order_code} · <span className="text-[#527362]">{ord.status}</span>
                          </p>
                          <p className="text-[11px] text-[#6E5A50]">
                            {ord.provider_name || 'Transfer Manual'}
                            {ord.account_number ? ` (${ord.account_number})` : ''} · {formatDateTimeId(ord.created_at)}
                            {ord.buyer_email ? ` · ${ord.buyer_email}` : ''}
                            {ord.voucher_code ? ` · Voucher ${ord.voucher_code}` : ''}
                          </p>
                        </div>
                        <span className="font-mono tabular-nums text-sm font-bold text-[#3D2C24]">
                          {formatRupiah(ord.total_amount)}
                        </span>
                      </div>

                      <div className="space-y-2 text-xs">
                        {(ord.items || []).map((it) => (
                          <div key={it.id} className="p-2.5 rounded-lg bg-white border border-[#3D2C24]/10 space-y-2">
                            <div className="flex justify-between font-medium gap-2">
                              <span>
                                {it.title} x{it.quantity}
                              </span>
                              <span className="font-mono shrink-0">{formatRupiah(it.subtotal)}</span>
                            </div>
                            {it.selected_addons && it.selected_addons.length > 0 && ord.status !== 'Paid' && (
                              <div className="space-y-0.5 text-[11px] text-[#527362]">
                                {it.selected_addons.map((addon) => (
                                  <p key={addon.id}>
                                    + Add-On: {addon.title} ({formatRupiah(addon.price)})
                                  </p>
                                ))}
                              </div>
                            )}
                            {ord.status === 'Paid' &&
                              (it.delivery_content ||
                                it.access_url ||
                                it.has_access_file ||
                                (it.selected_addons && it.selected_addons.length > 0)) && (
                                <ProductAccessViewer
                                  productId={it.item_id}
                                  accessType={it.access_type}
                                  accessUrl={it.access_url}
                                  accessFileName={it.access_file_name}
                                  hasAccessFile={it.has_access_file}
                                  deliveryContent={it.delivery_content}
                                  selectedAddons={it.selected_addons}
                                />
                              )}
                            {ord.status === 'Paid' && (it.item_type === 'class' || it.item_type === 'program') && (
                              <button
                                onClick={() => setAccountSubView('learning')}
                                className="text-xs font-semibold text-[#527362] underline cursor-pointer inline-flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Buka Kelas di My Learning</span>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {(ord.status === 'Pending Payment' || ord.status === 'Rejected') && (
                        <div>
                          {uploadOrderId === ord.id ? (
                            <form
                              onSubmit={async (e) => {
                                e.preventDefault();
                                try {
                                  await apiFetch(`/api/orders/${ord.id}/payment-proof`, {
                                    method: 'POST',
                                    body: JSON.stringify({
                                      ...proofForm,
                                      sender_name: proofForm.sender_name.trim() || user.name || 'Pembeli',
                                    }),
                                  });
                                  setUploadOrderId(null);
                                  setProofForm({ sender_name: '', transfer_reference: '', proof_note: '', proof_image_data: '' });
                                  notifyNotificationsUpdated();
                                  toast('Bukti pembayaran terkirim! Notifikasi dikirim ke Email/WA & Admin.', 'sage');
                                  const res = await apiFetch<typeof activityData>('/api/account/activity');
                                  setActivityData(res);
                                } catch (err) {
                                  toast(err instanceof Error ? err.message : 'Gagal mengirim bukti.', 'coral');
                                }
                              }}
                              className="p-3 rounded-xl bg-white border border-[#3D2C24]/15 space-y-2"
                            >
                              <input
                                type="text"
                                placeholder={`Nama pengirim transfer (mis. ${user.name})`}
                                value={proofForm.sender_name}
                                onChange={(e) => setProofForm({ ...proofForm, sender_name: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
                              />
                              <input
                                type="text"
                                placeholder="Referensi transfer"
                                value={proofForm.transfer_reference}
                                onChange={(e) => setProofForm({ ...proofForm, transfer_reference: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
                              />
                              <label className="flex items-center gap-2 text-xs cursor-pointer text-[#527362] font-semibold">
                                <Upload className="w-3.5 h-3.5" />
                                <span>{proofForm.proof_image_data ? 'Ganti Gambar Bukti Bayar' : 'Pilih Gambar Bukti Bayar'}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={async (e) => {
                                    const f = e.target.files?.[0];
                                    if (!f) return;
                                    try {
                                      const compressed = await compressImageFile(f, {
                                        maxWidth: 1400,
                                        maxHeight: 1400,
                                        quality: 0.85,
                                        maxDataUrlLength: 1_500_000,
                                      });
                                      setProofForm((prev) => ({ ...prev, proof_image_data: compressed }));
                                      toast('Gambar bukti bayar siap dikirim.', 'sage');
                                    } catch (err) {
                                      toast(
                                        err instanceof Error ? err.message : 'Gagal memproses gambar bukti bayar.',
                                        'coral'
                                      );
                                    }
                                  }}
                                />
                              </label>
                              {proofForm.proof_image_data && (
                                <div className="flex items-center gap-2">
                                  <img
                                    src={proofForm.proof_image_data}
                                    alt="Preview bukti"
                                    className="h-12 w-16 rounded-lg object-cover border border-[#3D2C24]/15"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setProofForm({ ...proofForm, proof_image_data: '' })}
                                    className="text-[11px] font-semibold text-[#E07A5F] cursor-pointer"
                                  >
                                    Hapus Gambar
                                  </button>
                                </div>
                              )}
                              <div className="flex gap-2">
                                <button
                                  type="submit"
                                  className="px-3 py-1.5 rounded-lg bg-[#6B8E7B] text-white text-xs font-semibold cursor-pointer"
                                >
                                  Kirim Bukti
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setUploadOrderId(null)}
                                  className="px-3 py-1.5 rounded-lg bg-[#F2EAE0] text-xs cursor-pointer"
                                >
                                  Batal
                                </button>
                              </div>
                            </form>
                          ) : (
                            <button
                              onClick={() => setUploadOrderId(ord.id)}
                              className="px-4 py-2 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold cursor-pointer"
                            >
                              Unggah Bukti Pembayaran
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Community, Opportunity & Notifications */}
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-3">
                <h2 className="text-base font-semibold text-[#3D2C24]">Community & Opportunity Diikuti</h2>
                {activityData.engagements.length === 0 ? (
                  <p className="text-xs text-[#6E5A50]">Anda belum bergabung ke Community atau Opportunity.</p>
                ) : (
                  <div className="space-y-2">
                    {activityData.engagements.map((eng) => (
                      <div key={eng.id} className="p-3 rounded-xl bg-[#FAF6F0] text-xs">
                        <p className="font-semibold text-[#527362] uppercase text-[10px]">{eng.section_type}</p>
                        <p className="font-semibold text-[#3D2C24]">{eng.title}</p>
                        <p className="text-[#6E5A50]">{eng.subtitle}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-[#527362]" />
                  <h2 className="text-base font-semibold text-[#3D2C24]">Kotak Notifikasi</h2>
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {activityData.notifications.map((n) => (
                    <div key={n.id} className="p-3 rounded-xl bg-[#FAF6F0] text-xs space-y-1">
                      <div className="flex justify-between gap-2">
                        <p className="font-semibold text-[#3D2C24]">{n.title}</p>
                        <span className="text-[10px] text-[#6E5A50] shrink-0">{formatDateTimeId(n.created_at)}</span>
                      </div>
                      <p className="text-[#3D2C24]/85">{n.message}</p>
                      <p className="text-[10px] font-mono text-[#6E5A50]">
                        {n.sender_email} · Email: {n.email_status} · WA: {n.whatsapp_status}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* F. MY WALLET */}
        {accountSubView === 'wallet' && walletData && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#6E5A50]">Ringkasan Saldo & Pendapatan</p>
              <button
                type="button"
                onClick={() => setHideBalance((v) => !v)}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-[#3D2C24]/15 text-[11px] font-semibold text-[#3D2C24] inline-flex items-center gap-1.5 cursor-pointer hover:bg-[#FAF6F0]"
              >
                {hideBalance ? <Eye className="w-3.5 h-3.5 text-[#527362]" /> : <EyeOff className="w-3.5 h-3.5 text-[#6E5A50]" />}
                <span>{hideBalance ? 'Tampilkan Saldo' : 'Sembunyikan Saldo'}</span>
              </button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {[
                { label: 'Saldo Tersedia', val: displayMoney(walletData.wallet_available), sub: 'Siap dicairkan' },
                { label: 'Saldo Tertahan', val: displayMoney(walletData.wallet_pending), sub: 'Dalam proses' },
                { label: 'Pendapatan Penjualan', val: displayMoney(walletData.totalIncome), sub: 'Total penjualan' },
                { label: 'Komisi Affiliate', val: displayMoney(walletData.totalCommissions), sub: 'Status Paid' },
              ].map((k) => (
                <div key={k.label} className="p-3 rounded-xl bg-white border border-[#3D2C24]/10 space-y-0.5">
                  <p className="text-[10px] text-[#6E5A50]">{k.label}</p>
                  <p className="font-mono tabular-nums text-sm sm:text-base font-bold text-[#3D2C24]">{k.val}</p>
                  <p className="text-[10px] text-[#6E5A50]">{k.sub}</p>
                </div>
              ))}
            </div>

            <div className="grid lg:grid-cols-12 gap-6 items-start">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (wdForm.amount < 50000) {
                    toast('Minimal penarikan saldo adalah Rp 50.000.', 'coral');
                    return;
                  }
                  try {
                    await apiFetch('/api/wallet/withdraw', {
                      method: 'POST',
                      body: JSON.stringify(wdForm),
                    });
                    toast('Permintaan pencairan dana berhasil diajukan (biaya transfer Rp 3.000)!', 'sage');
                    const res = await apiFetch<typeof walletData>('/api/wallet');
                    setWalletData(res);
                    await refreshAuth();
                  } catch (err) {
                    toast(err instanceof Error ? err.message : 'Gagal mengajukan pencairan.', 'coral');
                  }
                }}
                className="lg:col-span-5 bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-3"
              >
                <h3 className="text-sm font-semibold text-[#3D2C24]">Ajukan Pencairan Dana</h3>
                <div>
                  <label className="block text-xs text-[#6E5A50] mb-1">
                    Jumlah Pencairan (Minimal Rp 50.000)
                  </label>
                  <input
                    type="number"
                    min={50000}
                    required
                    value={wdForm.amount}
                    onChange={(e) => setWdForm({ ...wdForm, amount: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-sm font-mono"
                  />
                </div>
                <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/10 space-y-1 text-xs">
                  <div className="flex justify-between text-[#6E5A50]">
                    <span>Nominal Pengajuan</span>
                    <span className="font-mono tabular-nums">{formatRupiah(wdForm.amount || 0)}</span>
                  </div>
                  <div className="flex justify-between text-[#E07A5F]">
                    <span>Biaya Transfer Bank/E-Wallet</span>
                    <span className="font-mono tabular-nums">-Rp 3.000</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-[#3D2C24]/10 font-bold text-[#527362]">
                    <span>Dana Diterima Bersih</span>
                    <span className="font-mono tabular-nums">
                      {formatRupiah(Math.max(0, (wdForm.amount || 0) - 3000))}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#6E5A50] mb-1">Bank / E-Wallet Tujuan</label>
                  <input
                    type="text"
                    required
                    value={wdForm.bank_or_ewallet}
                    onChange={(e) => setWdForm({ ...wdForm, bank_or_ewallet: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#6E5A50] mb-1">Nomor Rekening / E-Wallet</label>
                  <input
                    type="text"
                    required
                    value={wdForm.account_number}
                    onChange={(e) => setWdForm({ ...wdForm, account_number: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#6E5A50] mb-1">Nama Pemilik Rekening</label>
                  <input
                    type="text"
                    required
                    value={wdForm.account_holder}
                    onChange={(e) => setWdForm({ ...wdForm, account_holder: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold cursor-pointer"
                >
                  Ajukan Pencairan (Min. Rp 50.000)
                </button>
              </form>

              <div className="lg:col-span-7 bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-4">
                <h3 className="text-sm font-semibold text-[#3D2C24]">Riwayat Mutasi Saldo & Pencairan</h3>
                {walletData.withdrawals.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-[#6E5A50]">Pencairan</p>
                    {walletData.withdrawals.map((w) => {
                      const fee = w.transfer_fee ?? 3000;
                      const net = w.net_amount ?? Math.max(0, w.amount - fee);
                      return (
                        <div key={w.id} className="p-3 rounded-xl bg-[#FAF6F0] flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div>
                            <p className="font-medium text-[#3D2C24]">
                              {w.bank_or_ewallet} ({w.account_number}) · <strong>{w.status}</strong>
                            </p>
                            <p className="text-[10px] text-[#6E5A50] font-mono">
                              Pengajuan {formatRupiah(w.amount)} · Biaya Rp {fee.toLocaleString('id-ID')}
                            </p>
                          </div>
                          <span className="font-mono font-bold text-[#527362]">Bersih {formatRupiah(net)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[#6E5A50]">Mutasi Wallet</p>
                  {walletData.transactions.length === 0 ? (
                    <p className="text-xs text-[#6E5A50]">Belum ada mutasi saldo.</p>
                  ) : (
                    walletData.transactions.map((wt) => (
                      <div key={wt.id} className="p-3 rounded-xl bg-[#FAF6F0] flex justify-between gap-2 text-xs">
                        <div>
                          <p className="font-medium text-[#3D2C24]">{wt.description}</p>
                          <p className="text-[10px] text-[#6E5A50]">{formatDateTimeId(wt.created_at)}</p>
                        </div>
                        <span
                          className={`font-mono font-bold shrink-0 ${
                            wt.amount >= 0 ? 'text-[#527362]' : 'text-[#E07A5F]'
                          }`}
                        >
                          {wt.amount >= 0 ? `+${formatRupiah(wt.amount)}` : formatRupiah(wt.amount)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // MY ACCOUNT — CLEAN 5-CARD SIMPLE DASHBOARD
  // ==========================================
  const cards = [
    {
      id: 'profile',
      title: 'MY PROFILE',
      summary: `${user.name} · Pengaturan akun, kontak & keamanan`,
      icon: UserIcon,
      tint: 'bg-[#FAF6F0]',
    },
    {
      id: 'store',
      title: 'MY STORE',
      summary: summary?.store
        ? `${summary.store.name} · ${summary.stats.ownProductsCount} produk · ${summary.stats.affiliateProductsCount} affiliate`
        : 'Buat toko produk sendiri atau toko affiliate',
      icon: StoreIcon,
      tint: 'bg-[#6B8E7B]/12',
    },
    {
      id: 'learning',
      title: 'MY LEARNING',
      summary: `${summary?.stats.enrollmentsCount || 0} kelas aktif · Rata-rata progress ${
        summary?.stats.avgProgress || 0
      }%`,
      icon: BookOpen,
      tint: 'bg-[#F3C669]/20',
    },
    {
      id: 'activity',
      title: 'MY ACTIVITY',
      summary: `${summary?.stats.ordersCount || 0} pesanan · ${summary?.stats.unreadNotifications || 0} notifikasi baru`,
      icon: Activity,
      tint: 'bg-[#E07A5F]/12',
    },
    {
      id: 'wallet',
      title: 'MY WALLET',
      summary: `Saldo tersedia ${displayMoney(user.wallet_available)} · Pencairan dana`,
      icon: Wallet,
      tint: 'bg-[#6B8E7B]/15',
    },
  ] as const;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 py-4 space-y-4 pb-24 md:pb-10">
      <div className="bg-white rounded-2xl border border-[#3D2C24]/10 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-medium text-[#527362]">Akun Terintegrasi · {user.role.toUpperCase()}</p>
            {user.is_pro && (
              <span className="px-2 py-0.5 rounded-md bg-[#3D2C24] text-[#F3C669] text-[10px] font-bold inline-flex items-center gap-1">
                <Crown className="w-3 h-3" />
                <span>PRO · 0% FEE</span>
              </span>
            )}
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold text-[#3D2C24] mt-0.5">
            Halo, {user.name}
          </h1>
          <p className="text-xs text-[#6E5A50] mt-0.5">{user.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {user.role === 'mentor' && user.mentor_status === 'pending' && (
            <span className="px-3 py-1.5 rounded-xl bg-[#FDF8EC] border border-[#F3C669] text-[11px] font-semibold text-[#8A6112]">
              Pengajuan Mentor: Menunggu ACC Admin
            </span>
          )}
          {(user.role === 'admin' ||
            user.role === 'editor' ||
            (user.role === 'mentor' && user.mentor_status === 'approved')) && (
            <button
              onClick={() => setAccountSubView('mentor')}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#6B8E7B] hover:bg-[#527362] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Panel Mentor Academy</span>
            </button>
          )}
          {(user.role === 'admin' || user.role === 'editor') && (
            <button
              onClick={() => setAccountSubView('admin')}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5 text-[#F3C669]" />
              <span>{user.role === 'admin' ? 'Admin Dashboard' : 'Editor Dashboard'}</span>
            </button>
          )}
          {!adminClaimed && user.role !== 'admin' && (
            <button
              onClick={() => setAuthModalOpen(true)}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#F3C669] text-[#3D2C24] text-xs font-semibold cursor-pointer"
            >
              Setup Admin Pertama
            </button>
          )}
          <button
            onClick={logout}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#F2EAE0] hover:bg-[#E7DDD0] text-xs font-semibold text-[#3D2C24] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </div>

      {/* WD.UP PRO MEMBERSHIP BANNER & PLANS */}
      <section className="rounded-2xl bg-gradient-to-br from-[#3D2C24] to-[#2B1F19] text-[#FAF6F0] p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#F3C669]">
              <Crown className="w-4 h-4" />
              <span>{user.is_pro ? 'Keanggotaan WD.UP Pro Aktif' : 'Upgrade ke WD.UP Pro'}</span>
            </div>
            <h2 className="font-display text-base sm:text-lg font-semibold">
              {user.is_pro
                ? `Seluruh Fitur Eksklusif WD.UP Pro Aktif hingga ${formatDateTimeId(user.pro_expires_at || '')}`
                : 'Upgrade WD.UP Pro — 0% Biaya Transaksi & Fitur Unggulan Seller'}
            </h2>
            <p className="text-[11px] text-[#FAF6F0]/80">
              {user.is_pro
                ? 'Nikmati 0% biaya transaksi, AI Creator Produk, Bayar Suka-Suka Minimal Harga, tombol beli kustom, bentuk cover eksklusif, Voucher Toko, dan Editor Coding Landing Page.'
                : 'Buka 0% biaya transaksi, AI Creator Produk, Bayar Suka-Suka dengan Minimal Harga, tombol beli edit sendiri, bentuk cover eksklusif, Voucher Toko, dan Editor Coding HTML/CSS.'}
            </p>
          </div>
          <button
            onClick={() => setShowProDrawer((v) => !v)}
            className="px-4 py-2 rounded-xl bg-[#F3C669] hover:bg-[#eab853] text-[#3D2C24] text-xs font-bold shrink-0 cursor-pointer self-start sm:self-auto"
          >
            {showProDrawer ? 'Tutup Paket Pro' : user.is_pro ? 'Perpanjang / Lihat Manfaat' : 'Pilih Paket Pro'}
          </button>
        </div>

        {showProDrawer && (
          <div className="pt-3 border-t border-white/15 space-y-3">
            {proBenefits.length > 0 && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {proBenefits.map((b) => (
                  <div key={b.title} className="p-2.5 rounded-xl bg-white/8 border border-white/10 space-y-0.5">
                    <p className="text-[11px] font-semibold text-[#F3C669]">{b.title}</p>
                    <p className="text-[10px] text-[#FAF6F0]/80 leading-snug">{b.desc}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="grid sm:grid-cols-3 gap-2.5">
              {proPlans.map((plan) => (
                <div
                  key={plan.id}
                  className="p-3.5 rounded-xl bg-[#FAF6F0] text-[#3D2C24] flex flex-col justify-between gap-2.5"
                >
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-[#527362]">{plan.badge}</p>
                    <h3 className="text-xs sm:text-sm font-bold">{plan.name}</h3>
                    <p className="font-mono tabular-nums text-base sm:text-lg font-bold text-[#3D2C24]">
                      {formatRupiah(plan.price)}
                    </p>
                    <p className="text-[11px] text-[#6E5A50] leading-snug">{plan.highlight}</p>
                  </div>
                  <button
                    onClick={() =>
                      addToCart(
                        {
                          item_type: 'pro_plan',
                          item_id: plan.id,
                          title: plan.name,
                          price: plan.price,
                          quantity: 1,
                          image_url: '',
                          meta: `Langganan ${plan.duration_days} hari · 0% biaya transaksi`,
                        },
                        true
                      )
                    }
                    className="w-full py-2 rounded-lg bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] text-xs font-semibold cursor-pointer"
                  >
                    Berlangganan & Bayar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {cookieBlockedInIframe && (
        <div className="p-3.5 rounded-2xl bg-[#F3C669]/25 border border-[#F3C669]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-[#3D2C24]">
          <span>
            Browser Anda sedang memblokir penyimpanan sesi di mode preview tersemat. Buka di tab baru agar akun tetap login otomatis saat halaman dimuat ulang.
          </span>
          <a
            href={typeof window !== 'undefined' ? window.location.href : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg bg-[#3D2C24] text-[#FAF6F0] text-[11px] font-semibold inline-flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
          >
            <span>Buka di Tab Baru</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* 5 Clean Main Dashboard Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              role="button"
              tabIndex={0}
              onClick={() => setAccountSubView(card.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setAccountSubView(card.id);
                }
              }}
              className="text-left p-3.5 sm:p-4 rounded-2xl bg-white border border-[#3D2C24]/10 hover:border-[#6B8E7B] transition-all flex flex-col justify-between gap-2.5 cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[#3D2C24] ${card.tint}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-1.5">
                  {card.id === 'wallet' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setHideBalance((v) => !v);
                      }}
                      className="p-1.5 rounded-lg bg-[#FAF6F0] hover:bg-[#F2EAE0] text-[#6E5A50] cursor-pointer"
                      aria-label={hideBalance ? 'Tampilkan saldo' : 'Sembunyikan saldo'}
                      title={hideBalance ? 'Tampilkan saldo' : 'Sembunyikan saldo'}
                    >
                      {hideBalance ? <Eye className="w-3.5 h-3.5 text-[#527362]" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  <ArrowRight className="w-4 h-4 text-[#6E5A50] group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
              <div>
                <h2 className="font-display text-sm sm:text-base font-semibold text-[#3D2C24]">{card.title}</h2>
                <p className="text-[11px] text-[#6E5A50] mt-0.5 leading-snug line-clamp-2">{card.summary}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
