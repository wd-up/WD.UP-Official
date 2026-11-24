import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  Bot,
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  GraduationCap,
  HelpCircle,
  Link2,
  Lock,
  MessageSquare,
  Package,
  Pause,
  Play,
  Search,
  Send,
  Share2,
  ShoppingCart,
  Sparkles,
  Users,
  Video,
} from 'lucide-react';
import { apiFetch, formatDateTimeId, formatRupiah } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type {
  AcademyCategory,
  AcademyClass,
  AcademyModule,
  AcademyProgram,
  Enrollment,
  SubmissionRecord,
} from '../types/wdup';
import { SafeImage } from './SafeImage';

export function AcademyView() {
  const { user, selectedClassId, setSelectedClassId, addToCart, setActiveTab, setAccountSubView, toast } = useAuth();

  const [categories, setCategories] = useState<AcademyCategory[]>([]);
  const [programs, setPrograms] = useState<AcademyProgram[]>([]);
  const [classes, setClasses] = useState<AcademyClass[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string>('all');
  const [activeProgramId, setActiveProgramId] = useState<string>('all');
  const [activeLevel, setActiveLevel] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [spotlightIdx, setSpotlightIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  // Class Workspace State
  const [classDetail, setClassDetail] = useState<AcademyClass | null>(null);
  const [modules, setModules] = useState<AcademyModule[]>([]);
  const [hasFullAccess, setHasFullAccess] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [submissions, setSubmissions] = useState<Record<string, SubmissionRecord>>({});
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);

  // Interactive Learning Player states
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [activeCaptionIdx, setActiveCaptionIdx] = useState(0);
  const [worksheetDraft, setWorksheetDraft] = useState('');
  const [autosaveStatus, setAutosaveStatus] = useState('');
  const [assignmentText, setAssignmentText] = useState('');
  const [assignmentLink, setAssignmentLink] = useState('');
  const [quizSelections, setQuizSelections] = useState<number[]>([]);
  const [showCertModal, setShowCertModal] = useState(false);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        categories: AcademyCategory[];
        programs: AcademyProgram[];
        classes: AcademyClass[];
        enrollments: Enrollment[];
      }>('/api/academy');
      setCategories(res.categories);
      setPrograms(res.programs);
      setClasses(res.classes);
      setEnrollments(res.enrollments);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, [user?.id]);

  const loadClassDetail = async (id: string) => {
    try {
      const res = await apiFetch<{
        classDetail: AcademyClass;
        modules: AcademyModule[];
        hasFullAccess: boolean;
        enrollment: Enrollment | null;
        submissions: SubmissionRecord[];
      }>(`/api/academy/classes/${id}`);
      setClassDetail(res.classDetail);
      setModules(res.modules);
      setHasFullAccess(res.hasFullAccess);
      setEnrollment(res.enrollment);
      const subMap: Record<string, SubmissionRecord> = {};
      for (const s of res.submissions) subMap[s.module_id] = s;
      setSubmissions(subMap);
      if (res.modules.length > 0) {
        const firstId = res.modules[0].id;
        setActiveModuleId(firstId);
        const firstSub = subMap[firstId];
        setWorksheetDraft(firstSub?.worksheet_answer || '');
        setAssignmentText(firstSub?.assignment_answer || '');
        setAssignmentLink(firstSub?.assignment_link || '');
        setQuizSelections(firstSub?.quiz_answers || []);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memuat detail kelas.', 'coral');
    }
  };

  useEffect(() => {
    if (selectedClassId) {
      loadClassDetail(selectedClassId);
    } else {
      setClassDetail(null);
    }
  }, [selectedClassId, user?.id]);

  useEffect(() => {
    if (!activeModuleId) return;
    const sub = submissions[activeModuleId];
    setWorksheetDraft(sub?.worksheet_answer || '');
    setAssignmentText(sub?.assignment_answer || '');
    setAssignmentLink(sub?.assignment_link || '');
    setQuizSelections(sub?.quiz_answers || []);
    setAutosaveStatus('');
    setIsPlayingVideo(false);
    setActiveCaptionIdx(0);
  }, [activeModuleId]);

  // Simulated synchronized video lesson playback timer
  useEffect(() => {
    if (!isPlayingVideo || !activeModuleId) return;
    const mod = modules.find((m) => m.id === activeModuleId);
    const total = mod?.video_script_captions?.length || 0;
    if (total <= 1) return;
    const interval = setInterval(() => {
      setActiveCaptionIdx((prev) => {
        if (prev + 1 >= total) {
          setIsPlayingVideo(false);
          return prev;
        }
        return prev + 1;
      });
    }, 4500);
    return () => clearInterval(interval);
  }, [isPlayingVideo, activeModuleId, modules]);

  const handleWorksheetChange = (val: string) => {
    setWorksheetDraft(val);
    if (!classDetail || !activeModuleId || !hasFullAccess) return;
    setAutosaveStatus('Menyimpan otomatis...');
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      try {
        const res = await apiFetch<{ submission: SubmissionRecord }>(
          `/api/academy/classes/${classDetail.id}/modules/${activeModuleId}/worksheet`,
          {
            method: 'POST',
            body: JSON.stringify({ answer: val, action: 'autosave' }),
          }
        );
        setSubmissions((prev) => ({ ...prev, [activeModuleId]: res.submission }));
        setAutosaveStatus('Tersimpan otomatis');
      } catch {
        setAutosaveStatus('Gagal menyimpan draf');
      }
    }, 700);
  };

  const handleWorksheetSubmit = async () => {
    if (!classDetail || !activeModuleId) return;
    try {
      const res = await apiFetch<{ submission: SubmissionRecord }>(
        `/api/academy/classes/${classDetail.id}/modules/${activeModuleId}/worksheet`,
        {
          method: 'POST',
          body: JSON.stringify({ answer: worksheetDraft, action: 'submit' }),
        }
      );
      setSubmissions((prev) => ({ ...prev, [activeModuleId]: res.submission }));
      setAutosaveStatus('Worksheet berhasil dikirim');
      toast('Worksheet terkirim untuk ditinjau mentor!', 'sage');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal mengirim worksheet.', 'coral');
    }
  };

  const handleAssignmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classDetail || !activeModuleId) return;
    try {
      const res = await apiFetch<{ submission: SubmissionRecord }>(
        `/api/academy/classes/${classDetail.id}/modules/${activeModuleId}/assignment`,
        {
          method: 'POST',
          body: JSON.stringify({ answer: assignmentText, link: assignmentLink }),
        }
      );
      setSubmissions((prev) => ({ ...prev, [activeModuleId]: res.submission }));
      toast('Tugas berhasil dikumpulkan!', 'sage');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal mengirim tugas.', 'coral');
    }
  };

  const handleQuizSubmit = async () => {
    if (!classDetail || !activeModuleId) return;
    try {
      const res = await apiFetch<{ score: number; correctCount: number; total: number }>(
        `/api/academy/classes/${classDetail.id}/modules/${activeModuleId}/quiz`,
        {
          method: 'POST',
          body: JSON.stringify({ answers: quizSelections }),
        }
      );
      toast(`Skor Quiz Anda: ${res.score}/100 (${res.correctCount}/${res.total} benar)`, 'sage');
      await loadClassDetail(classDetail.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal mengirim quiz.', 'coral');
    }
  };

  const handleCompleteModule = async () => {
    if (!classDetail || !activeModuleId || !enrollment) return;
    try {
      const res = await apiFetch<{
        completed_modules: string[];
        progress_pct: number;
        certificate_code: string | null;
        completed_at: string | null;
      }>(`/api/academy/classes/${classDetail.id}/modules/${activeModuleId}/complete`, {
        method: 'POST',
      });
      setEnrollment((prev) => (prev ? { ...prev, ...res } : prev));
      toast(
        res.progress_pct >= 100
          ? 'Selamat! Kelas selesai 100% dan sertifikat telah diterbitkan.'
          : `Progress belajar diperbarui (${res.progress_pct}%).`,
        'sage'
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memperbarui progress.', 'coral');
    }
  };

  // ==========================================
  // CLASS WORKSPACE VIEW (LEVEL C)
  // ==========================================
  if (selectedClassId && classDetail) {
    const activeMod = modules.find((m) => m.id === activeModuleId) || modules[0];
    const activeSub = activeMod ? submissions[activeMod.id] : undefined;
    const isModDone = Boolean(enrollment?.completed_modules.includes(activeMod?.id || ''));

    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4 space-y-4 pb-24 md:pb-10">
        <button
          onClick={() => setSelectedClassId(null)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#527362] hover:text-[#3D2C24] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Katalog WD.UP Academy</span>
        </button>

        {/* Class Hero Header */}
        <div className="bg-white rounded-2xl border border-[#3D2C24]/10 p-4 sm:p-5 grid lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-4 aspect-[16/10] rounded-xl overflow-hidden bg-[#F2EAE0]">
            <SafeImage src={classDetail.cover_url} alt={classDetail.title} className="w-full h-full object-cover" />
          </div>
          <div className="lg:col-span-8 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#6E5A50]">
              <span>{classDetail.category_name}</span>
              <span aria-hidden="true">·</span>
              <span>{classDetail.program_title}</span>
              <span aria-hidden="true">·</span>
              <span>Mentor: {classDetail.mentor_name}</span>
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-semibold text-[#3D2C24]">{classDetail.title}</h1>
            <p className="text-xs sm:text-sm text-[#6E5A50] leading-relaxed">{classDetail.description}</p>

            <div>
              <p className="text-xs font-semibold text-[#3D2C24] mb-1.5">Tujuan Pembelajaran:</p>
              <ul className="space-y-1">
                {classDetail.objectives.map((obj, idx) => (
                  <li key={idx} className="text-xs text-[#3D2C24]/85 flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#527362] shrink-0 mt-0.5" />
                    <span>{obj}</span>
                  </li>
                ))}
              </ul>
            </div>

            {hasFullAccess ? (
              <div className="pt-2 flex flex-wrap items-center justify-between gap-4 border-t border-[#3D2C24]/10">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#3D2C24] mb-1">
                    <span>Progress Belajar Anda</span>
                    <span className="font-mono tabular-nums">{enrollment?.progress_pct || 0}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#F2EAE0] overflow-hidden">
                    <div
                      className="h-full bg-[#6B8E7B] transition-all"
                      style={{ width: `${enrollment?.progress_pct || 0}%` }}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {classDetail.group_link && /^https?:\/\//i.test(classDetail.group_link) && (
                    <a
                      href={classDetail.group_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#6B8E7B] hover:bg-[#527362] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Users className="w-4 h-4" />
                      <span>Gabung Grup WD.UP Academy</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {enrollment?.certificate_code && (
                    <button
                      onClick={() => setShowCertModal(true)}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-[#F3C669] text-[#3D2C24] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Award className="w-4 h-4" />
                      <span>Lihat Sertifikat</span>
                    </button>
                  )}
                </div>
                {(classDetail.group_link || classDetail.group_duration_note) && (
                  <div className="w-full p-3 rounded-xl bg-[#EFF5F1] border border-[#6B8E7B]/35 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="space-y-0.5">
                      <p className="font-semibold text-[#3D2C24] flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-[#527362]" />
                        <span>Grup Diskusi & Pendampingan WD.UP Academy</span>
                      </p>
                      <p className="text-[11px] text-[#6E5A50]">
                        {classDetail.group_duration_note || 'Durasi grup mengikuti ketentuan program kelas.'}
                      </p>
                    </div>
                    {classDetail.group_link && /^https?:\/\//i.test(classDetail.group_link) && (
                      <a
                        href={classDetail.group_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-semibold text-[#527362] underline inline-flex items-center gap-1"
                      >
                        <span>Buka Tautan Grup</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="pt-3 border-t border-[#3D2C24]/10 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-[#6E5A50]">Investasi Kelas (Sekali Bayar · Akses Penuh)</p>
                  <p className="font-mono tabular-nums text-2xl font-bold text-[#3D2C24]">
                    {formatRupiah(classDetail.price)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    addToCart(
                      {
                        item_type: 'class',
                        item_id: classDetail.id,
                        title: classDetail.title,
                        price: classDetail.price,
                        quantity: 1,
                        image_url: classDetail.cover_url,
                        meta: `WD.UP Academy · ${classDetail.mentor_name}`,
                      },
                      true
                    );
                  }}
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] text-xs font-semibold cursor-pointer"
                >
                  Beli Kelas Ini
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modules + Interactive LMS Stage */}
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          {/* Module Selector Sidebar */}
          <div className="lg:col-span-4 space-y-2.5">
            <h2 className="text-sm font-semibold text-[#3D2C24]">Daftar Modul ({modules.length})</h2>
            {modules.map((m) => {
              const active = activeMod?.id === m.id;
              const done = enrollment?.completed_modules.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => setActiveModuleId(m.id)}
                  className={`w-full text-left p-3.5 rounded-2xl border transition-colors cursor-pointer flex items-start justify-between gap-3 ${
                    active ? 'bg-white border-[#6B8E7B] ring-1 ring-[#6B8E7B]' : 'bg-white/70 border-[#3D2C24]/10'
                  }`}
                >
                  <div>
                    <p className="text-[11px] text-[#6E5A50]">
                      Modul {m.sort_order} · {m.duration_minutes} menit
                    </p>
                    <p className="text-sm font-semibold text-[#3D2C24] mt-0.5">{m.title}</p>
                  </div>
                  {done ? (
                    <CheckCircle2 className="w-4 h-4 text-[#527362] shrink-0 mt-1" />
                  ) : !hasFullAccess ? (
                    <Lock className="w-4 h-4 text-[#6E5A50]/60 shrink-0 mt-1" />
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Interactive Learning Content */}
          <div className="lg:col-span-8 space-y-6">
            {activeMod && (
              <>
                {/* Video Pembelajaran Direct on Website */}
                <div className="bg-white rounded-3xl border border-[#3D2C24]/10 overflow-hidden">
                  <div className="bg-[#2A1D17] text-[#FAF6F0] p-6 space-y-4">
                    <div className="flex items-center justify-between gap-2 text-xs text-[#FAF6F0]/70">
                      <span>Video Pembelajaran Terintegrasi</span>
                      <span className="font-mono">{activeMod.duration_minutes}:00</span>
                    </div>
                    <h3 className="font-display text-xl font-semibold">{activeMod.video_title}</h3>
                    {hasFullAccess ? (
                      <>
                        <div className="p-4 rounded-2xl bg-white/10 border border-white/10 space-y-2 min-h-[110px]">
                          <p className="text-[11px] font-semibold text-[#F3C669]">
                            {activeMod.video_script_captions[activeCaptionIdx]?.heading || 'Materi Video'}
                          </p>
                          <p className="text-sm leading-relaxed text-[#FAF6F0]/95">
                            {activeMod.video_script_captions[activeCaptionIdx]?.text || activeMod.video_summary}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <button
                            onClick={() => setIsPlayingVideo((p) => !p)}
                            className="min-h-[40px] px-4 py-2 rounded-xl bg-[#E07A5F] hover:bg-[#cf6a4f] text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
                          >
                            {isPlayingVideo ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            <span>{isPlayingVideo ? 'Jeda Video' : 'Putar Materi Video'}</span>
                          </button>
                          <div className="flex items-center gap-1.5">
                            {activeMod.video_script_captions.map((cap, idx) => (
                              <button
                                key={idx}
                                onClick={() => setActiveCaptionIdx(idx)}
                                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] cursor-pointer ${
                                  idx === activeCaptionIdx
                                    ? 'bg-[#6B8E7B] text-white'
                                    : 'bg-white/10 text-[#FAF6F0]/75 hover:bg-white/20'
                                }`}
                              >
                                {cap.time}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="p-5 rounded-2xl bg-white/10 flex items-center gap-3 text-xs text-[#FAF6F0]/85">
                        <Lock className="w-5 h-5 text-[#F3C669] shrink-0" />
                        <span>
                          Video pembelajaran, materi teks, worksheet autosave, pengumpulan tugas, dan quiz pemahaman terbuka otomatis setelah pembayaran kelas berstatus Paid.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Materi Teks */}
                  <div className="p-6 space-y-2 border-b border-[#3D2C24]/10">
                    <h4 className="text-sm font-semibold text-[#3D2C24]">Materi Teks & Ringkasan</h4>
                    <p className="text-sm text-[#3D2C24]/85 leading-relaxed whitespace-pre-line">
                      {activeMod.text_material}
                    </p>
                  </div>

                  {hasFullAccess && (
                    <div className="p-6 space-y-8">
                      {/* Worksheet Pribadi (Autosave, Submit, Revisi, Riwayat Feedback) */}
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-sm font-semibold text-[#3D2C24]">
                            <FileText className="w-4 h-4 text-[#527362]" />
                            <span>Worksheet Pribadi</span>
                          </div>
                          <span className="text-[11px] font-medium text-[#6E5A50]">
                            {autosaveStatus || `Status: ${activeSub?.worksheet_status || 'draft'}`}
                          </span>
                        </div>
                        <p className="text-xs text-[#6E5A50]">{activeMod.worksheet_prompt}</p>
                        <textarea
                          rows={5}
                          value={worksheetDraft}
                          onChange={(e) => handleWorksheetChange(e.target.value)}
                          placeholder="Ketik jawaban worksheet Anda di sini — tersimpan otomatis..."
                          className="w-full p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-sm focus:outline-none focus:ring-2 focus:ring-[#6B8E7B]"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="text-[11px] text-[#6E5A50]">
                            Autosave aktif · dapat direvisi kapan saja bila mentor meminta revisi.
                          </span>
                          <button
                            onClick={handleWorksheetSubmit}
                            className="min-h-[40px] px-4 py-2 rounded-xl bg-[#6B8E7B] hover:bg-[#527362] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>
                              {activeSub?.worksheet_status === 'revision_requested'
                                ? 'Kirim Revisi Worksheet'
                                : 'Submit Worksheet'}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Tugas */}
                      <form onSubmit={handleAssignmentSubmit} className="space-y-3 pt-6 border-t border-[#3D2C24]/10">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm font-semibold text-[#3D2C24]">
                            <ClipboardCheck className="w-4 h-4 text-[#527362]" />
                            <span>Pengumpulan Tugas</span>
                          </div>
                          <span className="text-[11px] text-[#6E5A50]">
                            Status: {activeSub?.assignment_status || 'not_started'}
                          </span>
                        </div>
                        <p className="text-xs text-[#6E5A50]">{activeMod.assignment_prompt}</p>
                        <textarea
                          rows={3}
                          value={assignmentText}
                          onChange={(e) => setAssignmentText(e.target.value)}
                          placeholder="Tuliskan hasil tugas Anda..."
                          className="w-full p-3 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-sm"
                        />
                        <input
                          type="url"
                          value={assignmentLink}
                          onChange={(e) => setAssignmentLink(e.target.value)}
                          placeholder="Tautan aktif karya / Google Docs / Canva / Video (https://...)"
                          className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-sm"
                        />
                        {activeSub?.assignment_link && /^https?:\/\//i.test(activeSub.assignment_link) && (
                          <div className="p-2.5 rounded-xl bg-[#EFF5F1] border border-[#6B8E7B]/35 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-[#3D2C24] flex items-center gap-1.5">
                              <Link2 className="w-3.5 h-3.5 text-[#527362]" />
                              <span>Tautan Tugas Tersimpan:</span>
                            </span>
                            <a
                              href={activeSub.assignment_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-[#527362] underline inline-flex items-center gap-1 break-all"
                            >
                              <span>{activeSub.assignment_link}</span>
                              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                            </a>
                          </div>
                        )}
                        <button
                          type="submit"
                          className="min-h-[40px] px-4 py-2 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold cursor-pointer"
                        >
                          Kumpulkan Tugas
                        </button>
                      </form>

                      {/* Quiz */}
                      {activeMod.quiz_questions.length > 0 && (
                        <div className="space-y-4 pt-6 border-t border-[#3D2C24]/10">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm font-semibold text-[#3D2C24]">
                              <HelpCircle className="w-4 h-4 text-[#E07A5F]" />
                              <span>Quiz Pemahaman</span>
                            </div>
                            {activeSub?.quiz_score !== null && activeSub?.quiz_score !== undefined && (
                              <span className="font-mono text-xs font-bold text-[#527362]">
                                Nilai Quiz: {activeSub.quiz_score}/100
                              </span>
                            )}
                          </div>
                          {activeMod.quiz_questions.map((q, qIdx) => (
                            <div key={q.id} className="space-y-2">
                              <p className="text-xs font-semibold text-[#3D2C24]">
                                {qIdx + 1}. {q.question}
                              </p>
                              <div className="space-y-1.5">
                                {q.options.map((opt, optIdx) => (
                                  <label
                                    key={optIdx}
                                    className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/10 text-xs cursor-pointer"
                                  >
                                    <input
                                      type="radio"
                                      name={`quiz_${q.id}`}
                                      checked={quizSelections[qIdx] === optIdx}
                                      onChange={() => {
                                        const copy = [...quizSelections];
                                        copy[qIdx] = optIdx;
                                        setQuizSelections(copy);
                                      }}
                                      className="accent-[#527362]"
                                    />
                                    <span>{opt}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                          <button
                            onClick={handleQuizSubmit}
                            className="min-h-[40px] px-4 py-2 rounded-xl bg-[#6B8E7B] text-white text-xs font-semibold cursor-pointer"
                          >
                            Kirim Jawaban Quiz
                          </button>
                        </div>
                      )}

                      {/* Penilaian & Feedback Mentor + Riwayat Feedback */}
                      {(activeSub?.mentor_feedback ||
                        activeSub?.grade !== null ||
                        (activeSub?.feedback_history?.length || 0) > 0) && (
                        <div className="space-y-3 pt-6 border-t border-[#3D2C24]/10">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm font-semibold text-[#3D2C24]">
                              <MessageSquare className="w-4 h-4 text-[#527362]" />
                              <span>Penilaian & Riwayat Feedback Mentor</span>
                            </div>
                            {activeSub?.grade !== null && activeSub?.grade !== undefined && (
                              <span className="font-mono text-sm font-bold text-[#527362]">
                                Nilai Akhir: {activeSub.grade}/100
                              </span>
                            )}
                          </div>
                          {activeSub?.mentor_feedback && (
                            <div className="p-3.5 rounded-2xl bg-[#B8A9C9]/20 text-xs text-[#3D2C24] leading-relaxed">
                              <p className="font-semibold mb-1">Catatan Mentor Terbaru:</p>
                              <p>{activeSub.mentor_feedback}</p>
                            </div>
                          )}
                          <div className="space-y-2">
                            {(activeSub?.feedback_history || []).map((fh, i) => (
                              <div key={i} className="p-3 rounded-xl bg-[#FAF6F0] text-xs flex justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-[#3D2C24]">
                                    {fh.status} · {fh.by}
                                  </p>
                                  <p className="text-[#6E5A50] mt-0.5">{fh.note}</p>
                                </div>
                                <span className="text-[11px] text-[#6E5A50] shrink-0">{formatDateTimeId(fh.at)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Mark Module Complete */}
                      {enrollment && (
                        <div className="pt-4 border-t border-[#3D2C24]/10 flex items-center justify-between">
                          <span className="text-xs text-[#6E5A50]">
                            {isModDone ? 'Modul ini telah ditandai selesai.' : 'Selesaikan modul untuk menghitung progress.'}
                          </span>
                          <button
                            onClick={handleCompleteModule}
                            disabled={isModDone}
                            className={`min-h-[42px] px-5 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                              isModDone
                                ? 'bg-[#6B8E7B]/20 text-[#527362] cursor-default'
                                : 'bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0]'
                            }`}
                          >
                            {isModDone ? 'Modul Selesai' : 'Tandai Modul Selesai'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Certificate Modal */}
        {showCertModal && enrollment?.certificate_code && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#3D2C24]/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-xl bg-[#FAF6F0] rounded-3xl p-8 border-4 border-[#F3C669] text-center space-y-4 shadow-2xl">
              <Award className="w-12 h-12 text-[#527362] mx-auto" />
              <p className="text-xs font-semibold tracking-widest uppercase text-[#6E5A50]">
                Sertifikat Penyelesaian Resmi
              </p>
              <h3 className="font-display text-2xl font-semibold text-[#3D2C24]">WD.UP — Women Digital Level Up</h3>
              <p className="text-xs text-[#6E5A50]">Diberikan kepada:</p>
              <p className="font-display text-2xl font-bold text-[#527362]">{user?.name}</p>
              <p className="text-xs text-[#6E5A50]">Atas keberhasilan menyelesaikan kelas:</p>
              <p className="text-base font-semibold text-[#3D2C24]">{classDetail.title}</p>
              <div className="pt-3 border-t border-[#3D2C24]/15 flex items-center justify-between text-xs text-[#6E5A50]">
                <span>Mentor: {classDetail.mentor_name}</span>
                <span className="font-mono font-semibold text-[#3D2C24]">{enrollment.certificate_code}</span>
              </div>
              <button
                onClick={() => setShowCertModal(false)}
                className="mt-4 px-5 py-2.5 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold cursor-pointer"
              >
                Tutup Sertifikat
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // 3-LEVEL CATALOG VIEW (HOME-PARITY EDITORIAL + VISUAL EXPERIENCE)
  // ==========================================
  const q = searchQuery.trim().toLowerCase();

  const filteredPrograms = programs.filter((p) => {
    if (activeCategoryId !== 'all' && p.category_id !== activeCategoryId) return false;
    if (activeLevel !== 'Semua' && p.level.toLowerCase() !== activeLevel.toLowerCase()) return false;
    if (q) {
      const hay = `${p.title} ${p.topic} ${p.goal} ${p.description} ${p.level}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const filteredClasses = classes.filter((c) => {
    if (activeCategoryId !== 'all' && c.category_id !== activeCategoryId) return false;
    if (activeProgramId !== 'all' && c.program_id !== activeProgramId) return false;
    if (activeLevel !== 'Semua' && (c.program_level || '').toLowerCase() !== activeLevel.toLowerCase()) return false;
    if (q) {
      const hay = `${c.title} ${c.description} ${c.mentor_name} ${c.category_name || ''} ${c.program_title || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const categoryTint: Record<string, string> = {
    lavender: 'bg-[#B8A9C9]/20 border-[#B8A9C9]/45',
    sage: 'bg-[#6B8E7B]/15 border-[#6B8E7B]/35',
    butter: 'bg-[#F3C669]/25 border-[#F3C669]/50',
    coral: 'bg-[#E07A5F]/15 border-[#E07A5F]/35',
  };

  const resolveAcademyCategoryIcon = (slug: string) => {
    if (slug.includes('creator')) return Video;
    if (slug.includes('product')) return Package;
    if (slug.includes('affiliate')) return Share2;
    if (slug.includes('branding')) return Sparkles;
    if (slug.includes('ai')) return Bot;
    return Briefcase;
  };

  const spotlights = [
    {
      kicker: 'WD.UP Academy · Kurikulum Praktik Perempuan Digital',
      title: 'Bangun Skill Kreator, Produk Digital & Karier Mandiri dari Satu Tempat',
      body: 'Pelajari video terstruktur, worksheet interaktif dengan autosave, tugas, quiz, hingga umpan balik mentor dan sertifikat resmi.',
      image: '/src/assets/images/academy_creator_cover_1795359345645.jpg',
      ctaLabel: classes[0] ? `Mulai: ${classes[0].title.slice(0, 34)}...` : 'Jelajahi Kelas Unggulan',
      onClick: () => {
        if (classes[0]) setSelectedClassId(classes[0].id);
      },
    },
    {
      kicker: 'Jalur Terarah · Program Belajar & Bundle Hemat',
      title: 'Belajar Bertahap dari Beginner hingga Siap Luncurkan Produk Pertama',
      body: 'Pilih kategori akademi sesuai tujuan Anda—mulai dari Content Creator, Digital Product, Affiliate, hingga AI & Digital Business.',
      image: '/src/assets/images/hero_wdup_banner_1795359344577.jpg',
      ctaLabel: 'Lihat Semua Program',
      onClick: () => {
        setActiveCategoryId('all');
        setActiveProgramId('all');
        setActiveLevel('Semua');
      },
    },
  ];
  const activeSpotlight = spotlights[spotlightIdx % spotlights.length];

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 space-y-6 pb-24 md:pb-10">
      {/* Compact Search Bar + Quick Actions (Matches WD.UP Home) */}
      <section className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="relative flex-1 flex items-center">
          <Search className="w-4 h-4 text-[#6E5A50] absolute left-3.5 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kelas praktik, program belajar, topik, atau nama mentor..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-[#3D2C24]/12 text-xs sm:text-sm text-[#3D2C24] placeholder:text-[#6E5A50]/70 focus:outline-none focus:ring-2 focus:ring-[#6B8E7B] shadow-sm"
          />
        </div>
        {user && enrollments.length > 0 && (
          <button
            onClick={() => {
              setActiveTab('account');
              setAccountSubView('learning');
            }}
            className="px-3.5 py-2.5 rounded-xl bg-[#6B8E7B] hover:bg-[#527362] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap"
          >
            <GraduationCap className="w-4 h-4" />
            <span>Kelas Saya ({enrollments.length})</span>
          </button>
        )}
      </section>

      {/* Editorial Hero Spotlight Banner (Matches WD.UP Home Hero) */}
      <section className="rounded-2xl overflow-hidden bg-white border border-[#3D2C24]/10 shadow-sm">
        <div className="grid lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-4 sm:p-6 flex flex-col justify-between gap-3">
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold tracking-wide text-[#527362]">{activeSpotlight.kicker}</p>
              <h1 className="font-display text-xl sm:text-2xl font-semibold text-[#3D2C24] leading-snug text-balance">
                {activeSpotlight.title}
              </h1>
              <p className="text-xs sm:text-sm text-[#6E5A50] leading-relaxed max-w-xl line-clamp-2">
                {activeSpotlight.body}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-[#6E5A50]">
                <span>{categories.length} Kategori Akademi</span>
                <span aria-hidden="true">·</span>
                <span>{programs.length} Program Belajar</span>
                <span aria-hidden="true">·</span>
                <span>{classes.length} Kelas Praktik & Sertifikat</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                onClick={activeSpotlight.onClick}
                className="px-4 py-2 rounded-xl bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>{activeSpotlight.ctaLabel}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-center gap-1.5">
                {spotlights.map((sp, idx) => (
                  <button
                    key={sp.kicker}
                    onClick={() => setSpotlightIdx(idx)}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      idx === spotlightIdx % spotlights.length ? 'w-5 bg-[#6B8E7B]' : 'w-2 bg-[#3D2C24]/20'
                    }`}
                    aria-label={`Sorotan Academy ${idx + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="lg:col-span-5 h-36 sm:h-44 lg:h-auto lg:min-h-[210px] relative bg-[#F2EAE0]">
            <SafeImage
              src={activeSpotlight.image}
              alt={activeSpotlight.title}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-32 rounded-2xl bg-[#F2EAE0] animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Level A: 6 Kategori Akademi (Tinted Pillar Cards matching WD.UP Home) */}
          <section className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#3D2C24]">1. Kategori Akademi</h2>
                <p className="text-xs text-[#6E5A50]">Pilih bidang keahlian yang ingin Anda kuasai.</p>
              </div>
              {activeCategoryId !== 'all' && (
                <button
                  onClick={() => {
                    setActiveCategoryId('all');
                    setActiveProgramId('all');
                  }}
                  className="text-xs font-semibold text-[#527362] hover:underline cursor-pointer whitespace-nowrap"
                >
                  Tampilkan Semua
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
              {categories.map((cat) => {
                const active = activeCategoryId === cat.id;
                const Icon = resolveAcademyCategoryIcon(cat.slug || '');
                const tintClass = categoryTint[cat.accent_color] || categoryTint.sage;
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setActiveCategoryId(active ? 'all' : cat.id);
                      setActiveProgramId('all');
                    }}
                    className={`text-left p-3 sm:p-3.5 rounded-xl border transition-all hover:-translate-y-0.5 cursor-pointer flex items-start gap-2.5 ${
                      active
                        ? 'bg-[#3D2C24] text-[#FAF6F0] border-[#3D2C24] shadow-sm'
                        : `${tintClass} text-[#3D2C24]`
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        active ? 'bg-white/15 text-[#F3C669]' : 'bg-white/85 text-[#3D2C24]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display text-sm font-semibold leading-snug truncate">{cat.name}</h3>
                      <p className={`text-[11px] mt-0.5 line-clamp-2 leading-snug ${active ? 'text-[#FAF6F0]/80' : 'text-[#6E5A50]'}`}>
                        {cat.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Level B: Program Belajar (Visual Cards + Level Segmented Tabs) */}
          <section className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#3D2C24]">2. Program Belajar</h2>
                <p className="text-xs text-[#6E5A50]">Paket belajar terstruktur berdasarkan topik, tujuan, dan level.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 p-0.5 bg-[#F2EAE0] rounded-xl">
                  {(['Semua', 'Beginner', 'Intermediate', 'Advanced'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setActiveLevel(lvl)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                        activeLevel === lvl
                          ? 'bg-white text-[#3D2C24] shadow-sm'
                          : 'text-[#6E5A50] hover:text-[#3D2C24]'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
                {activeProgramId !== 'all' && (
                  <button
                    onClick={() => setActiveProgramId('all')}
                    className="text-xs font-semibold text-[#527362] hover:underline cursor-pointer whitespace-nowrap"
                  >
                    Semua Program
                  </button>
                )}
              </div>
            </div>

            {filteredPrograms.length === 0 ? (
              <div className="p-6 text-center rounded-2xl bg-white border border-[#3D2C24]/10 text-xs text-[#6E5A50]">
                Belum ada program belajar untuk filter yang dipilih.
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredPrograms.map((prog) => {
                  const selected = activeProgramId === prog.id;
                  return (
                    <article
                      key={prog.id}
                      className={`rounded-2xl border bg-white overflow-hidden flex flex-col justify-between transition-transform hover:-translate-y-0.5 ${
                        selected ? 'border-[#527362] ring-1 ring-[#527362]' : 'border-[#3D2C24]/10'
                      }`}
                    >
                      <div>
                        <div className="aspect-[16/9] bg-[#F2EAE0] overflow-hidden">
                          <SafeImage
                            src={prog.cover_url || '/src/assets/images/academy_creator_cover_1795359345645.jpg'}
                            alt={prog.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="p-3 sm:p-3.5 space-y-1">
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#527362]">
                            <span>{prog.level}</span>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{prog.topic}</span>
                          </div>
                          <h3 className="font-display text-sm sm:text-base font-semibold text-[#3D2C24] leading-snug line-clamp-2">
                            {prog.title}
                          </h3>
                          <p className="text-[11px] text-[#6E5A50] line-clamp-2 leading-relaxed">{prog.goal}</p>
                        </div>
                      </div>
                      <div className="px-3 sm:px-3.5 pb-3 pt-2.5 border-t border-[#3D2C24]/8 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[10px] text-[#6E5A50]">Paket Program</p>
                          <p className="font-mono tabular-nums text-xs sm:text-sm font-bold text-[#3D2C24]">
                            {formatRupiah(prog.bundle_price)}
                          </p>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setActiveProgramId(selected ? 'all' : prog.id)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                              selected
                                ? 'bg-[#6B8E7B] text-white'
                                : 'bg-[#F2EAE0] hover:bg-[#E7DDD0] text-[#3D2C24]'
                            }`}
                          >
                            {selected ? 'Terpilih' : 'Lihat Kelas'}
                          </button>
                          <button
                            onClick={() => {
                              addToCart(
                                {
                                  item_type: 'program',
                                  item_id: prog.id,
                                  title: `Bundle Program: ${prog.title}`,
                                  price: prog.bundle_price,
                                  quantity: 1,
                                  image_url: prog.cover_url,
                                  meta: `Program Belajar · ${prog.level}`,
                                },
                                true
                              );
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                          >
                            Beli Paket
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Level C: Daftar Kelas (Compact 4-Column Shelf matching WD.UP Home) */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#3D2C24]">3. Kelas & Materi Belajar</h2>
                <p className="text-xs text-[#6E5A50]">
                  Video pembelajaran, worksheet pribadi, quiz pemahaman, tugas tautan aktif, dan sertifikat.
                </p>
              </div>
              {(activeCategoryId !== 'all' || activeProgramId !== 'all' || activeLevel !== 'Semua' || q) && (
                <button
                  onClick={() => {
                    setActiveCategoryId('all');
                    setActiveProgramId('all');
                    setActiveLevel('Semua');
                    setSearchQuery('');
                  }}
                  className="text-xs font-semibold text-[#527362] hover:underline cursor-pointer whitespace-nowrap"
                >
                  Reset Filter
                </button>
              )}
            </div>

            {filteredClasses.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-white border border-[#3D2C24]/10 space-y-2">
                <BookOpen className="w-7 h-7 text-[#6E5A50]/50 mx-auto" />
                <p className="text-xs font-medium text-[#3D2C24]">Tidak ada kelas yang cocok dengan pencarian Anda.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredClasses.map((cls) => {
                  const enrolled = enrollments.find((e) => e.class_id === cls.id);
                  return (
                    <article
                      key={cls.id}
                      className="bg-white rounded-2xl border border-[#3D2C24]/10 overflow-hidden flex flex-col justify-between transition-transform hover:-translate-y-0.5"
                    >
                      <div>
                        <button
                          onClick={() => setSelectedClassId(cls.id)}
                          className="w-full text-left cursor-pointer block"
                        >
                          <div className="aspect-[16/10] bg-[#F2EAE0] overflow-hidden">
                            <SafeImage src={cls.cover_url} alt={cls.title} className="w-full h-full object-cover" />
                          </div>
                        </button>
                        <div className="p-2.5 sm:p-3 space-y-1">
                          <div className="flex items-center gap-1 text-[10px] text-[#6E5A50] truncate">
                            <span className="truncate">{cls.category_name}</span>
                            <span aria-hidden="true">·</span>
                            <span className="shrink-0">{cls.modules_count || 1} Modul</span>
                          </div>
                          <button
                            onClick={() => setSelectedClassId(cls.id)}
                            className="text-left cursor-pointer block w-full"
                          >
                            <h3 className="text-xs sm:text-[13px] font-semibold text-[#3D2C24] hover:text-[#527362] transition-colors line-clamp-2 leading-snug">
                              {cls.title}
                            </h3>
                          </button>
                          <p className="text-[11px] text-[#6E5A50] line-clamp-2 hidden sm:block leading-snug">
                            {cls.description}
                          </p>
                          <p className="text-[10px] sm:text-[11px] text-[#527362] font-medium truncate">
                            Mentor: {cls.mentor_name}
                          </p>
                        </div>
                      </div>

                      <div className="px-2.5 sm:px-3 pb-2.5 pt-2 border-t border-[#3D2C24]/8 space-y-2">
                        {enrolled ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] font-semibold text-[#527362]">
                              <span>Progress Kelas</span>
                              <span className="font-mono tabular-nums">{enrolled.progress_pct}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-[#F2EAE0] overflow-hidden">
                              <div
                                className="h-full bg-[#6B8E7B]"
                                style={{ width: `${enrolled.progress_pct}%` }}
                              />
                            </div>
                            <button
                              onClick={() => setSelectedClassId(cls.id)}
                              className="w-full py-1.5 px-2.5 rounded-lg bg-[#6B8E7B] hover:bg-[#527362] text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                              <span>Lanjut Belajar</span>
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-baseline justify-between gap-1">
                              <span className="font-mono tabular-nums text-xs sm:text-sm font-bold text-[#3D2C24]">
                                {formatRupiah(cls.price)}
                              </span>
                              {cls.certificate_available === 1 && (
                                <span className="text-[10px] text-[#6E5A50]">+ Sertifikat</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() =>
                                  addToCart(
                                    {
                                      item_type: 'class',
                                      item_id: cls.id,
                                      title: cls.title,
                                      price: cls.price,
                                      quantity: 1,
                                      image_url: cls.cover_url,
                                      meta: `WD.UP Academy · ${cls.mentor_name}`,
                                    },
                                    false
                                  )
                                }
                                className="p-1.5 rounded-lg bg-[#F2EAE0] hover:bg-[#E7DDD0] text-[#3D2C24] cursor-pointer"
                                title="Tambah ke Keranjang"
                                aria-label="Tambah kelas ke keranjang"
                              >
                                <ShoppingCart className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setSelectedClassId(cls.id)}
                                className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                              >
                                Lihat Silabus
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Learning Workflow Highlights Band (Matches WD.UP Home Bottom Banner Rhythm) */}
          <section className="rounded-2xl p-4 sm:p-5 bg-[#F3C669]/22 border border-[#F3C669]/45 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <p className="text-[11px] font-semibold text-[#3D2C24]/80">Pengalaman Belajar Interaktif di Website</p>
              <h2 className="font-display text-lg font-semibold text-[#3D2C24]">
                Video, Worksheet Autosave, Feedback Mentor & Sertifikat
              </h2>
              <p className="text-xs text-[#3D2C24]/85 leading-relaxed">
                Seluruh materi video, worksheet autosave, quiz pemahaman, pengumpulan tugas tautan aktif, dan riwayat penilaian mentor tersimpan otomatis di akun WD.UP Anda.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                onClick={() => {
                  setActiveTab('account');
                  setAccountSubView('learning');
                }}
                className="px-3.5 py-2 rounded-xl bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Buka My Learning</span>
              </button>
              <button
                onClick={() => setActiveTab('market')}
                className="px-3.5 py-2 rounded-xl bg-white border border-[#3D2C24]/15 text-xs font-semibold text-[#3D2C24] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>Lihat Produk Pendukung</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
