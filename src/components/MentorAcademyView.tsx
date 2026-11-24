import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  HelpCircle,
  Link2,
  Plus,
  Save,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { apiFetch, formatDateTimeId } from '../lib/api';
import { useAuth } from '../context/AuthContext';

interface QuizQuestionDraft {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
}

interface MentorModule {
  id: string;
  class_id: string;
  sort_order: number;
  title: string;
  duration_minutes: number;
  quiz_questions: QuizQuestionDraft[];
}

interface MentorClass {
  id: string;
  title: string;
  category_name: string;
  program_title: string;
  mentor_name: string;
  group_link?: string;
  group_duration_note?: string;
  modules: MentorModule[];
}

interface MentorSubmission {
  id: string;
  student_name: string;
  student_email: string;
  class_title: string;
  module_title: string;
  worksheet_answer: string;
  worksheet_status: string;
  assignment_answer: string;
  assignment_link: string;
  assignment_status: string;
  quiz_score: number | null;
  quiz_answers: number[];
  quiz_questions: QuizQuestionDraft[];
  grade: number | null;
  mentor_feedback: string;
  updated_at: string;
}

export function MentorAcademyView({ embeddedInAdmin = false }: { embeddedInAdmin?: boolean }) {
  const { toast } = useAuth();
  const [subTab, setSubTab] = useState<'submissions' | 'quiz' | 'group'>('submissions');
  const [classes, setClasses] = useState<MentorClass[]>([]);
  const [submissions, setSubmissions] = useState<MentorSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected class/module for Quiz & Group editing
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');

  // Group Link Editor State
  const [groupLink, setGroupLink] = useState('');
  const [groupDurationNote, setGroupDurationNote] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);

  // Quiz Editor State (Min 5 questions)
  const [quizDraft, setQuizDraft] = useState<QuizQuestionDraft[]>([]);
  const [savingQuiz, setSavingQuiz] = useState(false);

  // Grading State
  const [gradeDrafts, setGradeDrafts] = useState<
    Record<string, { grade: string; feedback: string; status: string }>
  >({});
  const [savingGradeId, setSavingGradeId] = useState<string | null>(null);

  const loadMentorData = async () => {
    setLoading(true);
    try {
      const [clsRes, subRes] = await Promise.all([
        apiFetch<{ classes: MentorClass[] }>('/api/mentor/classes'),
        apiFetch<{ submissions: MentorSubmission[] }>('/api/mentor/submissions'),
      ]);
      const clsList = clsRes.classes || [];
      setClasses(clsList);
      setSubmissions(subRes.submissions || []);

      if (clsList.length > 0) {
        const currentCls = clsList.find((c) => c.id === selectedClassId) || clsList[0];
        setSelectedClassId(currentCls.id);
        setGroupLink(currentCls.group_link || '');
        setGroupDurationNote(currentCls.group_duration_note || '');

        const currentMod =
          currentCls.modules.find((m) => m.id === selectedModuleId) || currentCls.modules[0];
        if (currentMod) {
          setSelectedModuleId(currentMod.id);
          setQuizDraft(
            (currentMod.quiz_questions || []).map((q, idx) => ({
              id: q.id || `q${idx + 1}`,
              question: q.question || '',
              options: q.options?.length ? [...q.options] : ['Pilihan A', 'Pilihan B', 'Pilihan C'],
              correctIndex: Number(q.correctIndex || 0),
            }))
          );
        }
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memuat data Mentor Academy.', 'coral');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMentorData();
  }, []);

  const activeClass = classes.find((c) => c.id === selectedClassId) || classes[0];
  const activeModules = activeClass?.modules || [];

  const handleSelectClass = (classId: string) => {
    setSelectedClassId(classId);
    const cls = classes.find((c) => c.id === classId);
    if (!cls) return;
    setGroupLink(cls.group_link || '');
    setGroupDurationNote(cls.group_duration_note || '');
    const firstMod = cls.modules[0];
    if (firstMod) {
      setSelectedModuleId(firstMod.id);
      setQuizDraft(
        (firstMod.quiz_questions || []).map((q, idx) => ({
          id: q.id || `q${idx + 1}`,
          question: q.question || '',
          options: q.options?.length ? [...q.options] : ['Pilihan A', 'Pilihan B', 'Pilihan C'],
          correctIndex: Number(q.correctIndex || 0),
        }))
      );
    } else {
      setSelectedModuleId('');
      setQuizDraft([]);
    }
  };

  const handleSelectModule = (moduleId: string) => {
    setSelectedModuleId(moduleId);
    const mod = activeModules.find((m) => m.id === moduleId);
    if (!mod) return;
    setQuizDraft(
      (mod.quiz_questions || []).map((q, idx) => ({
        id: q.id || `q${idx + 1}`,
        question: q.question || '',
        options: q.options?.length ? [...q.options] : ['Pilihan A', 'Pilihan B', 'Pilihan C'],
        correctIndex: Number(q.correctIndex || 0),
      }))
    );
  };

  const handleSaveGroupLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClass) return;
    setSavingGroup(true);
    try {
      await apiFetch(`/api/mentor/classes/${activeClass.id}/group-link`, {
        method: 'PUT',
        body: JSON.stringify({
          group_link: groupLink.trim(),
          group_duration_note: groupDurationNote.trim(),
        }),
      });
      toast('Link grup WD.UP Academy & catatan durasi disimpan!', 'sage');
      await loadMentorData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menyimpan link grup.', 'coral');
    } finally {
      setSavingGroup(false);
    }
  };

  const handleSaveQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedModuleId) return;
    if (quizDraft.length < 5) {
      toast('Quiz pemahaman wajib berisi minimal 5 pertanyaan.', 'coral');
      return;
    }
    setSavingQuiz(true);
    try {
      await apiFetch(`/api/mentor/modules/${selectedModuleId}/quiz`, {
        method: 'PUT',
        body: JSON.stringify({ questions: quizDraft }),
      });
      toast('Quiz pemahaman (min. 5 soal) berhasil diperbarui!', 'sage');
      await loadMentorData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menyimpan quiz.', 'coral');
    } finally {
      setSavingQuiz(false);
    }
  };

  const handleGrade = async (subId: string) => {
    const draft = gradeDrafts[subId];
    if (!draft) return;
    setSavingGradeId(subId);
    try {
      await apiFetch(`/api/mentor/submissions/${subId}/grade`, {
        method: 'POST',
        body: JSON.stringify({
          grade: draft.grade.trim() !== '' ? Number(draft.grade) : null,
          mentor_feedback: draft.feedback,
          worksheet_status: draft.status || 'approved',
          assignment_status: draft.status === 'revision_requested' ? 'revision_requested' : 'graded',
        }),
      });
      toast('Penilaian & feedback mentor berhasil dikirim ke peserta.', 'sage');
      await loadMentorData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menyimpan penilaian.', 'coral');
    } finally {
      setSavingGradeId(null);
    }
  };

  if (loading && classes.length === 0) {
    return <div className="h-40 rounded-2xl bg-[#F2EAE0] animate-pulse" />;
  }

  return (
    <div className="space-y-4">
      {!embeddedInAdmin && (
        <div className="bg-[#3D2C24] text-[#FAF6F0] rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold text-[#F3C669]">Panel Mentor WD.UP Academy</p>
            <h2 className="font-display text-xl font-semibold">
              Kelola Quiz Pemahaman, Link Grup Belajar & Review Tugas
            </h2>
          </div>
          <div className="flex gap-3 text-center">
            <div className="px-3 py-1.5 rounded-xl bg-white/10">
              <p className="text-[10px] text-[#FAF6F0]/75">Total Kelas</p>
              <p className="font-mono font-bold text-sm">{classes.length}</p>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-white/10">
              <p className="text-[10px] text-[#FAF6F0]/75">Submisi Peserta</p>
              <p className="font-mono font-bold text-sm text-[#F3C669]">{submissions.length}</p>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setSubTab('submissions')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
            subTab === 'submissions'
              ? 'bg-[#3D2C24] text-[#FAF6F0]'
              : 'bg-white text-[#6E5A50] border border-[#3D2C24]/12'
          }`}
        >
          <ClipboardCheck className="w-3.5 h-3.5" />
          <span>Jawaban Quiz & Tugas ({submissions.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('quiz')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
            subTab === 'quiz'
              ? 'bg-[#3D2C24] text-[#FAF6F0]'
              : 'bg-white text-[#6E5A50] border border-[#3D2C24]/12'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Tulis Quiz Pemahaman (Min. 5)</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('group')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
            subTab === 'group'
              ? 'bg-[#3D2C24] text-[#FAF6F0]'
              : 'bg-white text-[#6E5A50] border border-[#3D2C24]/12'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Link Aktif Grup Academy</span>
        </button>
      </div>

      {/* SUBTAB 1: REVIEW QUIZ ANSWERS, WORKSHEET, CLICKABLE ASSIGNMENT LINK & GRADE */}
      {subTab === 'submissions' && (
        <div className="bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[#3D2C24]">
              Review Jawaban Quiz Pemahaman, Worksheet & Tugas Peserta
            </h3>
            <p className="text-[11px] text-[#6E5A50]">
              Mentor dan Admin dapat memeriksa pilihan jawaban quiz setiap peserta, membuka tautan tugas aktif, dan memberi nilai serta feedback.
            </p>
          </div>

          {submissions.length === 0 ? (
            <p className="text-xs text-[#6E5A50]">Belum ada peserta yang mengirim quiz, worksheet, atau tugas.</p>
          ) : (
            <div className="space-y-4">
              {submissions.map((sub) => {
                const draft = gradeDrafts[sub.id] || {
                  grade: sub.grade !== null && sub.grade !== undefined ? String(sub.grade) : '',
                  feedback: sub.mentor_feedback || '',
                  status: sub.worksheet_status || 'approved',
                };
                const hasCleanLink =
                  sub.assignment_link && /^https?:\/\//i.test(sub.assignment_link.trim());

                return (
                  <div
                    key={sub.id}
                    className="p-4 rounded-2xl bg-[#FAF6F0] border border-[#3D2C24]/12 space-y-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[#3D2C24]">
                          {sub.student_name}{' '}
                          <span className="font-normal text-[#6E5A50]">({sub.student_email})</span>
                        </p>
                        <p className="text-[11px] text-[#6E5A50]">
                          {sub.class_title} · {sub.module_title} · Diperbarui {formatDateTimeId(sub.updated_at)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                        {sub.quiz_score !== null && sub.quiz_score !== undefined && (
                          <span className="px-2 py-1 rounded-lg bg-[#EFF5F1] border border-[#6B8E7B]/35 font-bold text-[#527362]">
                            Quiz: {sub.quiz_score}/100
                          </span>
                        )}
                        <span className="px-2 py-1 rounded-lg bg-white border border-[#3D2C24]/12 text-[#3D2C24]">
                          WS: {sub.worksheet_status} · Tugas: {sub.assignment_status}
                        </span>
                      </div>
                    </div>

                    {/* Jawaban Quiz Pemahaman Detail */}
                    {sub.quiz_questions?.length > 0 && (
                      <div className="p-3 rounded-xl bg-white border border-[#3D2C24]/10 space-y-2">
                        <p className="font-semibold text-[#3D2C24] flex items-center gap-1.5">
                          <HelpCircle className="w-3.5 h-3.5 text-[#E07A5F]" />
                          <span>Detail Jawaban Quiz Pemahaman Peserta:</span>
                        </p>
                        {sub.quiz_answers && sub.quiz_answers.length > 0 ? (
                          <div className="space-y-1.5">
                            {sub.quiz_questions.map((q, qIdx) => {
                              const chosenIdx = sub.quiz_answers[qIdx];
                              const chosenLabel =
                                typeof chosenIdx === 'number' && q.options[chosenIdx]
                                  ? q.options[chosenIdx]
                                  : 'Belum dijawab';
                              const isCorrect = chosenIdx === q.correctIndex;
                              return (
                                <div
                                  key={q.id || qIdx}
                                  className={`p-2 rounded-lg border text-[11px] space-y-0.5 ${
                                    isCorrect
                                      ? 'bg-[#EFF5F1]/70 border-[#6B8E7B]/30'
                                      : 'bg-[#FFF5F2] border-[#E07A5F]/30'
                                  }`}
                                >
                                  <p className="font-semibold text-[#3D2C24]">
                                    {qIdx + 1}. {q.question}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center gap-1 font-medium">
                                      {isCorrect ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-[#527362]" />
                                      ) : (
                                        <XCircle className="w-3.5 h-3.5 text-[#E07A5F]" />
                                      )}
                                      Jawaban Peserta: <strong>{chosenLabel}</strong>
                                    </span>
                                    {!isCorrect && q.options[q.correctIndex] && (
                                      <span className="text-[#527362]">
                                        (Kunci: {q.options[q.correctIndex]})
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[11px] text-[#6E5A50]">Peserta belum mengirimkan jawaban quiz.</p>
                        )}
                      </div>
                    )}

                    {/* Worksheet */}
                    {sub.worksheet_answer && (
                      <div className="p-3 rounded-xl bg-white border border-[#3D2C24]/10">
                        <p className="font-semibold text-[#6E5A50] mb-1">Jawaban Worksheet:</p>
                        <p className="whitespace-pre-line text-[#3D2C24]">{sub.worksheet_answer}</p>
                      </div>
                    )}

                    {/* Assignment & Active Link */}
                    {(sub.assignment_answer || hasCleanLink) && (
                      <div className="p-3 rounded-xl bg-white border border-[#3D2C24]/10 space-y-2">
                        <p className="font-semibold text-[#6E5A50]">Jawaban & Tautan Tugas:</p>
                        {sub.assignment_answer && (
                          <p className="whitespace-pre-line text-[#3D2C24]">{sub.assignment_answer}</p>
                        )}
                        {hasCleanLink && (
                          <a
                            href={sub.assignment_link.trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EFF5F1] hover:bg-[#E1EDE6] border border-[#6B8E7B]/40 text-[#527362] font-semibold"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            <span className="underline break-all">{sub.assignment_link}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        )}
                      </div>
                    )}

                    {/* Grading Controls */}
                    <div className="grid sm:grid-cols-4 gap-2 items-center pt-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        placeholder="Nilai (0-100)"
                        value={draft.grade}
                        onChange={(e) =>
                          setGradeDrafts({
                            ...gradeDrafts,
                            [sub.id]: { ...draft, grade: e.target.value },
                          })
                        }
                        className="px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15 font-mono"
                      />
                      <select
                        value={draft.status}
                        onChange={(e) =>
                          setGradeDrafts({
                            ...gradeDrafts,
                            [sub.id]: { ...draft, status: e.target.value },
                          })
                        }
                        className="px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15"
                      >
                        <option value="approved">Disetujui (Approved)</option>
                        <option value="revision_requested">Minta Revisi</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Feedback mentor untuk peserta..."
                        value={draft.feedback}
                        onChange={(e) =>
                          setGradeDrafts({
                            ...gradeDrafts,
                            [sub.id]: { ...draft, feedback: e.target.value },
                          })
                        }
                        className="px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15 sm:col-span-2"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={savingGradeId === sub.id}
                      onClick={() => handleGrade(sub.id)}
                      className="px-4 py-2 rounded-xl bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] font-semibold cursor-pointer disabled:opacity-60"
                    >
                      {savingGradeId === sub.id ? 'Menyimpan...' : 'Simpan Nilai & Feedback'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: QUIZ PEMAHAMAN EDITOR (MIN 5 QUESTIONS) */}
      {subTab === 'quiz' && (
        <form
          onSubmit={handleSaveQuiz}
          className="bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-4 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[#3D2C24]">
                Editor Quiz Pemahaman Kelas (Minimal 5 Pertanyaan)
              </h3>
              <p className="text-[11px] text-[#6E5A50]">
                Pilih kelas & modul, lalu tulis atau perbarui minimal 5 pertanyaan pemahaman beserta kunci jawabannya.
              </p>
            </div>
            <span
              className={`px-2.5 py-1 rounded-lg font-mono font-bold text-[11px] ${
                quizDraft.length >= 5
                  ? 'bg-[#EFF5F1] text-[#527362]'
                  : 'bg-[#FFF5F2] text-[#E07A5F]'
              }`}
            >
              Total Soal: {quizDraft.length} (Min. 5)
            </span>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#3D2C24] mb-1">Pilih Kelas Academy</label>
              <select
                value={selectedClassId}
                onChange={(e) => handleSelectClass(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-[#3D2C24] mb-1">Pilih Modul</label>
              <select
                value={selectedModuleId}
                onChange={(e) => handleSelectModule(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
              >
                {activeModules.map((m) => (
                  <option key={m.id} value={m.id}>
                    Modul {m.sort_order}: {m.title} ({m.quiz_questions?.length || 0} soal)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            {quizDraft.map((q, qIdx) => (
              <div key={q.id || qIdx} className="p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#3D2C24]/12 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#527362]">Pertanyaan #{qIdx + 1}</span>
                  <button
                    type="button"
                    disabled={quizDraft.length <= 5}
                    onClick={() => setQuizDraft((prev) => prev.filter((_, idx) => idx !== qIdx))}
                    className="text-[11px] font-semibold text-[#E07A5F] inline-flex items-center gap-1 cursor-pointer disabled:opacity-40"
                    title={quizDraft.length <= 5 ? 'Minimal 5 soal harus dipertahankan' : 'Hapus soal'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Soal</span>
                  </button>
                </div>

                <input
                  type="text"
                  required
                  placeholder={`Tulis pertanyaan ke-${qIdx + 1}...`}
                  value={q.question}
                  onChange={(e) =>
                    setQuizDraft((prev) =>
                      prev.map((item, idx) => (idx === qIdx ? { ...item, question: e.target.value } : item))
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15 font-medium"
                />

                <div className="space-y-1.5">
                  <p className="text-[11px] text-[#6E5A50]">Pilihan Jawaban (pilih bulatan kunci jawaban benar):</p>
                  {q.options.map((opt, optIdx) => (
                    <div key={optIdx} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct_${qIdx}`}
                        checked={q.correctIndex === optIdx}
                        onChange={() =>
                          setQuizDraft((prev) =>
                            prev.map((item, idx) => (idx === qIdx ? { ...item, correctIndex: optIdx } : item))
                          )
                        }
                        className="accent-[#527362]"
                        aria-label={`Kunci jawaban soal ${qIdx + 1} opsi ${optIdx + 1}`}
                      />
                      <input
                        type="text"
                        required
                        placeholder={`Opsi ${optIdx + 1}`}
                        value={opt}
                        onChange={(e) =>
                          setQuizDraft((prev) =>
                            prev.map((item, idx) =>
                              idx === qIdx
                                ? {
                                    ...item,
                                    options: item.options.map((o, oi) => (oi === optIdx ? e.target.value : o)),
                                  }
                                : item
                            )
                          )
                        }
                        className="flex-1 px-3 py-1.5 rounded-lg bg-white border border-[#3D2C24]/15"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={() =>
                setQuizDraft((prev) => [
                  ...prev,
                  {
                    id: `q${prev.length + 1}_${Date.now().toString(36).slice(-3)}`,
                    question: '',
                    options: ['Pilihan A', 'Pilihan B', 'Pilihan C', 'Pilihan D'],
                    correctIndex: 0,
                  },
                ])
              }
              className="px-3.5 py-2 rounded-xl bg-[#F2EAE0] hover:bg-[#E7DDD0] text-[#3D2C24] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Tambah Pertanyaan Quiz</span>
            </button>

            <button
              type="submit"
              disabled={savingQuiz || quizDraft.length < 5}
              className="px-5 py-2.5 rounded-xl bg-[#6B8E7B] hover:bg-[#527362] text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingQuiz ? 'Menyimpan...' : 'Simpan Quiz Pemahaman'}</span>
            </button>
          </div>
        </form>
      )}

      {/* SUBTAB 3: GRUP WD.UP ACADEMY LINK & DURATION NOTE */}
      {subTab === 'group' && (
        <form
          onSubmit={handleSaveGroupLink}
          className="bg-white rounded-3xl border border-[#3D2C24]/10 p-5 space-y-4 text-xs"
        >
          <div>
            <h3 className="text-sm font-semibold text-[#3D2C24]">
              Pengaturan Link Aktif Grup WD.UP Academy & Durasi Pendampingan
            </h3>
            <p className="text-[11px] text-[#6E5A50]">
              Tautan aktif dan catatan durasi ini otomatis tampil di ruang kelas peserta yang sudah berstatus Paid.
            </p>
          </div>

          <div>
            <label className="block font-semibold text-[#3D2C24] mb-1">Pilih Kelas Academy</label>
            <select
              value={selectedClassId}
              onChange={(e) => handleSelectClass(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-[#3D2C24] mb-1">
              Tautan Link Aktif Grup WD.UP Academy (WhatsApp / Telegram / Discord)
            </label>
            <input
              type="url"
              value={groupLink}
              onChange={(e) => setGroupLink(e.target.value)}
              placeholder="https://chat.whatsapp.com/... atau https://t.me/..."
              className="w-full px-3 py-2.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#3D2C24] mb-1">
              Catatan Durasi Akses Grup (Note Durasi Ditentukan)
            </label>
            <input
              type="text"
              value={groupDurationNote}
              onChange={(e) => setGroupDurationNote(e.target.value)}
              placeholder="Contoh: Akses pendampingan grup aktif selama 90 hari sejak kelas terverifikasi Paid."
              className="w-full px-3 py-2.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15"
            />
          </div>

          <button
            type="submit"
            disabled={savingGroup}
            className="px-5 py-2.5 rounded-xl bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{savingGroup ? 'Menyimpan...' : 'Simpan Link & Durasi Grup'}</span>
          </button>
        </form>
      )}
    </div>
  );
}
