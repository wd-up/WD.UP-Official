import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { asc } from 'drizzle-orm';
import { db } from '../src/db/index.ts';
import { aiKnowledgeBase } from '../src/db/schema.ts';

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
  const tone = params.tone || 'hangat, suportif, dan persuasif';
  return `[Draf Produk AI Creator WD.UP — Mode: ${params.mode}]
Produk / Topik: ${params.topic}
Target Pembeli: ${aud}
Gaya Bahasa: ${tone}

• Judul Menarik:
"${params.topic} — Panduan & Template Praktis Siap Pakai"

• Ringkasan Manfaat Utama:
Dirancang khusus untuk ${aud} yang ingin mulai lebih terarah tanpa ribet. Langsung bisa diakses setelah pembayaran terverifikasi dan mudah diterapkan dalam aktivitas harian.

• Yang Anda Dapatkan:
1. Materi & panduan terstruktur langkah demi langkah.
2. Template praktis yang bisa langsung disesuaikan dengan kebutuhan Anda.
3. Tips eksekusi cepat agar hasil langsung terasa sejak hari pertama.

• Ajakan Aksi (CTA):
"Siap naik level hari ini? Klik tombol beli sekarang dan mulai praktikkan ${params.topic} versi terbaikmu."`;
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
  let kbRows: Array<{ topic: string; title: string; content: string }> = [];
  try {
    kbRows = await db
      .select({
        topic: aiKnowledgeBase.topic,
        title: aiKnowledgeBase.title,
        content: aiKnowledgeBase.content,
      })
      .from(aiKnowledgeBase)
      .orderBy(asc(aiKnowledgeBase.topic));
  } catch (err) {
    console.error('Failed to load AI knowledge base:', err);
  }

  const kbText = kbRows.map((r) => `### [${r.topic}] ${r.title}\n${r.content}`).join('\n\n');

  const userSummary = params.userContext
    ? `\nKONTEKS PENGGUNA SAAT INI:\n- Nama: ${params.userContext.name}\n- Memiliki Toko: ${params.userContext.hasStore ? 'Ya' : 'Belum'}\n- Kelas Diikuti: ${params.userContext.enrollmentsCount}\n- Ringkasan Pesanan Terbaru: ${params.userContext.ordersSummary || 'Belum ada pesanan'}`
    : `\nPENGGUNA SAAT INI: Pengunjung.`;

  const systemInstruction = `Kamu adalah WD.UP AI, asisten pemandu ramah untuk website WD.UP (Women Digital Level Up).
Peranmu HANYA memperkenalkan fitur-fitur WD.UP dan membantu pengunjung maupun member cara menggunakan website dengan jelas, hangat, dan praktis dalam bahasa Indonesia.

ATURAN KETAT (WAJIB DIPATUHI):
1. Fokus hanya pada pengenalan fitur publik (WD.UP Home, WD.UP Academy, WD.UP Market, My Account, My Store & Affiliate, serta fitur WD.UP Pro seperti AI Creator Produk) dan langkah penggunaan website berdasarkan PANDUAN PENGGUNA WD.UP di bawah ini.
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
  const systemInstruction = `Kamu adalah AI Creator WD.UP khusus Seller WD.UP Pro di dalam form penambahan produk My Store.
Tugasmu membantu seller merancang judul produk, deskripsi produk yang menjual, poin manfaat (highlight), dan copy promosi untuk produk digital atau jasa profesional.
Hasilkan teks yang langsung siap tempel (copy-paste) ke deskripsi/judul produk, hangat, autentik, jelas, anti-clickbait, dan terstruktur rapi dalam Bahasa Indonesia. Maksimal 320 kata.`;

  const prompt = `Mode Penulisan: ${params.mode}
Nama / Ide Produk: ${params.topic}
Target Pembeli: ${params.audience || 'Perempuan muda, kreator pemula, dan pekerja kreatif digital'}
Gaya Bahasa: ${params.tone || 'Hangat, profesional, persuasif, dan jelas'}

Buatkan materi siap pakai sesuai mode di atas agar mudah langsung diterapkan pada halaman produk.`;

  try {
    const ai = getAiClient();
    return await generateWithFallback(ai, prompt, systemInstruction);
  } catch {
    return buildCreatorTemplateFallback(params);
  }
}
