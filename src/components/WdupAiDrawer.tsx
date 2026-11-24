import React, { useState } from 'react';
import { Send, Sparkles, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';

interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

export function WdupAiDrawer() {
  const { aiDrawerOpen, setAiDrawerOpen, user } = useAuth();
  const [messages, setMessages] = useState<ChatTurn[]>([
    {
      role: 'model',
      text: 'Halo! Saya WD.UP AI, pemandu penggunaan website WD.UP. Tanyakan apa saja tentang fitur WD.UP Home, cara belajar di Academy, berbelanja di Market, membuka toko & affiliate di My Store, atau menggunakan Creator Studio.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  if (!aiDrawerOpen) return null;

  const quickPrompts = [
    'Bagaimana cara membeli produk atau kelas di WD.UP?',
    'Bagaimana cara membuka toko atau jadi affiliate di My Store?',
    'Apa saja fitur yang tersedia di WD.UP Academy & Creator Studio?',
  ];

  const sendMessage = async (questionText: string) => {
    const q = questionText.trim();
    if (!q || loading) return;
    const nextHistory = [...messages, { role: 'user' as const, text: q }];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);
    try {
      const res = await apiFetch<{ answer: string }>('/api/ai/assistant', {
        method: 'POST',
        body: JSON.stringify({ question: q, history: messages }),
      });
      setMessages([...nextHistory, { role: 'model', text: res.answer }]);
    } catch (err) {
      setMessages([
        ...nextHistory,
        {
          role: 'model',
          text:
            err instanceof Error
              ? `Maaf, terjadi kendala saat menghubungi WD.UP AI: ${err.message}`
              : 'Maaf, layanan sedang sibuk.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end bg-[#3D2C24]/45 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-md h-[86vh] sm:h-[620px] bg-[#FAF6F0] rounded-t-3xl sm:rounded-3xl border border-[#3D2C24]/15 shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-[#3D2C24] text-[#FAF6F0]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#B8A9C9]/25 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-[#F3C669]" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold">WD.UP AI Assistant</h2>
              <p className="text-[11px] text-[#FAF6F0]/75">
                Pemandu Fitur & Penggunaan Website {user ? `· ${user.name}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => setAiDrawerOpen(false)}
            className="min-h-[40px] min-w-[40px] rounded-full hover:bg-white/10 flex items-center justify-center cursor-pointer"
            aria-label="Tutup WD.UP AI"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, idx) => (
            <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                  m.role === 'user'
                    ? 'bg-[#3D2C24] text-[#FAF6F0]'
                    : 'bg-white border border-[#3D2C24]/10 text-[#3D2C24]'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-3 bg-white border border-[#3D2C24]/10 text-xs text-[#6E5A50]">
                WD.UP AI sedang memeriksa panduan resmi...
              </div>
            </div>
          )}

          {messages.length <= 2 && (
            <div className="pt-2 space-y-1.5">
              <p className="text-[11px] font-semibold text-[#6E5A50]">Pertanyaan Populer:</p>
              {quickPrompts.map((qp) => (
                <button
                  key={qp}
                  onClick={() => sendMessage(qp)}
                  className="block w-full text-left text-xs px-3 py-2 rounded-xl bg-[#F2EAE0] hover:bg-[#E7DDD0] text-[#3D2C24] transition-colors cursor-pointer"
                >
                  {qp}
                </button>
              ))}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="p-3 border-t border-[#3D2C24]/10 bg-white flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tanyakan panduan fitur WD.UP..."
            className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-sm focus:outline-none focus:ring-2 focus:ring-[#6B8E7B]"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="min-h-[42px] min-w-[42px] rounded-xl bg-[#6B8E7B] hover:bg-[#527362] text-white flex items-center justify-center disabled:opacity-50 cursor-pointer"
            aria-label="Kirim pesan"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
