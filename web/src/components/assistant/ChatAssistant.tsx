"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { askAssistant } from "@/server/actions/assistant";

type Message = { role: "user" | "assistant"; text: string };

const GREETING: Message = {
  role: "assistant",
  text: "Ask me about your data — stock levels, supplier balances, sales, production, wastage, or a recipe's cost.",
};

export function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, pending]);

  function send() {
    const question = input.trim();
    if (!question || pending) return;
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    startTransition(async () => {
      const result = await askAssistant(question);
      setMessages((m) => [...m, { role: "assistant", text: result.answer }]);
    });
  }

  return (
    <>
      <button type="button" className="assistant-fab" onClick={() => setOpen((v) => !v)} aria-label="Chat Assistant">
        {open ? "✕" : "💬"}
      </button>
      {open && (
        <div className="assistant-panel">
          <div className="assistant-head">
            <b>Assistant</b>
            <span>Read-only Q&A over your live data</span>
          </div>
          <div className="assistant-messages" ref={listRef}>
            {messages.map((m, i) => (
              <div key={i} className={`assistant-bubble ${m.role}`}>{m.text}</div>
            ))}
            {pending && <div className="assistant-bubble assistant assistant-typing">…</div>}
          </div>
          <div className="assistant-input-row">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              placeholder="e.g. what's low on stock?"
              disabled={pending}
            />
            <button type="button" className="btn accent" onClick={send} disabled={pending || !input.trim()}>
              Ask
            </button>
          </div>
        </div>
      )}
    </>
  );
}
