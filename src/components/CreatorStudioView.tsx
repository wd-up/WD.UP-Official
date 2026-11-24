import React, { useEffect, useState } from 'react';
import { BarChart3, BookHeart, Clapperboard, Leaf, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { apiFetch, formatDateTimeId } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { CreatorStudioEntry, CreatorTool } from '../types/wdup';

export function CreatorStudioView() {
  const { user, toast } = useAuth();
  const [tools, setTools] = useState<CreatorTool[]>([]);
  const [entries, setEntries] = useState<CreatorStudioEntry[]>([]);
  const [activeSlug, setActiveSlug] = useState<string>('ai-creator-wdup');
  const [loading, setLoading] = useState(true);

  // AI Creator state
  const [aiMode, setAiMode] = useState('Hook & Skrip Video');
  const [aiTopic, setAiTopic] = useState('');
  const [aiAudience, setAiAudience] = useState('');
  const [aiTone, setAiTone] = useState('Hangat, edukatif, dan percaya diri');
  const [aiOutput, setAiOutput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // Generic modular tool entry form
  const [entryTitle, setEntryTitle] = useState('');
  const [entryFieldA, setEntryFieldA] = useState('');
  const [entryFieldB, setEntryFieldB] = useState('');
  const [checkedHabits, setCheckedHabits] = useState<string[]>([]);

  const loadStudio = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ tools: CreatorTool[]; entries: CreatorStudioEntry[] }>('/api/creator-studio/tools');
      setTools(res.tools);
      setEntries(res.entries);
      if (res.tools.length > 0 && !res.tools.some((t) => t.slug === activeSlug)) {
        setActiveSlug(res.tools[0].slug);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    loadStudio();
  }, [user?.id]);

  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    Sparkles,
    Clapperboard,
    BookHeart,
    Leaf,
    BarChart3,
    Wand2,
  };

  const activeTool = tools.find((t) => t.slug === activeSlug) || tools[0];
  const toolEntries = entries.filter((e) => e.tool_slug === activeTool?.slug);

  const handleAiGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiTopic.trim()) return;
    setAiLoading(true);
    try {
      const res = await apiFetch<{ result: string }>('/api/creator-studio/ai-generate', {
        method: 'POST',
        body: JSON.stringify({ mode: aiMode, topic: aiTopic, audience: aiAudience, tone: aiTone }),
      });
      setAiOutput(res.result);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menghasilkan materi.', 'coral');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveEntry = async (title: string, payload: Record<string, unknown>) => {
    if (!activeTool) return;
    try {
      const res = await apiFetch<{ entry: CreatorStudioEntry }>('/api/creator-studio/entries', {
        method: 'POST',
        body: JSON.stringify({ tool_slug: activeTool.slug, title, payload }),
      });
      setEntries((prev) => [res.entry, ...prev]);
      setEntryTitle('');
      setEntryFieldA('');
      setEntryFieldB('');
      toast('Tersimpan di Creator Studio!', 'sage');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menyimpan.', 'coral');
    }
  };

  const handleDeleteEntry = async (id: string) => {
    await apiFetch(`/api/creator-studio/entries/${id}`, { method: 'DELETE' }).catch(() => {});
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  if (loading) {
    return <div className="h-64 rounded-3xl bg-[#F2EAE0] animate-pulse" />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {tools.map((t) => {
          const Icon = iconMap[t.icon_name] || Wand2;
          const active = activeTool?.slug === t.slug;
          return (
            <button
              key={t.id}
              onClick={() => setActiveSlug(t.slug)}
              className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                active
                  ? 'bg-[#3D2C24] text-[#FAF6F0] border-[#3D2C24]'
                  : 'bg-white text-[#3D2C24] border-[#3D2C24]/10 hover:border-[#6B8E7B]'
              }`}
            >
              <Icon className={`w-4 h-4 mb-1.5 ${active ? 'text-[#F3C669]' : 'text-[#527362]'}`} />
              <h3 className="text-xs sm:text-sm font-semibold leading-snug">{t.name}</h3>
              <p className={`text-[11px] mt-0.5 line-clamp-2 ${active ? 'text-[#FAF6F0]/75' : 'text-[#6E5A50]'}`}>
                {t.tagline}
              </p>
            </button>
          );
        })}
      </div>

      {activeTool && (
        <div className="grid lg:grid-cols-12 gap-4 items-start">
          {/* Active Tool Workspace */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-[#3D2C24]/10 p-4 sm:p-5 space-y-3">
            <div>
              <p className="text-[11px] font-semibold text-[#527362]">{activeTool.category}</p>
              <h2 className="font-display text-lg font-semibold text-[#3D2C24]">{activeTool.name}</h2>
              <p className="text-xs text-[#6E5A50] mt-0.5">{activeTool.tagline}</p>
            </div>

            {activeTool.tool_type === 'ai_creator' ? (
              <div className="space-y-4">
                <form onSubmit={handleAiGenerate} className="space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#3D2C24] mb-1">Mode Kreasi</label>
                      <select
                        value={aiMode}
                        onChange={(e) => setAiMode(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs font-semibold"
                      >
                        {(
                          (activeTool.config?.modes as string[]) || [
                            'Hook & Skrip Video',
                            'Outline Produk Digital',
                            'Caption Affiliate Soft-Selling',
                          ]
                        ).map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#3D2C24] mb-1">Gaya Bahasa</label>
                      <input
                        type="text"
                        value={aiTone}
                        onChange={(e) => setAiTone(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#3D2C24] mb-1">Topik / Produk yang Dibahas</label>
                    <input
                      type="text"
                      required
                      value={aiTopic}
                      onChange={(e) => setAiTopic(e.target.value)}
                      placeholder="Contoh: Mindful Planner 2026 untuk freelancer perempuan"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#3D2C24] mb-1">Target Audiens</label>
                    <input
                      type="text"
                      value={aiAudience}
                      onChange={(e) => setAiAudience(e.target.value)}
                      placeholder="Contoh: Perempuan pekerja remote usia 23-35 tahun"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={aiLoading}
                    className="min-h-[42px] px-5 py-2 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {aiLoading ? 'Menyusun Materi...' : 'Buat Materi dengan AI Creator'}
                  </button>
                </form>

                {aiOutput && (
                  <div className="p-4 rounded-2xl bg-[#FAF6F0] border border-[#3D2C24]/12 space-y-3">
                    <pre className="whitespace-pre-wrap font-sans text-xs sm:text-sm text-[#3D2C24] leading-relaxed">
                      {aiOutput}
                    </pre>
                    <button
                      onClick={() => handleSaveEntry(`${aiMode}: ${aiTopic}`, { mode: aiMode, content: aiOutput })}
                      className="px-4 py-2 rounded-xl bg-[#6B8E7B] text-white text-xs font-semibold cursor-pointer"
                    >
                      Simpan ke Arsip Studio
                    </button>
                  </div>
                )}
              </div>
            ) : activeTool.tool_type === 'good_reset' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveEntry(`Reset Harian · ${new Date().toLocaleDateString('id-ID')}`, {
                    habits: checkedHabits,
                    reflection: entryFieldA,
                  });
                  setCheckedHabits([]);
                }}
                className="space-y-4"
              >
                <p className="text-xs font-semibold text-[#3D2C24]">Checklist Kebiasaan Sehat Hari Ini:</p>
                <div className="space-y-2">
                  {((activeTool.config?.habits as string[]) || []).map((h) => (
                    <label
                      key={h}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/10 text-xs cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checkedHabits.includes(h)}
                        onChange={(e) =>
                          setCheckedHabits((prev) => (e.target.checked ? [...prev, h] : prev.filter((x) => x !== h)))
                        }
                        className="accent-[#527362]"
                      />
                      <span>{h}</span>
                    </label>
                  ))}
                </div>
                <textarea
                  rows={3}
                  value={entryFieldA}
                  onChange={(e) => setEntryFieldA(e.target.value)}
                  placeholder="Satu hal yang ingin Anda lepaskan agar pikiran lebih tenang..."
                  className="w-full p-3 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-sm"
                />
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-[#6B8E7B] text-white text-xs font-semibold cursor-pointer"
                >
                  Simpan Check-In The Good Reset
                </button>
              </form>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveEntry(entryTitle || activeTool.name, {
                    detail: entryFieldA,
                    metricOrLink: entryFieldB,
                  });
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-xs font-semibold text-[#3D2C24] mb-1">
                    {activeTool.tool_type === 'content_planner'
                      ? 'Judul Konten / Campaign'
                      : activeTool.tool_type === 'digital_journal'
                      ? 'Judul Jurnal Hari Ini'
                      : activeTool.tool_type === 'social_tracker'
                      ? 'Platform & Periode (mis. Instagram · Pekan 4)'
                      : 'Judul Catatan'}
                  </label>
                  <input
                    type="text"
                    required
                    value={entryTitle}
                    onChange={(e) => setEntryTitle(e.target.value)}
                    placeholder="Tulis judul..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#3D2C24] mb-1">
                    {activeTool.tool_type === 'social_tracker'
                      ? 'Ringkasan Angka (Followers, Reach, ER%, Clicks)'
                      : 'Isi / Catatan Lengkap'}
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={entryFieldA}
                    onChange={(e) => setEntryFieldA(e.target.value)}
                    placeholder={
                      activeTool.tool_type === 'digital_journal'
                        ? '3 hal yang saya syukuri hari ini dan fokus langkah esok...'
                        : 'Catat detailnya di sini...'
                    }
                    className="w-full p-3 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#3D2C24] mb-1">
                    {activeTool.tool_type === 'content_planner'
                      ? 'Platform & Status (Draft / Siap Tayang)'
                      : 'Tag / Catatan Tambahan (Opsional)'}
                  </label>
                  <input
                    type="text"
                    value={entryFieldB}
                    onChange={(e) => setEntryFieldB(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold cursor-pointer"
                >
                  Simpan Catatan Studio
                </button>
              </form>
            )}
          </div>

          {/* Saved History for Active Tool */}
          <div className="lg:col-span-5 bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[#3D2C24]">Riwayat Tersimpan ({toolEntries.length})</h3>
            {toolEntries.length === 0 ? (
              <p className="text-xs text-[#6E5A50]">Belum ada catatan tersimpan untuk tool ini.</p>
            ) : (
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {toolEntries.map((ent) => (
                  <div key={ent.id} className="p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#3D2C24]/10 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-semibold text-[#3D2C24]">{ent.title}</h4>
                      <button
                        onClick={() => handleDeleteEntry(ent.id)}
                        className="text-[#E07A5F] hover:opacity-75 cursor-pointer"
                        aria-label="Hapus catatan"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-[#3D2C24]/80 whitespace-pre-line line-clamp-4">
                      {String(
                        ent.payload.content ||
                          ent.payload.detail ||
                          ent.payload.reflection ||
                          (Array.isArray(ent.payload.habits) ? ent.payload.habits.join(', ') : '')
                      )}
                    </p>
                    <p className="text-[10px] text-[#6E5A50]">{formatDateTimeId(ent.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
