import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { BotIcon, SendIcon } from '../components/Icons';

interface Msg {
  role: 'user' | 'bot';
  text: string;
}

const SUGGESTIONS = ['Best pair right now?', 'Which expiration?', 'How do I manage risk?'];

export default function AssistantScreen() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'bot', text: 'Hi! I am your Trades AI assistant. Ask me about pairs, timeframes, or strategy. 📈' },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    setMessages((m) => [...m, { role: 'user', text: trimmed }]);
    setInput('');
    setThinking(true);
    try {
      const { reply } = await api.assistant(trimmed);
      setMessages((m) => [...m, { role: 'bot', text: reply }]);
    } catch {
      setMessages((m) => [...m, { role: 'bot', text: 'Sorry, I had trouble responding. Try again.' }]);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-180px)]">
      <div className="flex items-center gap-2 pb-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan/15 border border-cyan/30 text-cyan">
          <BotIcon className="h-5 w-5" />
        </span>
        <div>
          <div className="font-bold text-white leading-tight">AI Assistant</div>
          <div className="text-xs text-success">● online</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-electric text-white rounded-br-sm'
                  : 'card rounded-bl-sm text-slate-200'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="card rounded-bl-sm px-4 py-3">
              <span className="flex gap-1">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="h-2 w-2 rounded-full bg-cyan animate-bounce"
                    style={{ animationDelay: `${d * 120}ms` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 py-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 pt-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about trading…"
          className="input-dark flex-1"
        />
        <button type="submit" disabled={!input.trim() || thinking} className="btn-cyan h-12 w-12 shrink-0 !rounded-xl">
          <SendIcon className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}
