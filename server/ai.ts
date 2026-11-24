import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { db } from './db.js';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi pada server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function generateWithFallback(
  ai: GoogleGenAI,
  contents: unknown,
  systemInstruction: string
): Promise<string> {
  const models = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;
  let lastError: unknown;

  for (const model of models) {
    try {
      const apiPromise = ai.models.generateContent({
        model,
        contents: contents as never,
        config: {
          systemInstruction,
          ...(model === 'gemini-4-hydrogen'
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
        },
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI_TIMEOUT')), 6000)
      );
      const response = await Promise.race([apiPromise, timeoutPromise]);
      const txt = (response.text || '').trim();
      if (txt) return txt;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('AI_UNAVAILABLE');
}

function buildKnowledgeBaseFallback(
  question: string,
  kbRows: Array<{ topic: string; title: string; content: string }>
): string {
  const qWords = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  const scored = kbRows
    .map((row) => {
      const hay = `${row.topic} ${row.title} ${row.content}`.toLowerCase();
      let score = 0;
      for (const w of qWords) {
        if (hay.includes(w)) score += 1;
      }
      return { row, score };
    })
    .sort((a, b) => b.score - a.score);

  const top = scored.filter((s) => s.score > 0).slice(0, 2);
  const chosen = top.length > 0 ? top.map((t) => t.row) : kbRows.slice(0, 2);

  const bullets = chosen.map((r) => `• **${r.title}**: ${r.content}`).join('\n\n');
  return `Berikut panduan resmi fitur WD.UP yang paling relevan untuk pertanyaan Anda:\n\n${bullets}\n\nJika butuh bantuan lebih lanjut terkait pesanan atau akun, silakan hubungi Tim WD.UP melalui kontak resmi di bagian bawah halaman WD.UP Home.`;
}

function buildCreatorTemplateFallback(params: {
  mode: string;
  topic: string;
  audience: string;
  tone: string;
}): string {
  const aud = params.audience || 'perempuan muda, kreator pemula, dan pekerja kreatif digital';
  const tone = params.tone || 'hangat, suportif, dan autentik';
  return `[Draf Terstruktur Studio WD.UP — Mode: ${params.mode}]
Topik: ${params.topic}
Audiens: ${aud}
Gaya Bahasa: ${tone}

1. Hook Pembuka (3 detik pertama):
"Masih bingung mulai ${params.topic} dari mana tanpa terasa kewalahan? Ini langkah simpel yang bisa langsung kamu praktikkan hari ini."

2. Poin Inti Materi:
• Masalah utama yang sering dialami ${aud} terkait ${params.topic}.
• 3 langkah praktis yang realistis dilakukan dari rumah atau sela aktivitas harian.
• Contoh hasil nyata / template sederhana yang memudahkan eksekusi.

3. Penutup & CTA Lembut:
"Mulai pelan-pelan dari satu langkah kecil hari ini. Simpan postingan ini atau cek tautan di toko WD.UP untuk panduan lengkapnya."

(Catatan: Layanan AI eksternal sedang padat, sehingga draf ini disiapkan otomatis oleh templat WD.UP Creator Studio dan siap langsung Anda sesuaikan.)`;
}

export async function askWdupAssistant(params: {
  question: string;
  history: Array<{ role: 'user' | 'model'; text: string }>;
  userContext?: {
    name: string;
    role: string;
    ordersSummary: string;
    enrollmentsCount: number;
    hasStore: boolean;
  } | null;
}): Promise<string> {
  const kbRows = db
    .prepare(`SELECT topic, title, content FROM ai_knowledge_base ORDER BY topic ASC`)
    .all() as Array<{ topic: string; title: string; content: string }>;

  const kbText = kbRows.map((r) => `### [${r.topic}] ${r.title}\n${r.content}`).join('\n\n');

  const userSummary = params.userContext
    ? `\nKONTEKS PENGGUNA SAAT INI:\n- Nama: ${params.userContext.name}\n- Memiliki Toko: ${params.userContext.hasStore ? 'Ya' : 'Belum'}\n- Kelas Diikuti: ${params.userContext.enrollmentsCount}\n- Ringkasan Pesanan Terbaru: ${params.userContext.ordersSummary || 'Belum ada pesanan'}`
    : `\nPENGGUNA SAAT INI: Pengunjung.`;

  const systemInstruction = `Kamu adalah WD.UP AI, asisten pemandu ramah untuk website WD.UP (Women Digital Level Up).
Peranmu HANYA memperkenalkan fitur-fitur WD.UP dan membantu pengunjung maupun member cara menggunakan website dengan jelas, hangat, dan praktis dalam bahasa Indonesia.

ATURAN KETAT (WAJIB DIPATUHI):
1. Fokus hanya pada pengenalan fitur publik (WD.UP Home, WD.UP Academy, WD.UP Market, My Account, My Store & Affiliate, Creator Studio) dan langkah penggunaan website berdasarkan PANDUAN PENGGUNA WD.UP di bawah ini.
2. JAGA KERAHASIAAN INTERNAL ("rahasia dapur"): DILARANG KERAS mengungkap atau membahas arsitektur teknis, database, skema tabel, endpoint API, mekanisme keamanan/autentikasi, alur dapur/panel internal tim, log sistem, status internal server, atau kebijakan operasional internal. Jika ditanya hal teknis atau internal di balik layar, jawab dengan sopan bahwa hal tersebut merupakan sistem internal dan fokus bantu cara memakai fitur website yang tersedia.
3. GANTI KATA "ADMIN" MENJADI "TIM WD.UP" / "TIM": Jangan pernah menggunakan kata "admin" atau "administrator" saat menyebut pengelola platform; selalu gunakan sebutan "Tim WD.UP" atau "tim kami".
4. Jangan mengarang fitur atau menjanjikan hal di luar panduan. Jika butuh bantuan lanjutan terkait transaksi atau akun, arahkan pengguna menghubungi Tim WD.UP melalui kontak resmi di bagian bawah halaman WD.UP Home.
5. Jawab ringkas, terstruktur dalam poin praktis, maksimal 200 kata per jawaban.

PANDUAN PENGGUNA WD.UP:
${kbText}
${userSummary}`;

  const contents = [
    ...params.history.slice(-6).map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    })),
    { role: 'user' as const, parts: [{ text: params.question }] },
  ];

  try {
    const ai = getAiClient();
    return await generateWithFallback(ai, contents, systemInstruction);
  } catch {
    return buildKnowledgeBaseFallback(params.question, kbRows);
  }
}

export async function generateCreatorContent(params: {
  mode: string;
  topic: string;
  audience: string;
  tone: string;
}): Promise<string> {
  const systemInstruction = `Kamu adalah AI Creator WD.UP di dalam My Creator Studio untuk membantu perempuan content creator, seller produk digital, dan affiliate di ekosistem WD.UP.
Hasilkan output yang langsung siap pakai, hangat, autentik, tidak berlebihan (anti-clickbait), dan terstruktur rapi dalam Bahasa Indonesia. Maksimal 400 kata.`;

  const prompt = `Mode: ${params.mode}
Topik / Produk: ${params.topic}
Target Audiens: ${params.audience || 'Perempuan muda, kreator pemula, dan pekerja kreatif digital'}
Gaya Bahasa: ${params.tone || 'Hangat, profesional, suportif, dan jelas'}

Buatkan materi kreatif lengkap sesuai mode di atas dengan struktur yang rapi dan langkah CTA yang relevan.`;

  try {
    const ai = getAiClient();
    return await generateWithFallback(ai, prompt, systemInstruction);
  } catch {
    return buildCreatorTemplateFallback(params);
  }
}
