import React, { useEffect, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  CreditCard,
  Crown,
  Mail,
  MessageCircle,
  Minus,
  Plus,
  ShoppingBag,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { apiFetch, formatRupiah } from '../lib/api';
import { compressImageFile } from '../lib/imageUtils';
import { useAuth } from '../context/AuthContext';
import type { CheckoutNotificationSummary, Order, PaymentMethod } from '../types/wdup';
import { SafeImage } from './SafeImage';

interface AppliedVoucher {
  code: string;
  title: string;
  scope: string;
  discountAmount: number;
}

export function CartCheckoutDrawer() {
  const {
    user,
    cart,
    cartOpen,
    setCartOpen,
    updateCartQty,
    removeFromCart,
    clearCart,
    setAuthModalOpen,
    setActiveTab,
    setAccountSubView,
    refreshAuth,
    notifyNotificationsUpdated,
    toast,
  } = useAuth();

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [selectedMethodId, setSelectedMethodId] = useState('');
  const [buyerEmail, setBuyerEmail] = useState(user?.email || '');
  const [buyerWhatsapp, setBuyerWhatsapp] = useState(user?.whatsapp || '');
  const [notes, setNotes] = useState('');
  const [voucherInput, setVoucherInput] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState<AppliedVoucher | null>(null);
  const [checkingVoucher, setCheckingVoucher] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  // Post-checkout payment proof & notification state
  const [createdOrder, setCreatedOrder] = useState<{
    order: Order;
    paymentMethod: PaymentMethod;
    notificationSummary?: CheckoutNotificationSummary;
  } | null>(null);
  const [senderName, setSenderName] = useState('');
  const [transferRef, setTransferRef] = useState('');
  const [proofNote, setProofNote] = useState('');
  const [proofImageData, setProofImageData] = useState('');
  const [submittingProof, setSubmittingProof] = useState(false);
  const [proofSubmitted, setProofSubmitted] = useState(false);

  useEffect(() => {
    if (user?.whatsapp && !buyerWhatsapp) {
      setBuyerWhatsapp(user.whatsapp);
    }
    if (user?.email && !buyerEmail) {
      setBuyerEmail(user.email);
    }
  }, [user?.whatsapp, user?.email]);

  useEffect(() => {
    if (cartOpen) {
      apiFetch<{ methods: PaymentMethod[] }>('/api/payment-methods')
        .then((res) => {
          setMethods(res.methods || []);
          if (res.methods?.length > 0 && !res.methods.some((m) => m.id === selectedMethodId)) {
            setSelectedMethodId(res.methods[0].id);
          }
        })
        .catch(() => {});
    }
  }, [cartOpen, selectedMethodId]);

  // Reset applied voucher when cart composition changes
  useEffect(() => {
    setAppliedVoucher(null);
  }, [cart]);

  // Ensure adding new items to cart resets an old post-checkout screen so users can buy again smoothly
  useEffect(() => {
    if (cart.length > 0 && createdOrder) {
      setCreatedOrder(null);
      setProofSubmitted(false);
    }
  }, [cart.length]);

  if (!cartOpen) return null;

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountAmount = appliedVoucher ? Math.min(subtotal, appliedVoucher.discountAmount) : 0;
  const finalTotal = Math.max(0, subtotal - discountAmount);

  const handleApplyVoucher = async () => {
    const code = voucherInput.trim().toUpperCase();
    if (!code) {
      toast('Masukkan kode voucher terlebih dahulu.', 'coral');
      return;
    }
    setCheckingVoucher(true);
    try {
      const res = await apiFetch<{
        valid: boolean;
        voucher: { code: string; title: string; scope: string };
        discountAmount: number;
      }>('/api/vouchers/validate', {
        method: 'POST',
        body: JSON.stringify({
          code,
          items: cart.map((c) => ({ item_type: c.item_type, item_id: c.item_id, quantity: c.quantity })),
        }),
      });
      setAppliedVoucher({
        code: res.voucher.code,
        title: res.voucher.title,
        scope: res.voucher.scope,
        discountAmount: res.discountAmount,
      });
      toast(`Voucher ${res.voucher.code} diterapkan (-${formatRupiah(res.discountAmount)})!`, 'sage');
    } catch (err) {
      setAppliedVoucher(null);
      toast(err instanceof Error ? err.message : 'Voucher tidak valid.', 'coral');
    } finally {
      setCheckingVoucher(false);
    }
  };

  const handleCheckout = async () => {
    if (!user) {
      setAuthModalOpen(true);
      toast('Silakan masuk atau daftar terlebih dahulu untuk melanjutkan pembelian.', 'coral');
      return;
    }
    const cleanEmail = buyerEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      toast('Masukkan alamat email pembeli yang valid untuk menerima notifikasi transaksi.', 'coral');
      return;
    }
    const methodId = selectedMethodId || methods[0]?.id;
    if (!methodId) {
      toast('Metode pembayaran belum tersedia. Coba muat ulang.', 'coral');
      return;
    }

    setCheckingOut(true);
    try {
      const res = await apiFetch<{
        order: Order;
        paymentMethod: PaymentMethod;
        notificationSummary?: CheckoutNotificationSummary;
      }>('/api/orders/checkout', {
        method: 'POST',
        body: JSON.stringify({
          items: cart.map((c) => ({
            item_type: c.item_type,
            item_id: c.item_id,
            quantity: c.quantity,
            affiliate_username: c.affiliate_username,
          })),
          payment_method_id: methodId,
          buyer_email: cleanEmail,
          buyer_whatsapp: buyerWhatsapp.trim(),
          voucher_code: appliedVoucher?.code || '',
          notes,
        }),
      });
      setCreatedOrder(res);
      setProofSubmitted(false);
      setAppliedVoucher(null);
      setVoucherInput('');
      clearCart();
      refreshAuth().catch(() => {});
      notifyNotificationsUpdated();
      toast(`Pesanan ${res.order.order_code} dibuat! Notifikasi otomatis dikirim ke Email/WA pembeli & Admin.`, 'sage');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Checkout gagal.', 'coral');
    } finally {
      setCheckingOut(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, {
        maxWidth: 1400,
        maxHeight: 1400,
        quality: 0.85,
        maxDataUrlLength: 1_500_000,
      });
      setProofImageData(compressed);
      toast('Screenshot bukti bayar siap dikirim.', 'sage');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memproses gambar bukti pembayaran.', 'coral');
    }
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createdOrder) return;
    if (!senderName.trim() && !proofImageData) {
      toast('Isi nama pengirim atau unggah gambar bukti pembayaran.', 'coral');
      return;
    }
    setSubmittingProof(true);
    try {
      await apiFetch(`/api/orders/${createdOrder.order.id}/payment-proof`, {
        method: 'POST',
        body: JSON.stringify({
          sender_name: senderName.trim() || user?.name || 'Pembeli',
          transfer_reference: transferRef,
          proof_note: proofNote,
          proof_image_data: proofImageData,
        }),
      });
      setProofSubmitted(true);
      notifyNotificationsUpdated();
      toast('Bukti pembayaran berhasil diposting! Notifikasi otomatis dikirim ke pembeli & Admin.', 'sage');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal mengirim bukti bayar.', 'coral');
    } finally {
      setSubmittingProof(false);
    }
  };

  const handleClose = () => {
    setCartOpen(false);
    if (proofSubmitted) {
      setCreatedOrder(null);
      setProofSubmitted(false);
      setSenderName('');
      setTransferRef('');
      setProofNote('');
      setProofImageData('');
    }
  };

  const notif = createdOrder?.notificationSummary;
  const waTargetDigits = (notif?.buyerWhatsapp || buyerWhatsapp || '').replace(/[^0-9]/g, '');
  const waFormatted = waTargetDigits.startsWith('0')
    ? `62${waTargetDigits.slice(1)}`
    : waTargetDigits;
  const waHref = notif
    ? `https://wa.me/${waFormatted}?text=${encodeURIComponent(notif.whatsappShareText)}`
    : '#';
  const mailtoHref = notif
    ? `mailto:${encodeURIComponent(notif.buyerEmail)}?subject=${encodeURIComponent(
        notif.reminderTitle
      )}&body=${encodeURIComponent(notif.whatsappShareText)}`
    : '#';

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-[#3D2C24]/45 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#FAF6F0] h-full flex flex-col shadow-2xl border-l border-[#3D2C24]/15">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#3D2C24]/10 bg-[#F2EAE0]/60">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-[#527362]" />
            <h2 className="font-display text-base font-semibold text-[#3D2C24]">
              {createdOrder ? 'Pembayaran & Pengingat Bukti' : 'Keranjang Belanja'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="min-h-[36px] min-w-[36px] rounded-full hover:bg-[#3D2C24]/10 flex items-center justify-center cursor-pointer"
            aria-label="Tutup keranjang"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {createdOrder ? (
            <div className="space-y-3.5">
              {/* Post-Purchase Email, Admin & WhatsApp Notification Banner */}
              {!proofSubmitted && (
                <div className="p-3.5 rounded-2xl bg-[#F3C669]/25 border border-[#F3C669]/60 space-y-2">
                  <div className="flex items-start gap-2 text-xs font-semibold text-[#3D2C24]">
                    <Bell className="w-4 h-4 text-[#E07A5F] shrink-0 mt-0.5" />
                    <span>Notifikasi Pembeli & Admin Terdaftar Terkirim</span>
                  </div>
                  <p className="text-[11px] text-[#3D2C24]/85 leading-relaxed">
                    Pengingat pesanan <span className="font-mono font-semibold">{createdOrder.order.order_code}</span>{' '}
                    dicatat ke email pembeli <strong>{notif?.buyerEmail || buyerEmail || user?.email}</strong>
                    {notif?.adminNotifiedCount ? (
                      <>
                        {' '}
                        dan <strong>{notif.adminNotifiedCount} Admin terdaftar</strong>
                      </>
                    ) : null}
                    {(notif?.buyerWhatsapp || buyerWhatsapp) ? (
                      <>
                        {' '}
                        serta WhatsApp <strong>{notif?.buyerWhatsapp || buyerWhatsapp}</strong>
                      </>
                    ) : null}
                    . Transfer lalu segera unggah bukti bayar di bawah ini.
                  </p>
                  {notif && (
                    <div className="flex flex-wrap gap-2 pt-0.5">
                      <a
                        href={waHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-[#6B8E7B] hover:bg-[#527362] text-white text-[11px] font-semibold inline-flex items-center gap-1"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Kirim ke WhatsApp</span>
                      </a>
                      <a
                        href={mailtoHref}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-[#3D2C24]/15 text-[#3D2C24] text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-[#FAF6F0]"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Buka Email</span>
                      </a>
                    </div>
                  )}
                </div>
              )}

              {proofSubmitted ? (
                <div className="p-4 rounded-2xl bg-[#6B8E7B]/15 border border-[#6B8E7B]/35 space-y-2.5">
                  <div className="flex items-center gap-2 text-[#527362] font-semibold text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Bukti Pembayaran Diterima (Waiting Verification)</span>
                  </div>
                  <p className="text-xs text-[#3D2C24]/85 leading-relaxed">
                    Order <span className="font-mono font-semibold">{createdOrder.order.order_code}</span> telah
                    dilaporkan ke Admin terdaftar & email pembeli <strong>{notif?.buyerEmail || buyerEmail}</strong>.
                    Setelah verifikasi Paid, akses kelas, produk digital, atau keanggotaan Pro otomatis aktif.
                  </p>
                  <button
                    onClick={() => {
                      handleClose();
                      setActiveTab('account');
                      setAccountSubView('activity');
                    }}
                    className="w-full py-2.5 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold cursor-pointer"
                  >
                    Pantau Status & Akses di My Activity
                  </button>
                </div>
              ) : (
                <>
                  <div className="p-3.5 rounded-2xl bg-white border border-[#3D2C24]/12 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-[#6E5A50]">
                      <span>Order ID Unik</span>
                      <span className="font-mono font-semibold text-[#3D2C24]">{createdOrder.order.order_code}</span>
                    </div>
                    {createdOrder.order.voucher_code && (
                      <div className="flex items-center justify-between text-xs text-[#527362]">
                        <span>Voucher ({createdOrder.order.voucher_code})</span>
                        <span className="font-mono font-semibold">
                          -{formatRupiah(createdOrder.order.discount_amount || 0)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs text-[#6E5A50]">
                      <span>Status Saat Ini</span>
                      <span className="font-semibold text-[#E07A5F]">Pending Payment</span>
                    </div>
                    <div className="pt-1.5 border-t border-[#3D2C24]/10 flex items-center justify-between">
                      <span className="text-xs font-medium text-[#3D2C24]">Total Pembayaran</span>
                      <span className="font-mono tabular-nums text-base font-bold text-[#3D2C24]">
                        {formatRupiah(createdOrder.order.total_amount)}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#F2EAE0] border border-[#3D2C24]/10 space-y-1 text-xs">
                    <p className="font-semibold text-[#3D2C24]">
                      Transfer ke {createdOrder.paymentMethod.provider_name}
                    </p>
                    <p className="font-mono text-sm font-bold text-[#3D2C24]">
                      {createdOrder.paymentMethod.account_number}
                    </p>
                    <p className="text-[#6E5A50]">a.n. {createdOrder.paymentMethod.account_holder}</p>
                    <p className="text-[11px] text-[#3D2C24]/80 pt-1 leading-relaxed">
                      {createdOrder.paymentMethod.instructions}
                    </p>
                  </div>

                  <form onSubmit={handleSubmitProof} className="space-y-2.5 pt-1">
                    <h3 className="text-xs font-semibold text-[#3D2C24]">Posting Bukti Pembayaran</h3>
                    <div>
                      <label className="block text-[11px] font-medium text-[#6E5A50] mb-1">
                        Nama Pemilik Rekening / Pengirim
                      </label>
                      <input
                        type="text"
                        value={senderName}
                        onChange={(e) => setSenderName(e.target.value)}
                        placeholder={`Nama pengirim transfer (mis. ${user?.name || 'Alya'})`}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#6E5A50] mb-1">
                        Nomor Referensi / Jam Transfer
                      </label>
                      <input
                        type="text"
                        value={transferRef}
                        onChange={(e) => setTransferRef(e.target.value)}
                        placeholder="Contoh: REF-221126-0915"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#6E5A50] mb-1">
                        Screenshot Bukti Pembayaran
                      </label>
                      <label className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-[#3D2C24]/25 bg-white cursor-pointer hover:bg-[#F2EAE0]/50 text-xs font-medium text-[#3D2C24]">
                        <Upload className="w-4 h-4 text-[#527362]" />
                        <span>{proofImageData ? 'Ganti gambar bukti transfer' : 'Pilih gambar bukti transfer'}</span>
                        <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                      </label>
                      {proofImageData && (
                        <div className="mt-2 p-2 rounded-xl bg-white border border-[#3D2C24]/12 flex items-center justify-between gap-2">
                          <img
                            src={proofImageData}
                            alt="Preview bukti transfer"
                            className="h-14 w-20 object-cover rounded-lg border border-[#3D2C24]/10"
                          />
                          <span className="text-[11px] text-[#527362] font-semibold flex-1">
                            Gambar siap dikirim ke Admin
                          </span>
                          <button
                            type="button"
                            onClick={() => setProofImageData('')}
                            className="text-[11px] font-semibold text-[#E07A5F] cursor-pointer"
                          >
                            Hapus
                          </button>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#6E5A50] mb-1">Catatan Tambahan</label>
                      <input
                        type="text"
                        value={proofNote}
                        onChange={(e) => setProofNote(e.target.value)}
                        placeholder="Opsional"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15 text-xs"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submittingProof}
                      className="w-full py-2.5 rounded-xl bg-[#6B8E7B] hover:bg-[#527362] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                    >
                      {submittingProof ? 'Mengirim Bukti...' : 'Konfirmasi & Kirim Bukti Pembayaran'}
                    </button>
                  </form>
                </>
              )}
            </div>
          ) : cart.length === 0 ? (
            <div className="py-12 text-center space-y-2.5">
              <ShoppingBag className="w-9 h-9 text-[#6E5A50]/50 mx-auto" />
              <p className="text-sm font-medium text-[#3D2C24]">Keranjang Anda masih kosong</p>
              <p className="text-xs text-[#6E5A50] max-w-xs mx-auto">
                Jelajahi WD.UP Academy atau WD.UP Market untuk menambahkan kelas dan produk digital.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2.5">
                {cart.map((item) => (
                  <div
                    key={`${item.item_type}_${item.item_id}`}
                    className="flex gap-2.5 p-2.5 rounded-xl bg-white border border-[#3D2C24]/10"
                  >
                    {item.item_type === 'pro_plan' ? (
                      <div className="w-14 h-14 rounded-lg bg-[#3D2C24] text-[#F3C669] flex items-center justify-center shrink-0">
                        <Crown className="w-6 h-6" />
                      </div>
                    ) : item.image_url ? (
                      <SafeImage
                        src={item.image_url}
                        alt={item.title}
                        className="w-14 h-14 rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-[#F2EAE0] text-[#3D2C24] flex items-center justify-center font-display font-bold text-base shrink-0">
                        {item.title.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-[#6E5A50] truncate">{item.meta}</p>
                      <h4 className="text-xs font-semibold text-[#3D2C24] line-clamp-1">{item.title}</h4>
                      <p className="font-mono tabular-nums text-xs font-semibold text-[#527362] mt-0.5">
                        {formatRupiah(item.price)}
                      </p>
                      <div className="flex items-center justify-between mt-1.5">
                        {item.item_type === 'product' ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => updateCartQty(item.item_type, item.item_id, item.quantity - 1)}
                              className="w-6 h-6 rounded-md bg-[#F2EAE0] flex items-center justify-center cursor-pointer"
                              aria-label="Kurangi jumlah"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-mono tabular-nums text-xs font-semibold px-1.5">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateCartQty(item.item_type, item.item_id, item.quantity + 1)}
                              className="w-6 h-6 rounded-md bg-[#F2EAE0] flex items-center justify-center cursor-pointer"
                              aria-label="Tambah jumlah"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-[#6E5A50]">Akses 1 akun</span>
                        )}
                        <button
                          onClick={() => removeFromCart(item.item_type, item.item_id)}
                          className="p-1 text-[#E07A5F] hover:bg-[#E07A5F]/10 rounded-lg cursor-pointer"
                          aria-label="Hapus item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Voucher Input Section */}
              <div className="p-3 rounded-xl bg-white border border-[#3D2C24]/12 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#3D2C24]">
                  <Tag className="w-3.5 h-3.5 text-[#E07A5F]" />
                  <span>Gunakan Kode Voucher WD.UP / Toko</span>
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={voucherInput}
                    onChange={(e) => setVoucherInput(e.target.value.toUpperCase())}
                    placeholder="Contoh: WDUPHEMAT"
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs font-mono uppercase"
                  />
                  <button
                    type="button"
                    onClick={handleApplyVoucher}
                    disabled={checkingVoucher}
                    className="px-3 py-1.5 rounded-lg bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {checkingVoucher ? '...' : 'Terapkan'}
                  </button>
                </div>
                {appliedVoucher && (
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#EFF5F1] border border-[#6B8E7B]/35 text-[11px]">
                    <span className="font-semibold text-[#527362]">
                      {appliedVoucher.code} · Hemat {formatRupiah(appliedVoucher.discountAmount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAppliedVoucher(null)}
                      className="text-[#E07A5F] font-semibold cursor-pointer"
                    >
                      Hapus
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-[#3D2C24]/10 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#3D2C24]">
                  <CreditCard className="w-4 h-4 text-[#527362]" />
                  <span>Pilih Metode Pembayaran Manual</span>
                </div>
                <div className="space-y-1.5">
                  {methods.map((m) => (
                    <label
                      key={m.id}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                        selectedMethodId === m.id
                          ? 'bg-white border-[#6B8E7B] ring-1 ring-[#6B8E7B]'
                          : 'bg-white/60 border-[#3D2C24]/10'
                      }`}
                    >
                      <input
                        type="radio"
                        name="payment_method"
                        checked={selectedMethodId === m.id}
                        onChange={() => setSelectedMethodId(m.id)}
                        className="mt-0.5 accent-[#527362]"
                      />
                      <div className="text-xs">
                        <p className="font-semibold text-[#3D2C24]">{m.provider_name}</p>
                        <p className="text-[11px] text-[#6E5A50]">
                          {m.account_number} · a.n. {m.account_holder}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>

                {user && (
                  <>
                    <div>
                      <label className="block text-[11px] font-medium text-[#6E5A50] mb-1">
                        Email Pembeli (untuk notifikasi transaksi & akses)
                      </label>
                      <input
                        type="email"
                        required
                        value={buyerEmail}
                        onChange={(e) => setBuyerEmail(e.target.value)}
                        placeholder="emailanda@contoh.com"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#6E5A50] mb-1">
                        Nomor WhatsApp (untuk pengingat bukti bayar)
                      </label>
                      <input
                        type="tel"
                        value={buyerWhatsapp}
                        onChange={(e) => setBuyerWhatsapp(e.target.value)}
                        placeholder="0812xxxxxxxx"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15 text-xs"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-[11px] font-medium text-[#6E5A50] mb-1">
                    Catatan Pesanan (Opsional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Contoh: Catatan pesanan atau permintaan khusus"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15 text-xs"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {!createdOrder && cart.length > 0 && (
          <div className="p-4 border-t border-[#3D2C24]/10 bg-white space-y-2">
            {appliedVoucher && (
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between text-[#6E5A50]">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">{formatRupiah(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-[#527362] font-semibold">
                  <span>Diskon ({appliedVoucher.code})</span>
                  <span className="font-mono tabular-nums">-{formatRupiah(discountAmount)}</span>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#6E5A50]">Total Pembayaran</span>
              <span className="font-mono tabular-nums text-base font-bold text-[#3D2C24]">
                {formatRupiah(finalTotal)}
              </span>
            </div>
            <button
              onClick={handleCheckout}
              disabled={checkingOut}
              className="w-full py-3 rounded-xl bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] text-xs font-semibold transition-colors disabled:opacity-60 cursor-pointer"
            >
              {checkingOut
                ? 'Membuat Pesanan...'
                : !user
                ? 'Masuk / Daftar untuk Checkout'
                : 'Beli & Kirim Notifikasi Pembayaran'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
