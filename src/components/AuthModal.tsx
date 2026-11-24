import React, { useState } from 'react';
import { Eye, GraduationCap, KeyRound, Shield, ShieldCheck, User as UserIcon, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { User } from '../types/wdup';

type LoginRoleChoice = 'guest' | 'member' | 'mentor' | 'admin';

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
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [password, setPassword] = useState('');
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
    if (selectedRole === 'guest') {
      setAuthModalOpen(false);
      toast('Anda melanjutkan sebagai Pengunjung.', 'sage');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const res = await apiFetch<{ token: string; user: User }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,
            selected_role: selectedRole,
            access_code: selectedRole === 'mentor' || selectedRole === 'admin' ? accessCode : undefined,
          }),
        });
        loginSuccess(res.token, res.user);
        toast(`Selamat datang kembali, ${res.user.name}.`);
      } else if (mode === 'register') {
        const res = await apiFetch<{
          token: string;
          user: User;
          pendingApproval?: boolean;
          message?: string;
        }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name,
            email,
            whatsapp,
            password,
            selected_role: selectedRole,
            access_code: selectedRole === 'mentor' ? accessCode : undefined,
          }),
        });
        loginSuccess(res.token, res.user);
        toast(
          res.pendingApproval && res.message
            ? res.message
            : 'Akun terintegrasi WD.UP berhasil dibuat!',
          res.pendingApproval ? 'brown' : 'sage'
        );
      } else if (mode === 'claim_admin') {
        if (envPasscodeConfigured) {
          const res = await apiFetch<{ token: string; user: User }>('/api/auth/admin-passcode-login', {
            method: 'POST',
            body: JSON.stringify({ passcode }),
          });
          loginSuccess(res.token, res.user);
          toast('Masuk sebagai Administrator WD.UP.');
        } else {
          const res = await apiFetch<{ token: string; user: User }>('/api/auth/claim-admin', {
            method: 'POST',
            body: JSON.stringify({ name, email, password }),
          });
          loginSuccess(res.token, res.user);
          toast('Akses Admin utama berhasil diaktifkan.');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memproses autentikasi.');
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
                Pilih peran Anda: Pengunjung, Member, Mentor, atau Admin.
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
                  {(mode === 'register' || mode === 'claim_admin') && (
                    <div>
                      <label className="block text-xs font-semibold text-[#3D2C24] mb-1.5">Nama Lengkap</label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Contoh: Alya Rahma"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#3D2C24]/15 text-sm focus:outline-none focus:ring-2 focus:ring-[#6B8E7B]"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-[#3D2C24] mb-1.5">Email</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nama@email.com"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#3D2C24]/15 text-sm focus:outline-none focus:ring-2 focus:ring-[#6B8E7B]"
                    />
                  </div>

                  {mode === 'register' && (
                    <div>
                      <label className="block text-xs font-semibold text-[#3D2C24] mb-1.5">
                        Nomor WhatsApp (untuk notifikasi pesanan & kelas)
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

                  <div>
                    <label className="block text-xs font-semibold text-[#3D2C24] mb-1.5">
                      Password {mode === 'claim_admin' ? '(minimal 8 karakter)' : '(minimal 6 karakter)'}
                    </label>
                    <input
                      type="password"
                      required
                      minLength={mode === 'claim_admin' ? 8 : 6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#3D2C24]/15 text-sm focus:outline-none focus:ring-2 focus:ring-[#6B8E7B]"
                    />
                  </div>

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
                        required={
                          selectedRole === 'admin' ? adminPasscodeConfigured : mentorPasscodeConfigured
                        }
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
                      <strong>Persetujuan Mentor (ACC Admin):</strong> Setelah mendaftar, Admin WD.UP akan meninjau dan menyetujui (ACC) akun Anda agar Panel Mentor Academy terbuka penuh.
                    </div>
                  )}
                </>
              )}

              {mode === 'claim_admin' && !envPasscodeConfigured && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#6B8E7B]/12 text-xs text-[#3D2C24]">
                  <ShieldCheck className="w-4 h-4 text-[#527362] shrink-0 mt-0.5" />
                  <span>
                    Belum ada akun Admin terdaftar. Formulir ini aktif satu kali untuk menetapkan Admin utama pertama secara aman.
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer"
              >
                {submitting
                  ? 'Memproses...'
                  : mode === 'login'
                  ? `Masuk sebagai ${selectedRole === 'admin' ? 'Admin' : selectedRole === 'mentor' ? 'Mentor' : 'Member'}`
                  : mode === 'register'
                  ? selectedRole === 'mentor'
                    ? 'Ajukan Daftar Mentor (Menunggu ACC)'
                    : 'Buat Akun Member WD.UP'
                  : 'Aktifkan Akses Admin'}
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
