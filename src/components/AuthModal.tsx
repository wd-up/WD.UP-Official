import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { Eye, GraduationCap, KeyRound, Shield, ShieldCheck, User as UserIcon, X } from 'lucide-react';
import { apiFetch, setAuthToken } from '../lib/api';
import { auth, googleAuthProvider } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import type { User } from '../types/wdup';

type LoginRoleChoice = 'guest' | 'member' | 'mentor' | 'admin';

function GoogleLogoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.8 9.1-9.2 0-.6-.1-1.1-.2-1.6H12z"
      />
      <path
        fill="#34A853"
        d="M3.5 7.4l3.2 2.4C7.6 7.8 9.6 6.4 12 6.4c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5c-3.7 0-6.9 2.1-8.5 4.9z"
      />
      <path
        fill="#FBBC05"
        d="M12 21.5c2.5 0 4.6-.8 6.1-2.3l-2.8-2.3c-.8.5-1.8.9-3.3.9-2.5 0-4.7-1.7-5.5-4l-3.3 2.5c1.6 3.1 4.9 5.2 8.8 5.2z"
      />
      <path
        fill="#4285F4"
        d="M21.1 12.3c0-.6-.1-1.2-.2-1.8H12v3.9h5.1c-.3 1.2-1 2.2-1.9 2.9l2.8 2.3c1.7-1.6 3.1-4 3.1-7.3z"
      />
    </svg>
  );
}

export function AuthModal() {
  const {
    authModalOpen,
    setAuthModalOpen,
    loginSuccess,
    adminClaimed,
    envPasscodeConfigured,
    adminPasscodeConfigured,
    mentorPasscodeConfigured,
    toast,
  } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'claim_admin'>('login');
  const [selectedRole, setSelectedRole] = useState<LoginRoleChoice>('member');
  const [whatsapp, setWhatsapp] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!authModalOpen) return null;

  const handleSelectRole = (nextRole: LoginRoleChoice) => {
    setSelectedRole(nextRole);
    setError('');
    setAccessCode('');
    if (nextRole === 'admin' && mode === 'register') {
      setMode('login');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode !== 'claim_admin' && selectedRole === 'guest') {
      setAuthModalOpen(false);
      toast('Anda melanjutkan sebagai Pengunjung.', 'sage');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'claim_admin') {
        if (envPasscodeConfigured) {
          const res = await apiFetch<{ token: string; user: User }>('/api/auth/admin-passcode-login', {
            method: 'POST',
            body: JSON.stringify({ passcode }),
          });
          loginSuccess(res.token, res.user);
          toast('Masuk sebagai Administrator WD.UP.');
          return;
        }

        const cred = await signInWithPopup(auth, googleAuthProvider);
        const idToken = await cred.user.getIdToken();
        setAuthToken(idToken);
        const res = await apiFetch<{ token: string; user: User }>('/api/auth/claim-admin', {
          method: 'POST',
        });
        loginSuccess(res.token || idToken, res.user);
        toast('Akses Admin utama berhasil diaktifkan.');
        return;
      }

      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      setAuthToken(idToken);

      const res = await apiFetch<{
        token: string;
        user: User;
        pendingApproval?: boolean;
        message?: string;
      }>('/api/auth/firebase-login', {
        method: 'POST',
        body: JSON.stringify({
          selected_role: selectedRole,
          whatsapp: whatsapp.trim() || undefined,
          access_code: selectedRole === 'mentor' || selectedRole === 'admin' ? accessCode : undefined,
        }),
      });

      loginSuccess(res.token || idToken, res.user);
      toast(
        res.pendingApproval && res.message
          ? res.message
          : mode === 'register'
          ? `Akun WD.UP terhubung dengan Google (${res.user.name})!`
          : `Selamat datang kembali, ${res.user.name}.`,
        res.pendingApproval ? 'brown' : 'sage'
      );
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code) : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setError('Login Google dibatalkan. Silakan coba lagi.');
      } else if (code === 'auth/popup-blocked') {
        setError('Popup login Google diblokir browser. Izinkan popup atau buka halaman di tab baru.');
      } else {
        setError(err instanceof Error ? err.message : 'Gagal memproses autentikasi Google.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const roleChoices: Array<{
    id: LoginRoleChoice;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'guest', label: 'Pengunjung', icon: Eye },
    { id: 'member', label: 'Member', icon: UserIcon },
    { id: 'mentor', label: 'Mentor', icon: GraduationCap },
    { id: 'admin', label: 'Admin', icon: Shield },
  ];

  const needCodeInput =
    mode !== 'claim_admin' &&
    ((selectedRole === 'mentor' && (mentorPasscodeConfigured || mode === 'login' || mode === 'register')) ||
      (selectedRole === 'admin' && (adminPasscodeConfigured || mode === 'login')));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#3D2C24]/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#FCF5F1] rounded-3xl border border-[#3D2C24]/15 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3D2C24]/10 bg-[#FCF5F1] shrink-0">
          <div className="flex items-center gap-3">
            <img
              src="/assets/aistudio/file_000000009ff08207aa2f6020b9727e1d_734b5d00.png"
              alt="WD.UP"
              className="h-12 w-12 object-contain shrink-0"
            />
            <div>
              <h2 className="font-display text-lg font-semibold text-[#3D2C24]">
                {mode === 'login'
                  ? 'Masuk ke Akun WD.UP'
                  : mode === 'register'
                  ? 'Daftar Akun WD.UP'
                  : 'Setup Akses Tim'}
              </h2>
              <p className="text-[11px] text-[#6E5A50] mt-0.5">
                Masuk cepat & aman menggunakan akun Google Anda.
              </p>
            </div>
          </div>
          <button
            onClick={() => setAuthModalOpen(false)}
            className="min-h-[40px] min-w-[40px] rounded-full hover:bg-[#3D2C24]/10 flex items-center justify-center cursor-pointer"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5 text-[#3D2C24]" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <div className="flex gap-1 p-1 bg-[#F2EAE0] rounded-xl mb-4">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                mode === 'login' ? 'bg-[#FAF6F0] text-[#3D2C24] shadow-sm' : 'text-[#6E5A50]'
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedRole === 'admin') setSelectedRole('member');
                setMode('register');
                setError('');
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                mode === 'register' ? 'bg-[#FAF6F0] text-[#3D2C24] shadow-sm' : 'text-[#6E5A50]'
              }`}
            >
              Daftar Baru
            </button>
            {(!adminClaimed || envPasscodeConfigured) && (
              <button
                type="button"
                onClick={() => {
                  setMode('claim_admin');
                  setError('');
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  mode === 'claim_admin' ? 'bg-[#3D2C24] text-[#FAF6F0] shadow-sm' : 'text-[#6E5A50]'
                }`}
              >
                Admin Setup
              </button>
            )}
          </div>

          {mode !== 'claim_admin' && (
            <div className="mb-4 space-y-1.5">
              <label className="block text-[11px] font-semibold text-[#3D2C24]">Masuk / Daftar Sebagai:</label>
              <div className="grid grid-cols-4 gap-1.5">
                {roleChoices
                  .filter((rc) => !(mode === 'register' && rc.id === 'admin'))
                  .map((rc) => {
                    const Icon = rc.icon;
                    const active = selectedRole === rc.id;
                    return (
                      <button
                        key={rc.id}
                        type="button"
                        onClick={() => handleSelectRole(rc.id)}
                        className={`py-2 px-1.5 rounded-xl border text-[11px] font-semibold flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#3D2C24] text-[#FAF6F0] border-[#3D2C24] shadow-sm'
                            : 'bg-white text-[#6E5A50] border-[#3D2C24]/15 hover:text-[#3D2C24]'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{rc.label}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-[#E07A5F]/15 border border-[#E07A5F]/40 text-xs font-medium text-[#3D2C24]">
              {error}
            </div>
          )}

          {mode !== 'claim_admin' && selectedRole === 'guest' ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#EFF5F1] border border-[#6B8E7B]/35 space-y-1.5 text-xs text-[#3D2C24]">
                <p className="font-semibold text-[#527362]">Mode Pengunjung Aktif</p>
                <p className="text-[#6E5A50] leading-relaxed">
                  Anda dapat bebas menjelajahi WD.UP Home, melihat katalog WD.UP Academy & Market, mengunjungi toko kreator, serta mengikuti Community & Opportunity tanpa login.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAuthModalOpen(false);
                  toast('Melanjutkan sebagai Pengunjung.', 'sage');
                }}
                className="w-full py-3 rounded-xl bg-[#6B8E7B] hover:bg-[#527362] text-white text-xs font-semibold cursor-pointer"
              >
                Lanjut sebagai Pengunjung
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {mode === 'claim_admin' && envPasscodeConfigured ? (
                <div>
                  <label className="block text-xs font-semibold text-[#3D2C24] mb-1.5">Passcode Administrator</label>
                  <input
                    type="password"
                    required
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Masukkan server ADMIN_PASSCODE"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#3D2C24]/15 text-sm focus:outline-none focus:ring-2 focus:ring-[#6B8E7B]"
                  />
                </div>
              ) : (
                <>
                  {mode !== 'claim_admin' && (
                    <div className="p-3.5 rounded-2xl bg-white border border-[#3D2C24]/10 text-xs text-[#6E5A50] leading-relaxed">
                      Nama, email, dan foto profil Anda akan otomatis tersinkronkan dari Akun Google saat masuk.
                    </div>
                  )}

                  {mode === 'register' && (
                    <div>
                      <label className="block text-xs font-semibold text-[#3D2C24] mb-1.5">
                        Nomor WhatsApp (opsional, untuk notifikasi pesanan & kelas)
                      </label>
                      <input
                        type="tel"
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(e.target.value)}
                        placeholder="0812xxxxxxxx"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#3D2C24]/15 text-sm focus:outline-none focus:ring-2 focus:ring-[#6B8E7B]"
                      />
                    </div>
                  )}

                  {needCodeInput && (
                    <div className="p-3 rounded-2xl bg-[#FDF8EC] border border-[#F3C669]/60 space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-[#3D2C24]">
                        <KeyRound className="w-3.5 h-3.5 text-[#8A6112]" />
                        <span>
                          {selectedRole === 'admin' ? 'Kode Akses Admin' : 'Kode Akses Mentor'}
                          {(selectedRole === 'admin' ? adminPasscodeConfigured : mentorPasscodeConfigured)
                            ? ' (Wajib)'
                            : ' (Opsional jika belum diatur Admin)'}
                        </span>
                      </label>
                      <input
                        type="password"
                        required={selectedRole === 'admin' ? adminPasscodeConfigured : mentorPasscodeConfigured}
                        value={accessCode}
                        onChange={(e) => setAccessCode(e.target.value)}
                        placeholder={
                          selectedRole === 'admin'
                            ? 'Masukkan kode akses Admin'
                            : 'Masukkan kode akses Mentor dari Admin'
                        }
                        className="w-full px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15 text-xs font-mono"
                      />
                    </div>
                  )}

                  {mode === 'register' && selectedRole === 'mentor' && (
                    <div className="p-3 rounded-xl bg-[#B8A9C9]/20 border border-[#B8A9C9]/45 text-[11px] text-[#3D2C24] leading-relaxed">
                      <strong>Persetujuan Mentor (ACC Admin):</strong> Setelah mendaftar dengan Google, Admin WD.UP akan meninjau dan menyetujui (ACC) akun Anda agar Panel Mentor Academy terbuka penuh.
                    </div>
                  )}
                </>
              )}

              {mode === 'claim_admin' && !envPasscodeConfigured && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#6B8E7B]/12 text-xs text-[#3D2C24]">
                  <ShieldCheck className="w-4 h-4 text-[#527362] shrink-0 mt-0.5" />
                  <span>
                    Belum ada akun Admin terdaftar. Masuk dengan akun Google Anda untuk menetapkan Admin utama pertama secara aman.
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2.5"
              >
                {!(mode === 'claim_admin' && envPasscodeConfigured) && <GoogleLogoIcon />}
                <span>
                  {submitting
                    ? 'Menghubungkan...'
                    : mode === 'claim_admin' && envPasscodeConfigured
                    ? 'Masuk dengan Passcode Admin'
                    : mode === 'claim_admin'
                    ? 'Masuk dengan Google & Aktifkan Admin'
                    : mode === 'register' && selectedRole === 'mentor'
                    ? 'Ajukan Daftar Mentor via Google'
                    : selectedRole === 'admin'
                    ? 'Masuk Admin dengan Google'
                    : selectedRole === 'mentor'
                    ? 'Masuk Mentor dengan Google'
                    : 'Lanjutkan dengan Google'}
                </span>
              </button>
            </form>
          )}

          {typeof window !== 'undefined' && window.self !== window.top && (
            <p className="mt-3 text-[11px] text-[#6E5A50] text-center leading-relaxed">
              Menggunakan mode preview?{' '}
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#527362] underline"
              >
                Buka di Tab Baru
              </a>{' '}
              agar sesi login tetap tersimpan otomatis saat ada pembaruan.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
