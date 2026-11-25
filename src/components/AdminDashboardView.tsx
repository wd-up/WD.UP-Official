import React, { useEffect, useState } from 'react';
import {
  Bell,
  BookOpen,
  CheckCircle2,
  CreditCard,
  Crown,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Image as ImageIcon,
  KeyRound,
  LayoutTemplate,
  Link2,
  Plus,
  Shield,
  ShoppingBag,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  UserCheck,
  Users,
  Video,
  Wallet,
  X,
  XCircle,
  ZoomIn,
} from 'lucide-react';
import { apiFetch, formatDateTimeId, formatRupiah } from '../lib/api';
import { compressImageFile, isSaveableMediaOrEmpty } from '../lib/imageUtils';
import { getProductPriceSummary } from '../lib/productUtils';
import { useAuth } from '../context/AuthContext';
import {
  HOME_PILLARS,
  MARKET_CATEGORIES,
  PRODUCT_COVER_SHAPES,
  PRODUCT_CTA_PRESETS,
  type HomeCmsItem,
  type NotificationItem,
  type PaymentMethod,
  type Product,
  type ProductCoverShape,
  type SiteFooterInfo,
  type Store,
  type User,
  type VoucherItem,
} from '../types/wdup';
import { MentorAcademyView } from './MentorAcademyView';
import { SafeImage } from './SafeImage';

interface AdminOrder {
  id: string;
  order_code: string;
  buyer_name: string;
  buyer_email: string;
  buyer_whatsapp: string;
  voucher_code?: string;
  discount_amount?: number;
  provider_name: string;
  total_amount: number;
  status: string;
  sender_name: string;
  transfer_reference: string;
  proof_image_data: string;
  proof_note: string;
  submitted_at: string;
  created_at: string;
  items: Array<{ id: string; title: string; item_type: string; quantity: number; subtotal: number }>;
}

interface AdminWithdrawal {
  id: string;
  user_name: string;
  user_email: string;
  amount: number;
  transfer_fee?: number;
  net_amount?: number;
  bank_or_ewallet: string;
  account_number: string;
  account_holder: string;
  status: string;
  created_at: string;
}

interface KbEntry {
  id: string;
  topic: string;
  title: string;
  content: string;
  updated_at: string;
}

interface AccessCodeStatus {
  hasMentorCode: boolean;
  hasAdminCode: boolean;
  envMentorCodeActive: boolean;
  envAdminCodeActive: boolean;
}

type CmsMediaType = 'image' | 'video' | 'link';
type ProductAccessType = 'link' | 'pdf' | 'image' | 'video';

interface OfficialProductForm {
  title: string;
  category: string;
  home_pillar: string;
  base_price: number;
  has_promo: boolean;
  promo_price: number;
  quota_limit: string;
  cover_shape: ProductCoverShape;
  cta_label: string;
  image_url: string;
  description: string;
  landing_page_url: string;
  custom_landing_html: string;
  delivery_content: string;
  access_type: ProductAccessType;
  access_url: string;
  access_file_data: string;
  access_file_name: string;
  is_featured: boolean;
  is_recommended: boolean;
  affiliate_enabled: boolean;
  affiliate_commission_pct: number;
}

const emptyOfficialProductForm = (): OfficialProductForm => ({
  title: '',
  category: MARKET_CATEGORIES[1] as string,
  home_pillar: HOME_PILLARS[3] as string,
  base_price: 99000,
  has_promo: false,
  promo_price: 79000,
  quota_limit: '',
  cover_shape: 'landscape',
  cta_label: 'Beli Sekarang',
  image_url: '',
  description: '',
  landing_page_url: '',
  custom_landing_html: '',
  delivery_content: '',
  access_type: 'link',
  access_url: '',
  access_file_data: '',
  access_file_name: '',
  is_featured: true,
  is_recommended: true,
  affiliate_enabled: true,
  affiliate_commission_pct: 15,
});

const emptyVoucherForm = () => ({
  code: '',
  title: '',
  discount_type: 'fixed' as 'fixed' | 'percent',
  discount_value: 20000,
  min_purchase: 0,
  max_discount: '',
  quota_limit: '',
  expires_at: '',
});

const emptyNewCms = () => ({
  section_type: 'banner',
  title: '',
  subtitle: '',
  body: '',
  media_type: 'image' as CmsMediaType,
  image_url: '',
  media_url: '',
  link_url: '',
  cta_label: '',
  cta_target: 'market',
  accent_color: 'sage',
});

export function AdminDashboardView() {
  const { user, notifyCatalogUpdated, notifyNotificationsUpdated, toast } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState<string>(isAdmin ? 'payments' : 'cms');

  const [stats, setStats] = useState<Record<string, number>>({});
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawal[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [cmsItems, setCmsItems] = useState<HomeCmsItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [officialProducts, setOfficialProducts] = useState<Product[]>([]);
  const [notifSettings, setNotifSettings] = useState<Record<string, string>>({});
  const [notifLogs, setNotifLogs] = useState<NotificationItem[]>([]);
  const [kbEntries, setKbEntries] = useState<KbEntry[]>([]);
  const [vouchersList, setVouchersList] = useState<VoucherItem[]>([]);
  const [accessCodes, setAccessCodes] = useState<AccessCodeStatus>({
    hasMentorCode: false,
    hasAdminCode: false,
    envMentorCodeActive: false,
    envAdminCodeActive: false,
  });

  // Payment Proof Lightbox & Payment Method Edit/Delete State
  const [zoomProofUrl, setZoomProofUrl] = useState<string | null>(null);
  const [newPm, setNewPm] = useState({
    type: 'bank_transfer',
    provider_name: '',
    account_number: '',
    account_holder: '',
    instructions: '',
  });
  const [editingPmId, setEditingPmId] = useState<string | null>(null);
  const [editPmForm, setEditPmForm] = useState({
    type: 'bank_transfer',
    provider_name: '',
    account_number: '',
    account_holder: '',
    instructions: '',
    is_active: 1,
  });
  const [confirmDeletePmId, setConfirmDeletePmId] = useState<string | null>(null);

  // Vouchers State
  const [newPlatformVoucher, setNewPlatformVoucher] = useState(emptyVoucherForm);
  const [editingVoucherId, setEditingVoucherId] = useState<string | null>(null);
  const [savingVoucher, setSavingVoucher] = useState(false);

  // Home CMS Cover Media State
  const [newCms, setNewCms] = useState(emptyNewCms);
  const [savingNewCms, setSavingNewCms] = useState(false);
  const [editingCmsId, setEditingCmsId] = useState<string | null>(null);
  const [editCmsForm, setEditCmsForm] = useState({
    title: '',
    subtitle: '',
    body: '',
    media_type: 'image' as CmsMediaType,
    image_url: '',
    media_url: '',
    link_url: '',
    cta_label: '',
    cta_target: '',
    accent_color: 'sage',
    sort_order: 1,
  });
  const [savingEditCms, setSavingEditCms] = useState(false);

  // Official WD.UP Products State (B4)
  const [officialForm, setOfficialForm] = useState<OfficialProductForm>(emptyOfficialProductForm);
  const [editingOfficialId, setEditingOfficialId] = useState<string | null>(null);
  const [editingOfficialHasFile, setEditingOfficialHasFile] = useState(false);
  const [savingOfficial, setSavingOfficial] = useState(false);
  const [confirmDeleteOfficialId, setConfirmDeleteOfficialId] = useState<string | null>(null);

  // Access Code Form State (B1)
  const [mentorCodeInput, setMentorCodeInput] = useState('');
  const [adminCodeInput, setAdminCodeInput] = useState('');
  const [savingCodes, setSavingCodes] = useState(false);

  // Footer, Tools, KB, Announcement
  const [footerForm, setFooterForm] = useState<SiteFooterInfo>({
    license_title: '',
    license_number: '',
    copyright: '',
    email: '',
    whatsapp: '',
    address: '',
    instagram: '',
    tiktok: '',
    youtube: '',
    website: '',
  });
  const [newKb, setNewKb] = useState({ topic: '', title: '', content: '' });
  const [announcement, setAnnouncement] = useState({ title: '', message: '' });

  const loadAll = async () => {
    try {
      const ov = await apiFetch<{ stats: Record<string, number> }>('/api/admin/overview');
      setStats(ov.stats);

      const cmsRes = await apiFetch<{ items: HomeCmsItem[] }>('/api/admin/cms').catch(() => ({ items: [] }));
      setCmsItems(cmsRes.items);

      if (isAdmin) {
        const [
          ordRes,
          pmRes,
          wdRes,
          usrRes,
          mktRes,
          offRes,
          ntfRes,
          kbRes,
          ftRes,
          vchRes,
          codeRes,
        ] = await Promise.all([
          apiFetch<{ orders: AdminOrder[] }>('/api/admin/orders'),
          apiFetch<{ methods: PaymentMethod[] }>('/api/admin/payment-methods'),
          apiFetch<{ withdrawals: AdminWithdrawal[] }>('/api/admin/withdrawals'),
          apiFetch<{ users: User[] }>('/api/admin/users'),
          apiFetch<{ stores: Store[]; products: Product[] }>('/api/admin/market-stores'),
          apiFetch<{ products: Product[] }>('/api/admin/official-products').catch(() => ({ products: [] })),
          apiFetch<{ settings: Record<string, string>; logs: NotificationItem[] }>('/api/admin/notifications'),
          apiFetch<{ entries: KbEntry[] }>('/api/admin/knowledge-base'),
          apiFetch<{ siteFooter: SiteFooterInfo }>('/api/admin/site-footer'),
          apiFetch<{ vouchers: VoucherItem[] }>('/api/admin/vouchers').catch(() => ({ vouchers: [] })),
          apiFetch<AccessCodeStatus>('/api/admin/access-codes').catch(() => ({
            hasMentorCode: false,
            hasAdminCode: false,
            envMentorCodeActive: false,
            envAdminCodeActive: false,
          })),
        ]);
        setOrders(ordRes.orders);
        setMethods(pmRes.methods);
        setWithdrawals(wdRes.withdrawals);
        setUsersList(usrRes.users);
        setStores(mktRes.stores);
        setProducts(mktRes.products);
        setOfficialProducts(offRes.products || []);
        setNotifSettings(ntfRes.settings);
        setNotifLogs(ntfRes.logs);
        setKbEntries(kbRes.entries);
        setVouchersList(vchRes.vouchers || []);
        setAccessCodes(codeRes);
        if (ftRes.siteFooter) setFooterForm(ftRes.siteFooter);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadAll();
  }, [user?.role]);

  const handleVerifyOrder = async (orderId: string, status: 'Paid' | 'Rejected' | 'Cancelled' | 'Refunded') => {
    try {
      await apiFetch(`/api/admin/orders/${orderId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ status, verification_note: `Diverifikasi ${status} oleh ${user?.name}` }),
      });
      toast(`Status pesanan diperbarui menjadi ${status}. Notifikasi otomatis dikirim ke pembeli.`, 'sage');
      notifyNotificationsUpdated();
      await loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memverifikasi.', 'coral');
    }
  };

  const handleProcessWithdrawal = async (id: string, status: 'Approved' | 'Rejected') => {
    try {
      await apiFetch(`/api/admin/withdrawals/${id}/process`, {
        method: 'POST',
        body: JSON.stringify({ status, admin_note: status === 'Approved' ? 'Transfer selesai' : 'Data tidak valid' }),
      });
      toast(`Pencairan dana ${status}.`, 'sage');
      notifyNotificationsUpdated();
      await loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memproses pencairan.', 'coral');
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await apiFetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({
          role,
          mentor_status: role === 'mentor' ? 'approved' : 'none',
          editor_permissions: role === 'editor' ? ['home_cms', 'academy'] : [],
        }),
      });
      toast('Role pengguna diperbarui.', 'sage');
      await loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal mengubah role.', 'coral');
    }
  };

  const handleMentorStatusChange = async (userId: string, status: 'approved' | 'rejected' | 'pending') => {
    try {
      await apiFetch(`/api/admin/users/${userId}/mentor-status`, {
        method: 'PUT',
        body: JSON.stringify({ mentor_status: status }),
      });
      toast(
        status === 'approved'
          ? 'Akun Mentor berhasil di-ACC Admin!'
          : status === 'rejected'
          ? 'Pengajuan Mentor ditolak.'
          : 'Status Mentor diatur ke Menunggu ACC.',
        status === 'approved' ? 'sage' : 'brown'
      );
      notifyNotificationsUpdated();
      await loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memperbarui status Mentor.', 'coral');
    }
  };

  const handleSaveAccessCode = async (type: 'mentor' | 'admin', value: string) => {
    setSavingCodes(true);
    try {
      const payload = type === 'mentor' ? { mentor_code: value } : { admin_code: value };
      const res = await apiFetch<AccessCodeStatus & { ok: boolean }>('/api/admin/access-codes', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setAccessCodes(res);
      if (type === 'mentor') setMentorCodeInput('');
      if (type === 'admin') setAdminCodeInput('');
      toast(
        value === ''
          ? `Kode akses ${type === 'mentor' ? 'Mentor' : 'Admin'} dari panel dikosongkan.`
          : `Kode akses ${type === 'mentor' ? 'Mentor' : 'Admin'} berhasil diperbarui!`,
        'sage'
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menyimpan kode akses.', 'coral');
    } finally {
      setSavingCodes(false);
    }
  };

  const handleProChange = async (userId: string, planId: string) => {
    try {
      await apiFetch(`/api/admin/users/${userId}/pro`, {
        method: 'PUT',
        body: JSON.stringify({ plan_id: planId }),
      });
      toast(planId === 'none' ? 'Status WD.UP Pro dinonaktifkan.' : 'Langganan WD.UP Pro diaktifkan!', 'sage');
      await loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memperbarui status Pro.', 'coral');
    }
  };

  const handleUploadCoverImage = async (
    file: File,
    onDone: (dataUrl: string) => void
  ) => {
    try {
      const compressed = await compressImageFile(file, {
        maxWidth: 1400,
        maxHeight: 1400,
        quality: 0.85,
      });
      onDone(compressed);
      toast('Gambar cover berhasil diproses & siap diterbitkan.', 'sage');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memproses gambar.', 'coral');
    }
  };

  const handleUploadCmsVideo = (
    file: File,
    onDone: (dataUrl: string) => void
  ) => {
    if (!file.type.startsWith('video/')) {
      toast('Pilih file video MP4, WebM, atau OGG.', 'coral');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast('Ukuran file video maksimal 8 MB. Untuk video lebih besar, masukkan URL video.', 'coral');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onDone(reader.result);
        toast(`Video "${file.name}" siap diterbitkan.`, 'sage');
      }
    };
    reader.onerror = () => toast('Gagal membaca file video.', 'coral');
    reader.readAsDataURL(file);
  };

  const handleSaveOfficialProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!officialForm.title.trim()) {
      toast('Judul produk resmi wajib diisi.', 'coral');
      return;
    }
    if (officialForm.base_price < 1000) {
      toast('Harga produk minimal Rp 1.000.', 'coral');
      return;
    }
    if (officialForm.has_promo && (officialForm.promo_price <= 0 || officialForm.promo_price >= officialForm.base_price)) {
      toast('Harga promo harus lebih rendah dari harga awal.', 'coral');
      return;
    }
    if (!isSaveableMediaOrEmpty(officialForm.image_url)) {
      toast('Link gambar sampul harus berupa URL http:// atau https:// yang lengkap.', 'coral');
      return;
    }
    if (
      !officialForm.access_url.trim() &&
      !officialForm.access_file_data &&
      !officialForm.delivery_content.trim() &&
      !editingOfficialHasFile
    ) {
      toast('Isi minimal salah satu akses produk (Link URL, File, atau Pesan Akses) untuk pembeli.', 'coral');
      return;
    }

    setSavingOfficial(true);
    try {
      const effectivePrice = officialForm.has_promo ? officialForm.promo_price : officialForm.base_price;
      const originalPrice = officialForm.has_promo ? officialForm.base_price : null;
      const parsedQuota = officialForm.quota_limit.trim() === '' ? null : Number(officialForm.quota_limit.trim());

      const payload: Record<string, unknown> = {
        title: officialForm.title.trim(),
        category: officialForm.category,
        home_pillar: officialForm.home_pillar,
        price: effectivePrice,
        original_price: originalPrice,
        quota_limit: parsedQuota,
        cover_shape: officialForm.cover_shape,
        cta_label: officialForm.cta_label.trim() || 'Beli Sekarang',
        image_url: officialForm.image_url.trim(),
        description: officialForm.description.trim() || `Produk resmi WD.UP: ${officialForm.title.trim()}`,
        landing_page_url: officialForm.landing_page_url.trim(),
        custom_landing_html: officialForm.custom_landing_html,
        delivery_content: officialForm.delivery_content.trim(),
        access_type: officialForm.access_type,
        access_url: officialForm.access_url.trim(),
        is_featured: officialForm.is_featured,
        is_recommended: officialForm.is_recommended,
        affiliate_enabled: officialForm.affiliate_enabled,
        affiliate_commission_pct: officialForm.affiliate_commission_pct,
      };
      if (officialForm.access_file_data) {
        payload.access_file_data = officialForm.access_file_data;
        payload.access_file_name = officialForm.access_file_name;
      }

      if (editingOfficialId) {
        await apiFetch(`/api/admin/official-products/${editingOfficialId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast('Produk resmi WD.UP diperbarui & sinkron ke Market!', 'sage');
      } else {
        await apiFetch('/api/admin/official-products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast('Produk resmi WD.UP diterbitkan ke Market & WD.UP Official!', 'sage');
      }

      setEditingOfficialId(null);
      setEditingOfficialHasFile(false);
      setOfficialForm(emptyOfficialProductForm());
      notifyCatalogUpdated();
      await loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menyimpan produk resmi WD.UP.', 'coral');
    } finally {
      setSavingOfficial(false);
    }
  };

  const pendingMentors = usersList.filter((u) => u.role === 'mentor' && u.mentor_status === 'pending');

  const navButtons = isAdmin
    ? [
        { id: 'payments', label: 'Verifikasi Bayar', icon: CreditCard },
        { id: 'withdrawals', label: 'Pencairan', icon: Wallet },
        { id: 'vouchers', label: 'Voucher WD.UP', icon: Tag },
        { id: 'cms', label: 'Home CMS & Cover', icon: LayoutTemplate },
        { id: 'footer', label: 'Footer & Lisensi', icon: Globe },
        { id: 'academy', label: 'Academy, Quiz & Grup', icon: BookOpen },
        { id: 'market', label: 'Market & Produk WD.UP', icon: ShoppingBag },
        { id: 'users', label: `Users, Mentor & Kode${pendingMentors.length ? ` (${pendingMentors.length})` : ''}`, icon: Users },
        { id: 'notifications', label: 'Notifikasi', icon: Bell },
        { id: 'ai_kb', label: 'WD.UP AI KB', icon: Sparkles },
      ]
    : [
        { id: 'cms', label: 'Home CMS & Cover', icon: LayoutTemplate },
        { id: 'academy', label: 'Academy, Quiz & Grup', icon: BookOpen },
      ];

  return (
    <div className="space-y-6">
      <div className="bg-[#3D2C24] text-[#FAF6F0] rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-[#F3C669] font-semibold">
            <Shield className="w-4 h-4" />
            <span>{isAdmin ? 'Admin Dashboard (Akses Penuh)' : 'Editor Dashboard (Akses Konten)'}</span>
          </div>
          <h2 className="font-display text-2xl font-semibold">Panel Pengelolaan WD.UP</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="px-3 py-2 rounded-xl bg-white/10">
            <p className="text-[10px] text-[#FAF6F0]/70">Pengguna</p>
            <p className="font-mono font-bold text-base">{stats.usersCount || 0}</p>
          </div>
          <div className="px-3 py-2 rounded-xl bg-white/10">
            <p className="text-[10px] text-[#FAF6F0]/70">Toko</p>
            <p className="font-mono font-bold text-base">{stats.storesCount || 0}</p>
          </div>
          {isAdmin ? (
            <>
              <div className="px-3 py-2 rounded-xl bg-white/10">
                <p className="text-[10px] text-[#FAF6F0]/70">Antrean Verifikasi</p>
                <p className="font-mono font-bold text-base text-[#F3C669]">
                  {stats.waitingVerificationCount || 0}
                </p>
              </div>
              <div className="px-3 py-2 rounded-xl bg-white/10">
                <p className="text-[10px] text-[#FAF6F0]/70">Omzet Paid</p>
                <p className="font-mono font-bold text-xs mt-1">{formatRupiah(stats.paidRevenue || 0)}</p>
              </div>
            </>
          ) : (
            <div className="px-3 py-2 rounded-xl bg-white/10 col-span-2">
              <p className="text-[10px] text-[#FAF6F0]/70">Tugas Menunggu Nilai</p>
              <p className="font-mono font-bold text-base text-[#F3C669]">{stats.pendingSubmissions || 0}</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {navButtons.map((b) => {
          const Icon = b.icon;
          return (
            <button
              key={b.id}
              onClick={() => setTab(b.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                tab === b.id ? 'bg-[#3D2C24] text-[#FAF6F0]' : 'bg-white text-[#6E5A50] border border-[#3D2C24]/10'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{b.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB: PAYMENTS & VERIFICATION (ADMIN ONLY) */}
      {isAdmin && tab === 'payments' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-[#3D2C24]">Verifikasi Pembayaran Manual & Pesanan</h3>
            {orders.length === 0 ? (
              <p className="text-xs text-[#6E5A50]">Belum ada pesanan masuk.</p>
            ) : (
              <div className="space-y-4">
                {orders.map((ord) => {
                  const hasProofSection = Boolean(
                    ord.proof_image_data ||
                      ord.sender_name ||
                      ord.transfer_reference ||
                      ord.proof_note ||
                      ord.submitted_at
                  );
                  return (
                    <div key={ord.id} className="p-4 rounded-2xl bg-[#FAF6F0] border border-[#3D2C24]/12 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-mono text-xs font-bold text-[#3D2C24]">
                            {ord.order_code} · <span className="text-[#E07A5F]">{ord.status}</span>
                          </p>
                          <p className="text-xs text-[#6E5A50]">
                            {ord.buyer_name} ({ord.buyer_email}
                            {ord.buyer_whatsapp ? ` · WA: ${ord.buyer_whatsapp}` : ''}) ·{' '}
                            {ord.provider_name || 'Metode Dihapus'} · {formatDateTimeId(ord.created_at)}
                          </p>
                          {ord.voucher_code && (
                            <p className="text-[11px] font-semibold text-[#527362]">
                              Voucher: {ord.voucher_code} (Diskon {formatRupiah(ord.discount_amount || 0)})
                            </p>
                          )}
                        </div>
                        <p className="font-mono tabular-nums text-base font-bold text-[#3D2C24]">
                          {formatRupiah(ord.total_amount)}
                        </p>
                      </div>

                      <div className="text-xs text-[#3D2C24]/85 space-y-1">
                        {ord.items.map((it) => (
                          <div key={it.id}>
                            • [{it.item_type}] {it.title} x{it.quantity} ({formatRupiah(it.subtotal)})
                          </div>
                        ))}
                      </div>

                      {hasProofSection && (
                        <div className="p-3 rounded-xl bg-white border border-[#3D2C24]/10 text-xs space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[#3D2C24]">
                              <strong>Pengirim:</strong> {ord.sender_name || ord.buyer_name} ·{' '}
                              <strong>Ref:</strong> {ord.transfer_reference || '-'} ·{' '}
                              <strong>Catatan:</strong> {ord.proof_note || '-'}
                            </p>
                            {ord.submitted_at && (
                              <span className="text-[10px] text-[#6E5A50]">
                                Dikirim: {formatDateTimeId(ord.submitted_at)}
                              </span>
                            )}
                          </div>
                          {ord.proof_image_data ? (
                            <div className="flex flex-wrap items-center gap-3">
                              <img
                                src={ord.proof_image_data}
                                alt={`Bukti Transfer ${ord.order_code}`}
                                onClick={() => setZoomProofUrl(ord.proof_image_data)}
                                className="max-h-52 rounded-xl border border-[#3D2C24]/15 object-contain cursor-zoom-in bg-[#FAF6F0]"
                              />
                              <button
                                type="button"
                                onClick={() => setZoomProofUrl(ord.proof_image_data)}
                                className="px-3 py-1.5 rounded-xl bg-[#FAF6F0] hover:bg-[#F2EAE0] border border-[#3D2C24]/15 text-[11px] font-semibold text-[#3D2C24] inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <ZoomIn className="w-3.5 h-3.5" />
                                <span>Perbesar Bukti Pembayaran</span>
                              </button>
                            </div>
                          ) : (
                            <p className="text-[11px] text-[#E07A5F] font-medium">
                              Pembeli mengirimkan konfirmasi tanpa lampiran foto bukti transfer.
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleVerifyOrder(ord.id, 'Paid')}
                          disabled={ord.status === 'Paid'}
                          className="px-3.5 py-1.5 rounded-xl bg-[#6B8E7B] hover:bg-[#527362] text-white text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Verifikasi Paid</span>
                        </button>
                        <button
                          onClick={() => handleVerifyOrder(ord.id, 'Rejected')}
                          className="px-3.5 py-1.5 rounded-xl bg-[#E07A5F] text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Tolak (Rejected)</span>
                        </button>
                        <button
                          onClick={() => handleVerifyOrder(ord.id, 'Cancelled')}
                          className="px-3 py-1.5 rounded-xl bg-white border border-[#3D2C24]/15 text-xs font-semibold cursor-pointer"
                        >
                          Cancelled
                        </button>
                        <button
                          onClick={() => handleVerifyOrder(ord.id, 'Refunded')}
                          className="px-3 py-1.5 rounded-xl bg-white border border-[#3D2C24]/15 text-xs font-semibold cursor-pointer"
                        >
                          Refunded
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Payment Methods Config (Full Edit & Delete including seeded examples) */}
          <div className="bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[#3D2C24]">
                Pengaturan Metode Pembayaran (Bank / E-Wallet / QRIS)
              </h3>
              <p className="text-[11px] text-[#6E5A50]">
                Semua metode pembayaran termasuk contoh bawaan dapat diedit, dinonaktifkan, atau dihapus langsung dari sini.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {methods.map((m) => {
                const isEditingPm = editingPmId === m.id;
                const isConfirmDelete = confirmDeletePmId === m.id;
                return (
                  <div key={m.id} className="p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#3D2C24]/12 text-xs space-y-2">
                    {isEditingPm ? (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          try {
                            await apiFetch(`/api/admin/payment-methods/${m.id}`, {
                              method: 'PUT',
                              body: JSON.stringify(editPmForm),
                            });
                            setEditingPmId(null);
                            toast('Metode pembayaran berhasil diperbarui.', 'sage');
                            loadAll();
                          } catch (err) {
                            toast(err instanceof Error ? err.message : 'Gagal memperbarui rekening.', 'coral');
                          }
                        }}
                        className="space-y-2"
                      >
                        <select
                          value={editPmForm.type}
                          onChange={(e) => setEditPmForm({ ...editPmForm, type: e.target.value })}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#3D2C24]/15 text-xs"
                        >
                          <option value="bank_transfer">Bank Transfer</option>
                          <option value="e_wallet">E-Wallet</option>
                          <option value="qris">QRIS</option>
                        </select>
                        <input
                          type="text"
                          required
                          placeholder="Nama Bank / E-Wallet"
                          value={editPmForm.provider_name}
                          onChange={(e) => setEditPmForm({ ...editPmForm, provider_name: e.target.value })}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#3D2C24]/15 text-xs"
                        />
                        <input
                          type="text"
                          required
                          placeholder="No. Rekening / E-Wallet"
                          value={editPmForm.account_number}
                          onChange={(e) => setEditPmForm({ ...editPmForm, account_number: e.target.value })}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#3D2C24]/15 text-xs font-mono"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Nama Pemilik"
                          value={editPmForm.account_holder}
                          onChange={(e) => setEditPmForm({ ...editPmForm, account_holder: e.target.value })}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#3D2C24]/15 text-xs"
                        />
                        <input
                          type="text"
                          placeholder="Instruksi pembayaran (opsional)"
                          value={editPmForm.instructions}
                          onChange={(e) => setEditPmForm({ ...editPmForm, instructions: e.target.value })}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#3D2C24]/15 text-xs"
                        />
                        <div className="flex gap-1.5 pt-1">
                          <button
                            type="submit"
                            className="flex-1 py-1.5 rounded-lg bg-[#6B8E7B] text-white font-semibold text-[11px] cursor-pointer"
                          >
                            Simpan
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingPmId(null)}
                            className="px-3 py-1.5 rounded-lg bg-white border border-[#3D2C24]/15 text-[11px] font-semibold cursor-pointer"
                          >
                            Batal
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-semibold text-[#6E5A50] uppercase">
                              {m.type === 'e_wallet' ? 'E-Wallet' : m.type === 'qris' ? 'QRIS' : 'Bank Transfer'}
                            </span>
                            <p className="font-semibold text-[#3D2C24]">{m.provider_name}</p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              m.is_active ? 'bg-[#EFF5F1] text-[#527362]' : 'bg-[#F2EAE0] text-[#6E5A50]'
                            }`}
                          >
                            {m.is_active ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </div>
                        <p className="font-mono font-bold text-[#527362]">{m.account_number}</p>
                        <p className="text-[#6E5A50]">a.n. {m.account_holder}</p>
                        {m.instructions && <p className="text-[11px] text-[#6E5A50] line-clamp-2">{m.instructions}</p>}

                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/admin/payment-methods/${m.id}`, {
                                method: 'PUT',
                                body: JSON.stringify({ is_active: m.is_active ? 0 : 1 }),
                              });
                              loadAll();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-white border border-[#3D2C24]/15 text-[11px] font-semibold cursor-pointer"
                          >
                            {m.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPmId(m.id);
                              setConfirmDeletePmId(null);
                              setEditPmForm({
                                type: m.type || 'bank_transfer',
                                provider_name: m.provider_name,
                                account_number: m.account_number,
                                account_holder: m.account_holder,
                                instructions: m.instructions || '',
                                is_active: m.is_active,
                              });
                            }}
                            className="px-2.5 py-1 rounded-lg bg-white border border-[#3D2C24]/15 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          {isConfirmDelete ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await apiFetch(`/api/admin/payment-methods/${m.id}`, { method: 'DELETE' });
                                    setConfirmDeletePmId(null);
                                    toast('Metode pembayaran dihapus.', 'brown');
                                    loadAll();
                                  } catch (err) {
                                    toast(err instanceof Error ? err.message : 'Gagal menghapus metode.', 'coral');
                                  }
                                }}
                                className="px-2 py-1 rounded-lg bg-[#E07A5F] text-white text-[11px] font-semibold cursor-pointer"
                              >
                                Yakin Hapus
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeletePmId(null)}
                                className="px-2 py-1 rounded-lg bg-white border border-[#3D2C24]/15 text-[11px] font-semibold cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeletePmId(m.id)}
                              className="px-2.5 py-1 rounded-lg text-[#E07A5F] hover:bg-[#E07A5F]/10 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Hapus</span>
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await apiFetch('/api/admin/payment-methods', { method: 'POST', body: JSON.stringify(newPm) });
                  setNewPm({
                    type: 'bank_transfer',
                    provider_name: '',
                    account_number: '',
                    account_holder: '',
                    instructions: '',
                  });
                  toast('Metode pembayaran ditambahkan.', 'sage');
                  loadAll();
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'Gagal menambah metode pembayaran.', 'coral');
                }
              }}
              className="grid sm:grid-cols-6 gap-2 pt-3 border-t border-[#3D2C24]/10"
            >
              <select
                value={newPm.type}
                onChange={(e) => setNewPm({ ...newPm, type: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="e_wallet">E-Wallet</option>
                <option value="qris">QRIS</option>
              </select>
              <input
                type="text"
                required
                placeholder="Nama Bank / E-Wallet"
                value={newPm.provider_name}
                onChange={(e) => setNewPm({ ...newPm, provider_name: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              />
              <input
                type="text"
                required
                placeholder="No. Rekening / ID"
                value={newPm.account_number}
                onChange={(e) => setNewPm({ ...newPm, account_number: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs font-mono"
              />
              <input
                type="text"
                required
                placeholder="Nama Pemilik Rekening"
                value={newPm.account_holder}
                onChange={(e) => setNewPm({ ...newPm, account_holder: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              />
              <input
                type="text"
                placeholder="Instruksi singkat (opsional)"
                value={newPm.instructions}
                onChange={(e) => setNewPm({ ...newPm, instructions: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              />
              <button type="submit" className="px-4 py-2 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold cursor-pointer">
                + Tambah Rekening
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB: WITHDRAWALS (ADMIN ONLY) */}
      {isAdmin && tab === 'withdrawals' && (
        <div className="bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[#3D2C24]">Permintaan Pencairan Saldo (Wallet Withdrawals)</h3>
            <p className="text-[11px] text-[#6E5A50]">
              Penarikan minimum Rp 50.000 dengan biaya transfer Rp 3.000 per pengajuan.
            </p>
          </div>
          {withdrawals.length === 0 ? (
            <p className="text-xs text-[#6E5A50]">Belum ada permintaan pencairan dana.</p>
          ) : (
            <div className="space-y-3">
              {withdrawals.map((w) => {
                const fee = w.transfer_fee ?? 3000;
                const net = w.net_amount ?? Math.max(0, w.amount - fee);
                return (
                  <div key={w.id} className="p-4 rounded-2xl bg-[#FAF6F0] flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-semibold text-[#3D2C24]">
                        {w.user_name} ({w.user_email}) · Ajuan:{' '}
                        <span className="font-mono">{formatRupiah(w.amount)}</span>
                      </p>
                      <p className="text-[#527362] font-mono text-[11px]">
                        Biaya transfer: {formatRupiah(fee)} · Bersih ditransfer: <strong>{formatRupiah(net)}</strong>
                      </p>
                      <p className="text-[#6E5A50]">
                        {w.bank_or_ewallet} · {w.account_number} a.n. {w.account_holder} · Status: <strong>{w.status}</strong>
                      </p>
                    </div>
                    {w.status === 'Pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleProcessWithdrawal(w.id, 'Approved')}
                          className="px-3 py-1.5 rounded-xl bg-[#6B8E7B] text-white font-semibold cursor-pointer"
                        >
                          Setujui & Tandai Dibayar
                        </button>
                        <button
                          onClick={() => handleProcessWithdrawal(w.id, 'Rejected')}
                          className="px-3 py-1.5 rounded-xl bg-[#E07A5F] text-white font-semibold cursor-pointer"
                        >
                          Tolak
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB: PLATFORM VOUCHERS (ADMIN ONLY — CLEAR LABELS, EDIT & EXPIRY) */}
      {isAdmin && tab === 'vouchers' && (
        <div className="space-y-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSavingVoucher(true);
              try {
                const payload = {
                  code: newPlatformVoucher.code,
                  title: newPlatformVoucher.title,
                  discount_type: newPlatformVoucher.discount_type,
                  discount_value: Number(newPlatformVoucher.discount_value),
                  min_purchase: Number(newPlatformVoucher.min_purchase || 0),
                  max_discount: newPlatformVoucher.max_discount ? Number(newPlatformVoucher.max_discount) : null,
                  quota_limit: newPlatformVoucher.quota_limit ? Number(newPlatformVoucher.quota_limit) : null,
                  expires_at: newPlatformVoucher.expires_at ? newPlatformVoucher.expires_at : null,
                };
                if (editingVoucherId) {
                  await apiFetch(`/api/admin/vouchers/${editingVoucherId}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                  });
                  toast(`Voucher "${newPlatformVoucher.code}" berhasil diperbarui!`, 'sage');
                } else {
                  await apiFetch('/api/admin/vouchers', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                  });
                  toast('Voucher platform WD.UP diterbitkan!', 'sage');
                }
                setEditingVoucherId(null);
                setNewPlatformVoucher(emptyVoucherForm());
                await loadAll();
              } catch (err) {
                toast(err instanceof Error ? err.message : 'Gagal menyimpan voucher.', 'coral');
              } finally {
                setSavingVoucher(false);
              }
            }}
            className="bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[#3D2C24]">
                  {editingVoucherId ? 'Edit Detail Voucher WD.UP' : 'Buat Voucher Promo Platform WD.UP'}
                </h3>
                <p className="text-[11px] text-[#6E5A50]">
                  Voucher Platform berlaku untuk pembelian kelas Academy, produk digital Market, maupun langganan WD.UP Pro.
                </p>
              </div>
              {editingVoucherId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingVoucherId(null);
                    setNewPlatformVoucher(emptyVoucherForm());
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs font-semibold text-[#E07A5F] cursor-pointer"
                >
                  Batal Edit
                </button>
              )}
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-[#3D2C24] mb-0.5">Kode Voucher *</label>
                <p className="text-[10px] text-[#6E5A50] mb-1">Kode unik huruf kapital yang dimasukkan di keranjang.</p>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingVoucherId)}
                  placeholder="Mis. WDUPPRO25"
                  value={newPlatformVoucher.code}
                  onChange={(e) =>
                    setNewPlatformVoucher({
                      ...newPlatformVoucher,
                      code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''),
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 font-mono uppercase disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#3D2C24] mb-0.5">Judul Promo *</label>
                <p className="text-[10px] text-[#6E5A50] mb-1">Keterangan promo yang tampil saat kode berhasil dipakai.</p>
                <input
                  type="text"
                  required
                  placeholder="Diskon Spesial Member"
                  value={newPlatformVoucher.title}
                  onChange={(e) => setNewPlatformVoucher({ ...newPlatformVoucher, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#3D2C24] mb-0.5">Tipe Potongan</label>
                <p className="text-[10px] text-[#6E5A50] mb-1">Potongan nominal Rupiah atau persentase (%).</p>
                <select
                  value={newPlatformVoucher.discount_type}
                  onChange={(e) =>
                    setNewPlatformVoucher({
                      ...newPlatformVoucher,
                      discount_type: e.target.value as 'fixed' | 'percent',
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
                >
                  <option value="fixed">Potongan Nominal (Rp)</option>
                  <option value="percent">Diskon Persen (%)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#3D2C24] mb-0.5">
                  {newPlatformVoucher.discount_type === 'percent' ? 'Besar Diskon (%)' : 'Nominal Potongan (Rp)'}
                </label>
                <p className="text-[10px] text-[#6E5A50] mb-1">
                  {newPlatformVoucher.discount_type === 'percent'
                    ? 'Nilai antara 1% s.d. 100%.'
                    : 'Jumlah rupiah yang dipotong.'}
                </p>
                <input
                  type="number"
                  min={1}
                  max={newPlatformVoucher.discount_type === 'percent' ? 100 : undefined}
                  required
                  value={newPlatformVoucher.discount_value}
                  onChange={(e) =>
                    setNewPlatformVoucher({ ...newPlatformVoucher, discount_value: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#3D2C24] mb-0.5">Minimal Belanja (Rp)</label>
                <p className="text-[10px] text-[#6E5A50] mb-1">Isi 0 jika tanpa minimal belanja.</p>
                <input
                  type="number"
                  min={0}
                  value={newPlatformVoucher.min_purchase}
                  onChange={(e) =>
                    setNewPlatformVoucher({ ...newPlatformVoucher, min_purchase: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#3D2C24] mb-0.5">Maks. Potongan (Opsional)</label>
                <p className="text-[10px] text-[#6E5A50] mb-1">Batas atas rupiah (berguna untuk diskon %).</p>
                <input
                  type="number"
                  min={1000}
                  placeholder="Tanpa batas"
                  value={newPlatformVoucher.max_discount}
                  onChange={(e) => setNewPlatformVoucher({ ...newPlatformVoucher, max_discount: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#3D2C24] mb-0.5">Kuota Pemakaian (Opsional)</label>
                <p className="text-[10px] text-[#6E5A50] mb-1">Maksimal klaim voucher. Kosong = bebas.</p>
                <input
                  type="number"
                  min={1}
                  placeholder="Tanpa batas"
                  value={newPlatformVoucher.quota_limit}
                  onChange={(e) => setNewPlatformVoucher({ ...newPlatformVoucher, quota_limit: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#3D2C24] mb-0.5">Masa Berlaku (Expired)</label>
                <p className="text-[10px] text-[#6E5A50] mb-1">Tanggal kedaluwarsa otomatis. Kosong = selamanya.</p>
                <input
                  type="date"
                  value={newPlatformVoucher.expires_at}
                  onChange={(e) => setNewPlatformVoucher({ ...newPlatformVoucher, expires_at: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingVoucher}
              className="px-5 py-2.5 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {savingVoucher
                ? 'Menyimpan...'
                : editingVoucherId
                ? 'Simpan Perubahan Voucher'
                : '+ Terbitkan Voucher WD.UP'}
            </button>
          </form>

          <div className="bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-2.5">
            <h3 className="text-sm font-semibold text-[#3D2C24]">Semua Voucher ({vouchersList.length})</h3>
            {vouchersList.length === 0 ? (
              <p className="text-xs text-[#6E5A50]">Belum ada voucher platform maupun voucher toko.</p>
            ) : (
              <div className="space-y-2">
                {vouchersList.map((v) => {
                  const isExpired = Boolean(v.expires_at && new Date(v.expires_at) <= new Date());
                  return (
                    <div
                      key={v.id}
                      className="p-3 rounded-2xl bg-[#FAF6F0] flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-mono font-bold text-[#3D2C24]">
                            {v.code} ·{' '}
                            <span className="font-sans text-[#527362]">
                              {v.scope === 'platform' ? 'Platform WD.UP' : `Toko: ${v.store_name || 'Seller'}`}
                            </span>
                          </p>
                          {isExpired && (
                            <span className="px-1.5 py-0.5 rounded bg-[#E07A5F]/20 text-[#E07A5F] text-[10px] font-bold">
                              Kadaluwarsa
                            </span>
                          )}
                        </div>
                        <p className="text-[#6E5A50]">
                          {v.title} ·{' '}
                          {v.discount_type === 'percent' ? `${v.discount_value}%` : formatRupiah(v.discount_value)}
                          {v.max_discount ? ` (Maks ${formatRupiah(v.max_discount)})` : ''} · Min{' '}
                          {formatRupiah(v.min_purchase)} · Terpakai {v.used_count}
                          {v.quota_limit ? `/${v.quota_limit}` : ''} ·{' '}
                          {v.expires_at ? `Berlaku s.d. ${v.expires_at.slice(0, 10)}` : 'Tanpa batas waktu'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingVoucherId(v.id);
                            setNewPlatformVoucher({
                              code: v.code,
                              title: v.title || '',
                              discount_type: v.discount_type === 'percent' ? 'percent' : 'fixed',
                              discount_value: v.discount_value,
                              min_purchase: v.min_purchase || 0,
                              max_discount: v.max_discount ? String(v.max_discount) : '',
                              quota_limit: v.quota_limit ? String(v.quota_limit) : '',
                              expires_at: v.expires_at ? v.expires_at.slice(0, 10) : '',
                            });
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white border border-[#3D2C24]/15 font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/vouchers/${v.id}`, {
                              method: 'PUT',
                              body: JSON.stringify({ is_active: !v.is_active }),
                            });
                            loadAll();
                          }}
                          className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                            v.is_active ? 'bg-[#6B8E7B] text-white' : 'bg-white border border-[#3D2C24]/15'
                          }`}
                        >
                          {v.is_active ? 'Aktif' : 'Nonaktif'}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/vouchers/${v.id}`, { method: 'DELETE' });
                            loadAll();
                          }}
                          className="px-2.5 py-1 rounded-lg text-[#E07A5F] font-semibold cursor-pointer"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: HOME CMS & COVER MEDIA (ADMIN + EDITOR — REPLACED SYMBOLS WITH COVER PHOTO/VIDEO/LINK) */}
      {tab === 'cms' && (
        <div className="space-y-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSavingNewCms(true);
              try {
                await apiFetch('/api/admin/cms', { method: 'POST', body: JSON.stringify(newCms) });
                setNewCms(emptyNewCms());
                toast('Konten CMS Home beserta posting cover berhasil diterbitkan!', 'sage');
                notifyCatalogUpdated();
                await loadAll();
              } catch (err) {
                toast(err instanceof Error ? err.message : 'Gagal menerbitkan konten CMS.', 'coral');
              } finally {
                setSavingNewCms(false);
              }
            }}
            className="bg-white rounded-2xl border border-[#3D2C24]/10 p-5 space-y-3"
          >
            <div>
              <h3 className="text-sm font-semibold text-[#3D2C24] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#527362]" />
                <span>Tambah Konten Home & Posting Cover (Foto / Video / Link Tautan)</span>
              </h3>
              <p className="text-[11px] text-[#6E5A50]">
                Unggah foto cover, video pendek, atau tautan aktif untuk ditampilkan di Banner, Pilar, Opportunity, dan Community.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-2">
              <select
                value={newCms.section_type}
                onChange={(e) => setNewCms({ ...newCms, section_type: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              >
                <option value="banner">Banner Promosi</option>
                <option value="lifestyle_category">Pilar Pengembangan</option>
                <option value="opportunity">Opportunity</option>
                <option value="community">Community</option>
                <option value="affiliate_info">Affiliate Info</option>
              </select>
              <input
                type="text"
                required
                placeholder="Judul *"
                value={newCms.title}
                onChange={(e) => setNewCms({ ...newCms, title: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              />
              <input
                type="text"
                placeholder="Subjudul"
                value={newCms.subtitle}
                onChange={(e) => setNewCms({ ...newCms, subtitle: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              />
            </div>

            <textarea
              rows={2}
              placeholder="Deskripsi / isi konten..."
              value={newCms.body}
              onChange={(e) => setNewCms({ ...newCms, body: e.target.value })}
              className="w-full p-2.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
            />

            {/* Posting Cover Media Type & Uploader */}
            <div className="p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#3D2C24]/12 space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[#3D2C24]">Posting Cover / Konten Visual:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'image' as CmsMediaType, label: 'Foto / Gambar', Icon: ImageIcon },
                    { id: 'video' as CmsMediaType, label: 'Video', Icon: Video },
                    { id: 'link' as CmsMediaType, label: 'Link Tautan', Icon: Link2 },
                  ].map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setNewCms({ ...newCms, media_type: id })}
                      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                        newCms.media_type === id
                          ? 'bg-[#3D2C24] text-[#FAF6F0] border-[#3D2C24]'
                          : 'bg-white text-[#3D2C24] border-[#3D2C24]/15'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {newCms.media_type === 'video' && (
                <div className="grid sm:grid-cols-2 gap-2 items-center">
                  <label className="px-3 py-2 rounded-xl bg-white border border-dashed border-[#3D2C24]/25 text-xs font-semibold text-[#3D2C24] inline-flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[#F2EAE0]">
                    <Upload className="w-3.5 h-3.5 text-[#527362]" />
                    <span>Upload Video (MP4/WebM, maks 8MB)</span>
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/ogg"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleUploadCmsVideo(file, (url) => setNewCms((prev) => ({ ...prev, media_url: url })));
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <input
                    type="url"
                    placeholder="Atau tempel URL Video (https://...)"
                    value={newCms.media_url.startsWith('data:') ? '' : newCms.media_url}
                    onChange={(e) => setNewCms({ ...newCms, media_url: e.target.value })}
                    className="px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15 text-xs"
                  />
                  {newCms.media_url && (
                    <p className="sm:col-span-2 text-[11px] text-[#527362] font-semibold">
                      Video cover siap: {newCms.media_url.startsWith('data:') ? 'File video terunggah' : newCms.media_url}
                    </p>
                  )}
                </div>
              )}

              {newCms.media_type === 'link' && (
                <input
                  type="url"
                  required
                  placeholder="Masukkan Link Tautan Aktif (https://...) *"
                  value={newCms.link_url}
                  onChange={(e) => setNewCms({ ...newCms, link_url: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15 text-xs"
                />
              )}

              {/* Cover Foto Upload / URL (Primary for image, optional poster/cover for video/link) */}
              <div className="grid sm:grid-cols-2 gap-2 items-center">
                <label className="px-3 py-2 rounded-xl bg-white border border-dashed border-[#3D2C24]/25 text-xs font-semibold text-[#3D2C24] inline-flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[#F2EAE0]">
                  <Upload className="w-3.5 h-3.5 text-[#E07A5F]" />
                  <span>
                    {newCms.media_type === 'image'
                      ? 'Upload Foto Cover (Otomatis Kompres)'
                      : 'Upload Thumbnail Cover (Opsional)'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleUploadCoverImage(file, (url) => setNewCms((prev) => ({ ...prev, image_url: url })));
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                <input
                  type="url"
                  placeholder="Atau URL Foto Cover (https://...)"
                  value={newCms.image_url.startsWith('data:') ? '' : newCms.image_url}
                  onChange={(e) => setNewCms({ ...newCms, image_url: e.target.value })}
                  className="px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15 text-xs"
                />
              </div>

              {newCms.image_url && (
                <div className="flex items-center gap-3">
                  <img
                    src={newCms.image_url}
                    alt="Preview Cover"
                    className="h-16 w-28 rounded-xl object-cover border border-[#3D2C24]/15"
                  />
                  <button
                    type="button"
                    onClick={() => setNewCms({ ...newCms, image_url: '' })}
                    className="text-[11px] font-semibold text-[#E07A5F] cursor-pointer"
                  >
                    Hapus Foto Cover
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 justify-between items-center">
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  placeholder="Teks Tombol CTA"
                  value={newCms.cta_label}
                  onChange={(e) => setNewCms({ ...newCms, cta_label: e.target.value })}
                  className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
                />
                <select
                  value={newCms.accent_color}
                  onChange={(e) => setNewCms({ ...newCms, accent_color: e.target.value })}
                  className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
                >
                  <option value="lavender">Aksen: Lavender</option>
                  <option value="sage">Aksen: Sage</option>
                  <option value="butter">Aksen: Butter</option>
                  <option value="coral">Aksen: Coral</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={savingNewCms}
                className="px-5 py-2 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {savingNewCms ? 'Menerbitkan...' : 'Terbitkan ke Home'}
              </button>
            </div>
          </form>

          <div className="bg-white rounded-2xl border border-[#3D2C24]/10 p-4 space-y-2.5">
            <h3 className="text-sm font-semibold text-[#3D2C24]">Daftar Konten & Posting Cover Home CMS</h3>
            {cmsItems.map((item) => {
              const isEditing = editingCmsId === item.id;
              const mediaLabel =
                item.media_type === 'video' ? 'Video Cover' : item.media_type === 'link' ? 'Link Tautan' : 'Foto Cover';
              return (
                <div key={item.id} className="p-3 rounded-xl bg-[#FAF6F0] space-y-2.5 text-xs border border-[#3D2C24]/8">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-16 h-12 rounded-lg overflow-hidden bg-white border border-[#3D2C24]/10 flex items-center justify-center shrink-0">
                        {item.image_url ? (
                          <SafeImage src={item.image_url} alt={item.title} className="w-full h-full object-cover" />
                        ) : item.media_type === 'video' ? (
                          <Video className="w-4 h-4 text-[#527362]" />
                        ) : item.media_type === 'link' ? (
                          <Link2 className="w-4 h-4 text-[#527362]" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-[#6E5A50]/50" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-[#527362] text-[11px]">
                          [{item.section_type === 'lifestyle_category' ? 'Pilar' : item.section_type}] · {mediaLabel} ·{' '}
                          {item.is_active ? 'Aktif' : 'Nonaktif'}
                        </p>
                        <p className="font-semibold text-[#3D2C24] truncate">{item.title}</p>
                        <p className="text-[#6E5A50] line-clamp-1">{item.body}</p>
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (isEditing) {
                            setEditingCmsId(null);
                          } else {
                            setEditingCmsId(item.id);
                            setEditCmsForm({
                              title: item.title,
                              subtitle: item.subtitle || '',
                              body: item.body || '',
                              media_type:
                                item.media_type === 'video' || item.media_type === 'link' ? item.media_type : 'image',
                              image_url: item.image_url || '',
                              media_url: item.media_url || '',
                              link_url: item.link_url || '',
                              cta_label: item.cta_label || '',
                              cta_target: item.cta_target || '',
                              accent_color: item.accent_color || 'sage',
                              sort_order: item.sort_order || 1,
                            });
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white border border-[#3D2C24]/15 font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>{isEditing ? 'Batal' : 'Edit & Cover'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/cms/${item.id}`, {
                            method: 'PUT',
                            body: JSON.stringify({ is_active: item.is_active ? 0 : 1 }),
                          });
                          notifyCatalogUpdated();
                          loadAll();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white border border-[#3D2C24]/15 font-semibold cursor-pointer"
                      >
                        {item.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/cms/${item.id}`, { method: 'DELETE' });
                          notifyCatalogUpdated();
                          loadAll();
                        }}
                        className="px-2.5 py-1 rounded-lg text-[#E07A5F] font-semibold cursor-pointer"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>

                  {isEditing && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setSavingEditCms(true);
                        try {
                          await apiFetch(`/api/admin/cms/${item.id}`, {
                            method: 'PUT',
                            body: JSON.stringify(editCmsForm),
                          });
                          setEditingCmsId(null);
                          toast('Perubahan CMS & cover berhasil disimpan.', 'sage');
                          notifyCatalogUpdated();
                          await loadAll();
                        } catch (err) {
                          toast(err instanceof Error ? err.message : 'Gagal memperbarui CMS.', 'coral');
                        } finally {
                          setSavingEditCms(false);
                        }
                      }}
                      className="p-3.5 rounded-xl bg-white border border-[#3D2C24]/12 space-y-2.5"
                    >
                      <div className="grid sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          required
                          placeholder="Judul"
                          value={editCmsForm.title}
                          onChange={(e) => setEditCmsForm({ ...editCmsForm, title: e.target.value })}
                          className="px-2.5 py-1.5 rounded-lg bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
                        />
                        <input
                          type="text"
                          placeholder="Subjudul"
                          value={editCmsForm.subtitle}
                          onChange={(e) => setEditCmsForm({ ...editCmsForm, subtitle: e.target.value })}
                          className="px-2.5 py-1.5 rounded-lg bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
                        />
                      </div>
                      <textarea
                        rows={2}
                        value={editCmsForm.body}
                        onChange={(e) => setEditCmsForm({ ...editCmsForm, body: e.target.value })}
                        className="w-full p-2 rounded-lg bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
                      />

                      {/* Edit Cover Type */}
                      <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/10 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-[#3D2C24]">Ganti Jenis Cover:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { id: 'image' as CmsMediaType, label: 'Foto', Icon: ImageIcon },
                              { id: 'video' as CmsMediaType, label: 'Video', Icon: Video },
                              { id: 'link' as CmsMediaType, label: 'Link Tautan', Icon: Link2 },
                            ].map(({ id, label, Icon }) => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => setEditCmsForm({ ...editCmsForm, media_type: id })}
                                className={`px-2 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                                  editCmsForm.media_type === id
                                    ? 'bg-[#3D2C24] text-[#FAF6F0] border-[#3D2C24]'
                                    : 'bg-white text-[#3D2C24] border-[#3D2C24]/15'
                                }`}
                              >
                                <Icon className="w-3 h-3" />
                                <span>{label}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {editCmsForm.media_type === 'video' && (
                          <div className="grid sm:grid-cols-2 gap-2">
                            <label className="px-3 py-1.5 rounded-lg bg-white border border-dashed border-[#3D2C24]/25 font-semibold inline-flex items-center justify-center gap-1 cursor-pointer">
                              <Upload className="w-3 h-3 text-[#527362]" />
                              <span>Upload Video Baru (maks 8 MB)</span>
                              <input
                                type="file"
                                accept="video/mp4,video/webm,video/ogg"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleUploadCmsVideo(file, (url) =>
                                      setEditCmsForm((prev) => ({ ...prev, media_url: url }))
                                    );
                                  }
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            <input
                              type="url"
                              placeholder="Atau URL Video (https://...)"
                              value={editCmsForm.media_url.startsWith('data:') ? '' : editCmsForm.media_url}
                              onChange={(e) => setEditCmsForm({ ...editCmsForm, media_url: e.target.value })}
                              className="px-2.5 py-1.5 rounded-lg bg-white border border-[#3D2C24]/15 text-xs"
                            />
                          </div>
                        )}

                        {editCmsForm.media_type === 'link' && (
                          <input
                            type="url"
                            required
                            placeholder="Link Tautan Tujuan (https://...)"
                            value={editCmsForm.link_url}
                            onChange={(e) => setEditCmsForm({ ...editCmsForm, link_url: e.target.value })}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#3D2C24]/15 text-xs"
                          />
                        )}

                        <div className="grid sm:grid-cols-2 gap-2 items-center">
                          <label className="px-3 py-1.5 rounded-lg bg-white border border-dashed border-[#3D2C24]/25 font-semibold inline-flex items-center justify-center gap-1 cursor-pointer">
                            <Upload className="w-3 h-3 text-[#E07A5F]" />
                            <span>Upload Foto Cover Baru</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleUploadCoverImage(file, (url) =>
                                    setEditCmsForm((prev) => ({ ...prev, image_url: url }))
                                  );
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>
                          <input
                            type="text"
                            placeholder="Atau URL Foto Cover"
                            value={editCmsForm.image_url.startsWith('data:') ? '' : editCmsForm.image_url}
                            onChange={(e) => setEditCmsForm({ ...editCmsForm, image_url: e.target.value })}
                            className="px-2.5 py-1.5 rounded-lg bg-white border border-[#3D2C24]/15 text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder="Teks CTA"
                          value={editCmsForm.cta_label}
                          onChange={(e) => setEditCmsForm({ ...editCmsForm, cta_label: e.target.value })}
                          className="px-2.5 py-1.5 rounded-lg bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
                        />
                        <select
                          value={editCmsForm.accent_color}
                          onChange={(e) => setEditCmsForm({ ...editCmsForm, accent_color: e.target.value })}
                          className="px-2.5 py-1.5 rounded-lg bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
                        >
                          <option value="lavender">Warna: Lavender</option>
                          <option value="sage">Warna: Sage</option>
                          <option value="butter">Warna: Butter</option>
                          <option value="coral">Warna: Coral</option>
                        </select>
                        <input
                          type="number"
                          min={1}
                          value={editCmsForm.sort_order}
                          onChange={(e) => setEditCmsForm({ ...editCmsForm, sort_order: Number(e.target.value) })}
                          className="px-2.5 py-1.5 rounded-lg bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs font-mono"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={savingEditCms}
                        className="px-4 py-1.5 rounded-lg bg-[#6B8E7B] hover:bg-[#527362] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                      >
                        {savingEditCms ? 'Menyimpan...' : 'Simpan Perubahan Cover & Konten'}
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB: OFFICIAL FOOTER & LICENSE SETTINGS (ADMIN ONLY) */}
      {isAdmin && tab === 'footer' && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const res = await apiFetch<{ siteFooter: SiteFooterInfo }>('/api/admin/site-footer', {
                method: 'PUT',
                body: JSON.stringify(footerForm),
              });
              setFooterForm(res.siteFooter);
              toast('Lisensi website, kontak, dan media sosial footer berhasil diperbarui!', 'sage');
            } catch (err) {
              toast(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan footer.', 'coral');
            }
          }}
          className="bg-white rounded-2xl border border-[#3D2C24]/10 p-5 space-y-4 text-xs"
        >
          <div>
            <h3 className="text-sm font-semibold text-[#3D2C24]">Footer Resmi Website (WD.UP Home)</h3>
            <p className="text-[11px] text-[#6E5A50]">
              Kelola lisensi website resmi, email/kontak, alamat, dan tautan media sosial yang tampil di bagian bawah WD.UP Home.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#3D2C24] mb-1">Judul Lisensi Website Resmi</label>
              <input
                type="text"
                required
                value={footerForm.license_title}
                onChange={(e) => setFooterForm({ ...footerForm, license_title: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#3D2C24] mb-1">Nomor / Keterangan Registrasi Lisensi</label>
              <input
                type="text"
                required
                value={footerForm.license_number}
                onChange={(e) => setFooterForm({ ...footerForm, license_number: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-[#3D2C24] mb-1">Teks Copyright Bawah</label>
            <input
              type="text"
              required
              value={footerForm.copyright}
              onChange={(e) => setFooterForm({ ...footerForm, copyright: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
            />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-[#3D2C24] mb-1">Email Resmi</label>
              <input
                type="email"
                value={footerForm.email}
                onChange={(e) => setFooterForm({ ...footerForm, email: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#3D2C24] mb-1">Kontak / WhatsApp Resmi</label>
              <input
                type="text"
                value={footerForm.whatsapp}
                onChange={(e) => setFooterForm({ ...footerForm, whatsapp: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#3D2C24] mb-1">Domisili / Alamat</label>
              <input
                type="text"
                value={footerForm.address}
                onChange={(e) => setFooterForm({ ...footerForm, address: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-[#3D2C24]/10">
            <div>
              <label className="block font-semibold text-[#3D2C24] mb-1">URL Instagram (https://...)</label>
              <input
                type="url"
                value={footerForm.instagram}
                onChange={(e) => setFooterForm({ ...footerForm, instagram: e.target.value })}
                placeholder="https://instagram.com/..."
                className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#3D2C24] mb-1">URL TikTok (https://...)</label>
              <input
                type="url"
                value={footerForm.tiktok}
                onChange={(e) => setFooterForm({ ...footerForm, tiktok: e.target.value })}
                placeholder="https://tiktok.com/@..."
                className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#3D2C24] mb-1">URL YouTube (https://...)</label>
              <input
                type="url"
                value={footerForm.youtube}
                onChange={(e) => setFooterForm({ ...footerForm, youtube: e.target.value })}
                placeholder="https://youtube.com/@..."
                className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#3D2C24] mb-1">URL Website Resmi (https://...)</label>
              <input
                type="url"
                value={footerForm.website}
                onChange={(e) => setFooterForm({ ...footerForm, website: e.target.value })}
                placeholder="https://wdup.id"
                className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
              />
            </div>
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] text-xs font-semibold cursor-pointer"
          >
            Simpan Pengaturan Footer & Lisensi
          </button>
        </form>
      )}

      {/* TAB: ACADEMY SUBMISSIONS, QUIZ PEMAHAMAN (MIN 5) & GROUP LINK (ADMIN + EDITOR) */}
      {tab === 'academy' && <MentorAcademyView embeddedInAdmin />}

      {/* TAB: MARKET, STORES & OFFICIAL WD.UP PRODUCTS (ADMIN ONLY — B4) */}
      {isAdmin && tab === 'market' && (
        <div className="space-y-5">
          {/* Official WD.UP Product Publisher */}
          <form
            onSubmit={handleSaveOfficialProduct}
            className="bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-4 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[#3D2C24]">
                  {editingOfficialId
                    ? 'Edit Produk Resmi WD.UP Official'
                    : 'Tambah Produk Resmi WD.UP Official (Posting Seperti Seller)'}
                </h3>
                <p className="text-[11px] text-[#6E5A50]">
                  Produk yang diterbitkan dari sini tampil resmi atas nama toko <strong>WD.UP Official</strong> di Market & Beranda.
                </p>
              </div>
              {editingOfficialId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingOfficialId(null);
                    setEditingOfficialHasFile(false);
                    setOfficialForm(emptyOfficialProductForm());
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 font-semibold text-[#E07A5F] cursor-pointer"
                >
                  Batal Edit
                </button>
              )}
            </div>

            <div className="grid sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                required
                placeholder="Judul Produk WD.UP *"
                value={officialForm.title}
                onChange={(e) => setOfficialForm({ ...officialForm, title: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
              />
              <select
                value={officialForm.category}
                onChange={(e) => setOfficialForm({ ...officialForm, category: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
              >
                {MARKET_CATEGORIES.filter((c) => c !== 'Semua').map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={officialForm.home_pillar}
                onChange={(e) => setOfficialForm({ ...officialForm, home_pillar: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
              >
                {HOME_PILLARS.map((p) => (
                  <option key={p} value={p}>
                    Pilar: {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid sm:grid-cols-4 gap-2.5 items-end">
              <div>
                <label className="block font-semibold text-[#3D2C24] mb-1">Harga Awal (Rp) *</label>
                <input
                  type="number"
                  min={1000}
                  required
                  value={officialForm.base_price}
                  onChange={(e) => setOfficialForm({ ...officialForm, base_price: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 font-mono"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 font-semibold text-[#3D2C24] mb-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={officialForm.has_promo}
                    onChange={(e) => setOfficialForm({ ...officialForm, has_promo: e.target.checked })}
                  />
                  <span>Aktifkan Harga Promo</span>
                </label>
                <input
                  type="number"
                  min={1000}
                  disabled={!officialForm.has_promo}
                  value={officialForm.promo_price}
                  onChange={(e) => setOfficialForm({ ...officialForm, promo_price: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 font-mono disabled:opacity-45"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#3D2C24] mb-1">Kuota Batas (Opsional)</label>
                <input
                  type="number"
                  min={1}
                  placeholder="Tanpa batas"
                  value={officialForm.quota_limit}
                  onChange={(e) => setOfficialForm({ ...officialForm, quota_limit: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#3D2C24] mb-1">Bentuk Cover</label>
                <select
                  value={officialForm.cover_shape}
                  onChange={(e) =>
                    setOfficialForm({ ...officialForm, cover_shape: e.target.value as ProductCoverShape })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
                >
                  {PRODUCT_COVER_SHAPES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label} ({s.desc})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-2.5 items-end">
              <div>
                <label className="block font-semibold text-[#3D2C24] mb-1">Teks Tombol Beli</label>
                <input
                  type="text"
                  maxLength={32}
                  placeholder="Beli Sekarang"
                  value={officialForm.cta_label}
                  onChange={(e) => setOfficialForm({ ...officialForm, cta_label: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRODUCT_CTA_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setOfficialForm({ ...officialForm, cta_label: preset })}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
                      officialForm.cta_label === preset
                        ? 'bg-[#3D2C24] text-[#FAF6F0]'
                        : 'bg-[#FAF6F0] border border-[#3D2C24]/15 text-[#3D2C24]'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Cover Upload / URL (optional — supports text-only products too) */}
            <div className="p-3 rounded-2xl bg-[#FAF6F0] border border-[#3D2C24]/10 grid sm:grid-cols-2 gap-2.5 items-center">
              <label className="px-3 py-2 rounded-xl bg-white border border-dashed border-[#3D2C24]/25 font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[#F2EAE0]">
                <Upload className="w-3.5 h-3.5 text-[#E07A5F]" />
                <span>Upload Gambar Sampul (Opsional)</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleUploadCoverImage(file, (url) => setOfficialForm((prev) => ({ ...prev, image_url: url })));
                    }
                    e.target.value = '';
                  }}
                />
              </label>
              <input
                type="url"
                placeholder="Atau URL Gambar Sampul (https://...)"
                value={officialForm.image_url.startsWith('data:') ? '' : officialForm.image_url}
                onChange={(e) => setOfficialForm({ ...officialForm, image_url: e.target.value })}
                className="px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15"
              />
              {officialForm.image_url && (
                <div className="sm:col-span-2 flex items-center gap-3">
                  <img
                    src={officialForm.image_url}
                    alt="Preview Sampul Produk"
                    className="h-14 w-24 rounded-lg object-cover border border-[#3D2C24]/15"
                  />
                  <button
                    type="button"
                    onClick={() => setOfficialForm({ ...officialForm, image_url: '' })}
                    className="text-[11px] font-semibold text-[#E07A5F] cursor-pointer"
                  >
                    Hapus Gambar
                  </button>
                </div>
              )}
            </div>

            <textarea
              rows={2}
              placeholder="Deskripsi produk digital WD.UP Official..."
              value={officialForm.description}
              onChange={(e) => setOfficialForm({ ...officialForm, description: e.target.value })}
              className="w-full p-2.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
            />

            <div className="grid sm:grid-cols-2 gap-2.5">
              <input
                type="url"
                placeholder="Link Code Landing Page Eksternal (Opsional, https://...)"
                value={officialForm.landing_page_url}
                onChange={(e) => setOfficialForm({ ...officialForm, landing_page_url: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
              />
              <input
                type="text"
                placeholder="Pesan / Catatan Akses setelah Paid (Opsional)"
                value={officialForm.delivery_content}
                onChange={(e) => setOfficialForm({ ...officialForm, delivery_content: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
              />
            </div>

            {/* Product Access Delivery */}
            <div className="p-3 rounded-2xl bg-[#FAF6F0] border border-[#3D2C24]/10 space-y-2">
              <p className="font-semibold text-[#3D2C24]">Akses Produk yang Didapat Pembeli:</p>
              <div className="grid sm:grid-cols-3 gap-2">
                <select
                  value={officialForm.access_type}
                  onChange={(e) =>
                    setOfficialForm({ ...officialForm, access_type: e.target.value as ProductAccessType })
                  }
                  className="px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15"
                >
                  <option value="link">Link URL (Notion/Canva/Drive)</option>
                  <option value="pdf">File Dokumen PDF</option>
                  <option value="image">File Gambar HD</option>
                  <option value="video">File Video</option>
                </select>
                <input
                  type="url"
                  placeholder="Link URL Akses Produk (https://...)"
                  value={officialForm.access_url}
                  onChange={(e) => setOfficialForm({ ...officialForm, access_url: e.target.value })}
                  className="px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15"
                />
                <label className="px-3 py-2 rounded-xl bg-white border border-dashed border-[#3D2C24]/25 font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[#F2EAE0]">
                  <FileText className="w-3.5 h-3.5 text-[#527362]" />
                  <span>
                    {officialForm.access_file_name
                      ? officialForm.access_file_name.slice(0, 22)
                      : 'Upload File Akses (maks 6 MB)'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,image/*,video/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 6 * 1024 * 1024) {
                        toast('Ukuran file akses maksimal 6 MB.', 'coral');
                        e.target.value = '';
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === 'string') {
                          setOfficialForm((prev) => ({
                            ...prev,
                            access_file_data: reader.result as string,
                            access_file_name: file.name,
                          }));
                          toast(`File "${file.name}" siap dilampirkan.`, 'sage');
                        }
                      };
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={officialForm.is_featured}
                    onChange={(e) => setOfficialForm({ ...officialForm, is_featured: e.target.checked })}
                  />
                  <span>Tampilkan di Unggulan</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={officialForm.is_recommended}
                    onChange={(e) => setOfficialForm({ ...officialForm, is_recommended: e.target.checked })}
                  />
                  <span>Tampilkan di Rekomendasi</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={officialForm.affiliate_enabled}
                    onChange={(e) => setOfficialForm({ ...officialForm, affiliate_enabled: e.target.checked })}
                  />
                  <span>Boleh Diafiliasi Member (%)</span>
                </label>
                {officialForm.affiliate_enabled && (
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={officialForm.affiliate_commission_pct}
                    onChange={(e) =>
                      setOfficialForm({ ...officialForm, affiliate_commission_pct: Number(e.target.value) })
                    }
                    className="w-16 px-2 py-1 rounded-lg bg-[#FAF6F0] border border-[#3D2C24]/15 font-mono"
                    aria-label="Persen komisi affiliate"
                  />
                )}
              </div>

              <button
                type="submit"
                disabled={savingOfficial}
                className="px-5 py-2.5 rounded-xl bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] font-semibold cursor-pointer disabled:opacity-60"
              >
                {savingOfficial
                  ? 'Menyimpan...'
                  : editingOfficialId
                  ? 'Simpan Perubahan Produk WD.UP'
                  : '+ Terbitkan Produk WD.UP'}
              </button>
            </div>
          </form>

          {/* List of Official WD.UP Products */}
          <div className="bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[#3D2C24]">
              Daftar Produk Resmi WD.UP Official ({officialProducts.length})
            </h3>
            {officialProducts.length === 0 ? (
              <p className="text-xs text-[#6E5A50]">
                Belum ada produk yang diterbitkan langsung oleh Admin atas nama WD.UP Official.
              </p>
            ) : (
              <div className="space-y-2">
                {officialProducts.map((op) => {
                  const isConfirmDelete = confirmDeleteOfficialId === op.id;
                  return (
                    <div
                      key={op.id}
                      className="p-3 rounded-2xl bg-[#FAF6F0] flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {op.image_url ? (
                          <SafeImage
                            src={op.image_url}
                            alt={op.title}
                            className="w-12 h-12 rounded-xl object-cover border border-[#3D2C24]/10 shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-white border border-[#3D2C24]/10 flex items-center justify-center shrink-0">
                            <ShoppingBag className="w-4 h-4 text-[#6E5A50]/60" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-[#3D2C24] truncate">{op.title}</p>
                          <p className="text-[#6E5A50]">
                            {op.category} · {formatRupiah(op.price)}
                            {op.original_price ? ` (Normal ${formatRupiah(op.original_price)})` : ''} ·{' '}
                            {op.sales_count} terjual
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const hasPromo = Boolean(op.original_price && op.original_price > op.price);
                            setEditingOfficialId(op.id);
                            setEditingOfficialHasFile(Boolean(op.has_access_file));
                            setConfirmDeleteOfficialId(null);
                            setOfficialForm({
                              title: op.title,
                              category: MARKET_CATEGORIES.includes(op.category as (typeof MARKET_CATEGORIES)[number])
                                ? op.category
                                : (MARKET_CATEGORIES[1] as string),
                              home_pillar: op.home_pillar || (HOME_PILLARS[3] as string),
                              base_price: hasPromo ? Number(op.original_price) : op.price,
                              has_promo: hasPromo,
                              promo_price: hasPromo ? op.price : Math.max(1000, Math.round(op.price * 0.8)),
                              quota_limit:
                                op.quota_limit !== null && op.quota_limit !== undefined ? String(op.quota_limit) : '',
                              cover_shape: (PRODUCT_COVER_SHAPES.some((s) => s.id === op.cover_shape)
                                ? op.cover_shape
                                : 'landscape') as ProductCoverShape,
                              cta_label: op.cta_label || 'Beli Sekarang',
                              image_url: op.image_url || '',
                              description: op.description || '',
                              landing_page_url: op.landing_page_url || '',
                              custom_landing_html: op.custom_landing_html || '',
                              delivery_content: op.delivery_content || '',
                              access_type: (op.access_type as ProductAccessType) || 'link',
                              access_url: op.access_url || '',
                              access_file_data: '',
                              access_file_name: op.access_file_name || '',
                              is_featured: Boolean(op.is_featured),
                              is_recommended: Boolean(op.is_recommended),
                              affiliate_enabled: Boolean(op.affiliate_enabled),
                              affiliate_commission_pct: op.affiliate_commission_pct ?? 15,
                            });
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white border border-[#3D2C24]/15 font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                        {isConfirmDelete ? (
                          <>
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/admin/official-products/${op.id}`, { method: 'DELETE' });
                                setConfirmDeleteOfficialId(null);
                                toast('Produk resmi WD.UP dihapus.', 'brown');
                                notifyCatalogUpdated();
                                loadAll();
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#E07A5F] text-white font-semibold cursor-pointer"
                            >
                              Yakin Hapus
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteOfficialId(null)}
                              className="px-2.5 py-1 rounded-lg bg-white border border-[#3D2C24]/15 font-semibold cursor-pointer"
                            >
                              Batal
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteOfficialId(op.id)}
                            className="px-2.5 py-1 rounded-lg text-[#E07A5F] font-semibold cursor-pointer"
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[#3D2C24]">Kelola Toko Unggulan ({stores.length})</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {stores.map((s) => (
                <div key={s.id} className="p-3 rounded-2xl bg-[#FAF6F0] flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold text-[#3D2C24]">{s.name}</p>
                    <p className="text-[#6E5A50]">@{s.username} · {s.visitors_count} kunjungan</p>
                  </div>
                  <button
                    onClick={async () => {
                      await apiFetch(`/api/admin/stores/${s.id}/featured`, {
                        method: 'PUT',
                        body: JSON.stringify({ is_featured: s.is_featured ? 0 : 1 }),
                      });
                      notifyCatalogUpdated();
                      loadAll();
                    }}
                    className={`px-3 py-1.5 rounded-xl font-semibold cursor-pointer ${
                      s.is_featured ? 'bg-[#6B8E7B] text-white' : 'bg-white border border-[#3D2C24]/15'
                    }`}
                  >
                    {s.is_featured ? 'Toko Unggulan' : 'Jadikan Unggulan'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[#3D2C24]">Kelola Semua Produk Market ({products.length})</h3>
            <div className="space-y-2">
              {products.map((p) => {
                const isHiddenSeller = Number(p.hidden_by_seller || 0) === 1;
                const isHiddenAdmin = Number(p.hidden_by_admin || 0) === 1;
                const priceInfo = getProductPriceSummary(p);
                return (
                  <div
                    key={p.id}
                    className={`p-3 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs ${
                      isHiddenAdmin || isHiddenSeller
                        ? 'bg-[#FFF5F2] border border-[#E07A5F]/35'
                        : 'bg-[#FAF6F0]'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-semibold text-[#3D2C24]">{p.title}</p>
                        {isHiddenSeller && (
                          <span className="px-1.5 py-0.5 rounded bg-[#FDF8EC] border border-[#F3C669] text-[9px] font-bold text-[#8A6112]">
                            Disembunyikan Seller
                          </span>
                        )}
                        {isHiddenAdmin && (
                          <span className="px-1.5 py-0.5 rounded bg-[#FDECEC] border border-[#E07A5F]/40 text-[9px] font-bold text-[#9A3412]">
                            Disembunyikan WD.UP
                          </span>
                        )}
                      </div>
                      <p className="text-[#6E5A50]">
                        {p.store_name} · {priceInfo.primary} · {p.sales_count} terjual
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/products/${p.id}/flags`, {
                            method: 'PUT',
                            body: JSON.stringify({
                              is_featured: p.is_featured ? 0 : 1,
                              is_recommended: p.is_recommended,
                              status: p.status,
                              hidden_by_admin: p.hidden_by_admin ? 1 : 0,
                            }),
                          });
                          notifyCatalogUpdated();
                          loadAll();
                        }}
                        className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                          p.is_featured ? 'bg-[#3D2C24] text-white' : 'bg-white border border-[#3D2C24]/15'
                        }`}
                      >
                        Unggulan
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/products/${p.id}/flags`, {
                            method: 'PUT',
                            body: JSON.stringify({
                              is_featured: p.is_featured,
                              is_recommended: p.is_recommended ? 0 : 1,
                              status: p.status,
                              hidden_by_admin: p.hidden_by_admin ? 1 : 0,
                            }),
                          });
                          notifyCatalogUpdated();
                          loadAll();
                        }}
                        className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                          p.is_recommended ? 'bg-[#6B8E7B] text-white' : 'bg-white border border-[#3D2C24]/15'
                        }`}
                      >
                        Rekomendasi
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/products/${p.id}/flags`, {
                            method: 'PUT',
                            body: JSON.stringify({
                              is_featured: p.is_featured,
                              is_recommended: p.is_recommended,
                              status: p.status,
                              hidden_by_admin: isHiddenAdmin ? 0 : 1,
                            }),
                          });
                          toast(
                            isHiddenAdmin
                              ? 'Produk ditampilkan kembali oleh WD.UP.'
                              : 'Produk disembunyikan oleh WD.UP dari katalog publik.',
                            isHiddenAdmin ? 'sage' : 'brown'
                          );
                          notifyCatalogUpdated();
                          loadAll();
                        }}
                        className={`px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1 cursor-pointer ${
                          isHiddenAdmin
                            ? 'bg-[#E07A5F] text-white'
                            : 'bg-white border border-[#3D2C24]/15 text-[#3D2C24]'
                        }`}
                      >
                        {isHiddenAdmin ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        <span>{isHiddenAdmin ? 'Tampilkan' : 'Sembunyikan (WD.UP)'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB: USERS, MENTOR ACC, ACCESS CODES & PRO MEMBERSHIP (ADMIN ONLY — B1) */}
      {isAdmin && tab === 'users' && (
        <div className="space-y-5">
          {/* Access Code Manager */}
          <div className="bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-4 text-xs">
            <div className="flex items-start gap-2.5">
              <KeyRound className="w-4 h-4 text-[#E07A5F] mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-[#3D2C24]">
                  Pengaturan Kode Akses Login & Daftar (Mentor & Admin)
                </h3>
                <p className="text-[11px] text-[#6E5A50]">
                  Atur kode akses khusus yang wajib dimasukkan saat memilih peran <strong>Mentor</strong> atau <strong>Admin</strong> pada halaman Masuk / Daftar. Demi keamanan, kode tersimpan di-hash dan tidak ditampilkan kembali.
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#3D2C24]/10 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#3D2C24]">Kode Akses Mentor</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      accessCodes.hasMentorCode
                        ? 'bg-[#EFF5F1] text-[#527362]'
                        : 'bg-white text-[#6E5A50] border border-[#3D2C24]/15'
                    }`}
                  >
                    {accessCodes.hasMentorCode ? 'Aktif Terpasang' : 'Belum Diatur'}
                  </span>
                </div>
                <input
                  type="password"
                  placeholder="Masukkan kode Mentor baru (min. 4 karakter)"
                  value={mentorCodeInput}
                  onChange={(e) => setMentorCodeInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={savingCodes || mentorCodeInput.trim().length < 4}
                    onClick={() => handleSaveAccessCode('mentor', mentorCodeInput.trim())}
                    className="flex-1 py-2 rounded-xl bg-[#3D2C24] text-[#FAF6F0] font-semibold cursor-pointer disabled:opacity-45"
                  >
                    Simpan Kode Mentor
                  </button>
                  <button
                    type="button"
                    disabled={savingCodes}
                    onClick={() => handleSaveAccessCode('mentor', '')}
                    className="px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15 font-semibold text-[#E07A5F] cursor-pointer"
                  >
                    Hapus
                  </button>
                </div>
                {accessCodes.envMentorCodeActive && (
                  <p className="text-[10px] text-[#6E5A50]">
                    *Catatan: Variabel environment MENTOR_PASSCODE juga aktif di server.
                  </p>
                )}
              </div>

              <div className="p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#3D2C24]/10 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#3D2C24]">Kode Akses Admin</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      accessCodes.hasAdminCode
                        ? 'bg-[#EFF5F1] text-[#527362]'
                        : 'bg-white text-[#6E5A50] border border-[#3D2C24]/15'
                    }`}
                  >
                    {accessCodes.hasAdminCode ? 'Aktif Terpasang' : 'Belum Diatur'}
                  </span>
                </div>
                <input
                  type="password"
                  placeholder="Masukkan kode Admin baru (min. 4 karakter)"
                  value={adminCodeInput}
                  onChange={(e) => setAdminCodeInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={savingCodes || adminCodeInput.trim().length < 4}
                    onClick={() => handleSaveAccessCode('admin', adminCodeInput.trim())}
                    className="flex-1 py-2 rounded-xl bg-[#3D2C24] text-[#FAF6F0] font-semibold cursor-pointer disabled:opacity-45"
                  >
                    Simpan Kode Admin
                  </button>
                  <button
                    type="button"
                    disabled={savingCodes}
                    onClick={() => handleSaveAccessCode('admin', '')}
                    className="px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15 font-semibold text-[#E07A5F] cursor-pointer"
                  >
                    Hapus
                  </button>
                </div>
                {accessCodes.envAdminCodeActive && (
                  <p className="text-[10px] text-[#6E5A50]">
                    *Catatan: Variabel environment ADMIN_PASSCODE juga aktif di server.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Pending Mentor Approvals Alert */}
          {pendingMentors.length > 0 && (
            <div className="bg-[#FDF8EC] rounded-3xl border border-[#F3C669] p-5 space-y-3 text-xs">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-[#E07A5F]" />
                <h3 className="text-sm font-semibold text-[#3D2C24]">
                  Pengajuan Akun Mentor Menunggu ACC Admin ({pendingMentors.length})
                </h3>
              </div>
              <div className="space-y-2">
                {pendingMentors.map((pm) => (
                  <div
                    key={pm.id}
                    className="p-3 rounded-2xl bg-white border border-[#3D2C24]/10 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <p className="font-semibold text-[#3D2C24]">{pm.name}</p>
                      <p className="text-[#6E5A50]">
                        {pm.email} · {pm.whatsapp || 'WA belum diisi'} · Daftar {formatDateTimeId(pm.created_at)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleMentorStatusChange(pm.id, 'approved')}
                        className="px-3.5 py-1.5 rounded-xl bg-[#6B8E7B] hover:bg-[#527362] text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>ACC Mentor</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMentorStatusChange(pm.id, 'rejected')}
                        className="px-3.5 py-1.5 rounded-xl bg-[#E07A5F] text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Tolak</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main Users Table */}
          <div className="bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[#3D2C24]">
              Kelola Pengguna, Role, Status Mentor & Pro ({usersList.length})
            </h3>
            <div className="divide-y divide-[#3D2C24]/10">
              {usersList.map((u) => {
                const userIsPro = Boolean(
                  u.pro_expires_at && !Number.isNaN(Date.parse(u.pro_expires_at)) && Date.parse(u.pro_expires_at) > Date.now()
                );
                return (
                  <div key={u.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-semibold text-[#3D2C24]">{u.name}</p>
                        {userIsPro && (
                          <span className="px-1.5 py-0.5 rounded bg-[#3D2C24] text-[#F3C669] text-[10px] font-bold inline-flex items-center gap-0.5">
                            <Crown className="w-2.5 h-2.5" />
                            <span>PRO</span>
                          </span>
                        )}
                        {u.role === 'mentor' && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              u.mentor_status === 'approved'
                                ? 'bg-[#EFF5F1] text-[#527362]'
                                : u.mentor_status === 'pending'
                                ? 'bg-[#F3C669]/35 text-[#3D2C24]'
                                : 'bg-[#FFF5F2] text-[#E07A5F]'
                            }`}
                          >
                            {u.mentor_status === 'approved'
                              ? 'Mentor (ACC)'
                              : u.mentor_status === 'pending'
                              ? 'Mentor (Pending ACC)'
                              : 'Mentor (Ditolak)'}
                          </span>
                        )}
                      </div>
                      <p className="text-[#6E5A50]">
                        {u.email} · {u.whatsapp || 'WA belum diisi'} · Saldo: {formatRupiah(u.wallet_available)}
                        {userIsPro && u.pro_expires_at ? ` · Pro s.d. ${formatDateTimeId(u.pro_expires_at)}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {u.role === 'mentor' && u.mentor_status !== 'approved' && (
                        <button
                          type="button"
                          onClick={() => handleMentorStatusChange(u.id, 'approved')}
                          className="px-2.5 py-1.5 rounded-xl bg-[#6B8E7B] text-white font-semibold cursor-pointer"
                        >
                          ACC Mentor
                        </button>
                      )}
                      {u.role === 'mentor' && u.mentor_status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => handleMentorStatusChange(u.id, 'rejected')}
                          className="px-2.5 py-1.5 rounded-xl bg-[#E07A5F] text-white font-semibold cursor-pointer"
                        >
                          Tolak
                        </button>
                      )}
                      <select
                        value={userIsPro ? u.pro_plan || 'pro_1m' : 'none'}
                        onChange={(e) => handleProChange(u.id, e.target.value)}
                        aria-label={`Status Pro ${u.name}`}
                        className="px-2.5 py-1.5 rounded-xl bg-[#FDF8EC] border border-[#F3C669]/60 font-semibold text-[#3D2C24]"
                      >
                        <option value="none">Non-Pro</option>
                        <option value="pro_1m">WD.UP Pro 1 Bulan</option>
                        <option value="pro_3m">WD.UP Pro 3 Bulan</option>
                        <option value="pro_6m">WD.UP Pro 6 Bulan</option>
                      </select>
                      <select
                        value={u.role}
                        disabled={u.id === user?.id}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        className="px-3 py-1.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 font-semibold"
                      >
                        <option value="member">Member (Buyer / Seller / Affiliate)</option>
                        <option value="mentor">Mentor (ACC & Kelola Academy)</option>
                        <option value="editor">Editor (Konten Home & Academy)</option>
                        <option value="admin">Admin (Penuh)</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB: NOTIFICATIONS & INTEGRATIONS (ADMIN ONLY) */}
      {isAdmin && tab === 'notifications' && (
        <div className="space-y-5">
          <div className="bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-[#3D2C24]">Integrasi Email (notif@wdup.com) & WhatsApp</h3>
            <p className="text-xs text-[#6E5A50]">
              Setiap checkout, pengiriman bukti bayar, dan verifikasi pembayaran mencatat notifikasi otomatis ke pembeli (Email & WhatsApp yang diberikan) serta seluruh Admin.
            </p>
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifSettings.email_provider_active === '1'}
                  onChange={async (e) => {
                    await apiFetch('/api/admin/notifications/settings', {
                      method: 'PUT',
                      body: JSON.stringify({
                        email_provider_active: e.target.checked,
                        whatsapp_provider_active: notifSettings.whatsapp_provider_active === '1',
                      }),
                    });
                    loadAll();
                  }}
                />
                <span>Provider Email Eksternal Aktif (notif@wdup.com)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifSettings.whatsapp_provider_active === '1'}
                  onChange={async (e) => {
                    await apiFetch('/api/admin/notifications/settings', {
                      method: 'PUT',
                      body: JSON.stringify({
                        email_provider_active: notifSettings.email_provider_active === '1',
                        whatsapp_provider_active: e.target.checked,
                      }),
                    });
                    loadAll();
                  }}
                />
                <span>Provider WhatsApp Gateway Aktif</span>
              </label>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiFetch('/api/admin/announcements', { method: 'POST', body: JSON.stringify(announcement) });
                setAnnouncement({ title: '', message: '' });
                toast('Pengumuman diterbitkan ke notifikasi seluruh member.', 'sage');
                notifyNotificationsUpdated();
                loadAll();
              }}
              className="grid sm:grid-cols-3 gap-2 pt-3 border-t border-[#3D2C24]/10"
            >
              <input
                type="text"
                required
                placeholder="Judul Pengumuman"
                value={announcement.title}
                onChange={(e) => setAnnouncement({ ...announcement, title: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              />
              <input
                type="text"
                required
                placeholder="Isi pengumuman untuk member"
                value={announcement.message}
                onChange={(e) => setAnnouncement({ ...announcement, message: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              />
              <button type="submit" className="px-4 py-2 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold cursor-pointer">
                Kirim Pengumuman
              </button>
            </form>
          </div>

          <div className="bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-2">
            <h4 className="text-sm font-semibold text-[#3D2C24]">Log Notifikasi Sistem ({notifLogs.length})</h4>
            <div className="max-h-72 overflow-y-auto divide-y divide-[#3D2C24]/10 text-xs">
              {notifLogs.map((nl) => (
                <div key={nl.id} className="py-2 flex justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#3D2C24]">
                      [{nl.event_type}] {nl.title}
                    </p>
                    <p className="text-[#6E5A50]">{nl.message}</p>
                    <p className="text-[10px] text-[#6E5A50] font-mono">
                      From: {nl.sender_email} · Email: {nl.email_status} · WA: {nl.whatsapp_status}
                    </p>
                  </div>
                  <span className="text-[10px] text-[#6E5A50] shrink-0">{formatDateTimeId(nl.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: WD.UP AI KNOWLEDGE BASE (ADMIN ONLY) */}
      {isAdmin && tab === 'ai_kb' && (
        <div className="bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[#3D2C24]">Knowledge Base Resmi WD.UP AI</h3>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await apiFetch('/api/admin/knowledge-base', { method: 'POST', body: JSON.stringify(newKb) });
              setNewKb({ topic: '', title: '', content: '' });
              toast('Knowledge base WD.UP AI diperbarui.', 'sage');
              loadAll();
            }}
            className="space-y-2"
          >
            <div className="grid sm:grid-cols-2 gap-2">
              <input
                type="text"
                required
                placeholder="Topik (mis. Kebijakan Refund)"
                value={newKb.topic}
                onChange={(e) => setNewKb({ ...newKb, topic: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              />
              <input
                type="text"
                required
                placeholder="Judul Panduan"
                value={newKb.title}
                onChange={(e) => setNewKb({ ...newKb, title: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              />
            </div>
            <textarea
              rows={3}
              required
              placeholder="Isi panduan resmi yang boleh dikutip WD.UP AI..."
              value={newKb.content}
              onChange={(e) => setNewKb({ ...newKb, content: e.target.value })}
              className="w-full p-3 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
            />
            <button type="submit" className="px-4 py-2 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold cursor-pointer">
              + Tambah Knowledge Base
            </button>
          </form>

          <div className="space-y-2.5">
            {kbEntries.map((kb) => (
              <div key={kb.id} className="p-3.5 rounded-2xl bg-[#FAF6F0] flex justify-between gap-3 text-xs">
                <div>
                  <p className="font-semibold text-[#527362]">{kb.topic}</p>
                  <p className="font-semibold text-[#3D2C24]">{kb.title}</p>
                  <p className="text-[#6E5A50] mt-1 leading-relaxed">{kb.content}</p>
                </div>
                <button
                  onClick={async () => {
                    await apiFetch(`/api/admin/knowledge-base/${kb.id}`, { method: 'DELETE' });
                    loadAll();
                  }}
                  className="text-[#E07A5F] font-semibold shrink-0 cursor-pointer"
                >
                  Hapus
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PAYMENT PROOF LIGHTBOX ZOOM */}
      {zoomProofUrl && (
        <div
          onClick={() => setZoomProofUrl(null)}
          className="fixed inset-0 z-50 bg-[#3D2C24]/80 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-3xl w-full bg-white rounded-3xl p-4 shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[#3D2C24]">Pratinjau Bukti Transfer Pembeli</p>
              <button
                type="button"
                onClick={() => setZoomProofUrl(null)}
                aria-label="Tutup pratinjau bukti"
                className="w-8 h-8 rounded-full bg-[#FAF6F0] hover:bg-[#F2EAE0] flex items-center justify-center text-[#3D2C24] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="rounded-2xl bg-[#FAF6F0] p-2 flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={zoomProofUrl}
                alt="Bukti Pembayaran Diperbesar"
                className="max-h-[70vh] w-auto object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
