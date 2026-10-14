"use client";

import { Deploy } from "@/components/deploy";
import { Cards } from "@/components/cards";
import type { MockAgent } from "@/lib/mock-agents";
import type { ChatEvent } from "@/lib/chat-stream";
import { readNdjson } from "@/lib/ndjson";
import { useEffect, useRef, useState, type FormEvent } from "react";

function Icon({ name }: { name: "chat" | "deploy" | "cards" | "send" | "logout" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === "chat" && <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 2 2-5a8.5 8.5 0 1 1 18-5.5Z" />}
      {name === "deploy" && <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>}
      {name === "cards" && <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 10h4m-4 4h10" /></>}
      {name === "send" && <path d="M12 19V5m-6 6 6-6 6 6" />}
      {name === "logout" && <><path d="M9 4H4v16h5M9 12h12m-4-4 4 4-4 4" /></>}
    </svg>
  );
}

export function Workspace({ onSignOut }: { onSignOut: () => void }) {
  const [section, setSection] = useState<"chat" | "deploy" | "cards">("chat");
  const [cards, setCards] = useState<MockAgent[]>([]);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<{ id: string; role: "user" | "assistant"; text: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const session = useRef<{ sessionId?: string; streamIndex: number }>({ streamIndex: 0 });
  const pendingRequest = useRef<AbortController | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const conversation = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (composer.current) {
      composer.current.style.height = "auto";
      composer.current.style.height = `${composer.current.scrollHeight}px`;
    }
  }, [draft, section]);

  useEffect(() => {
    if (messages.length) conversation.current?.scrollTo({ top: conversation.current.scrollHeight });
  }, [messages, section]);

  useEffect(() => () => pendingRequest.current?.abort(), []);

  async function sendMessage(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const message = draft.trim();
    if (!message || pendingRequest.current) return;
    const controller = new AbortController();
    pendingRequest.current = controller;
    const replyId = crypto.randomUUID();
    setSending(true);
    setChatError("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: message }, { id: replyId, role: "assistant", text: "" }]);
    setDraft("");
    composer.current?.focus();
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, ...session.current }), signal: controller.signal,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        if (result.resetSession) session.current = { streamIndex: 0 };
        throw new Error(result.error || "Could not send your message. Try again.");
      }
      if (!response.body) throw new Error("The agent returned no response stream.");
      let completed = false;
      for await (const event of readNdjson<ChatEvent>(response.body)) {
        if (event.type === "session") session.current.sessionId = event.sessionId;
        else {
          session.current.streamIndex = Math.max(session.current.streamIndex, event.streamIndex);
          if (event.type === "text") setMessages((current) => current.map((item) => item.id === replyId ? { ...item, text: event.text } : item));
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "done") completed = true;
        }
      }
      if (!completed) throw new Error("The agent connection ended before the reply finished.");
    } catch (error) {
      if (!controller.signal.aborted) {
        setChatError(error instanceof Error ? error.message : "Could not reach the chat agent.");
        setMessages((current) => current.filter((item) => item.id !== replyId || item.text));
      }
    } finally {
      if (pendingRequest.current === controller) {
        pendingRequest.current = null;
        setSending(false);
      }
    }
  }

  return (
    <main className="workspace">
      <aside className="sidebar" aria-label="Workspace sidebar">
        <div className="brand sidebar-brand"><span className="sidebar-brand-name">agentonchain.</span><span className="sidebar-brand-short" aria-hidden="true">a.</span></div>
        <nav className="workspace-nav" aria-label="Main navigation">
          <button type="button" className={`nav-item ${section === "chat" ? "active" : ""}`} aria-current={section === "chat" ? "page" : undefined} onClick={() => setSection("chat")}><Icon name="chat" /><span>Chat</span></button>
          <button type="button" className={`nav-item ${section === "deploy" ? "active" : ""}`} aria-current={section === "deploy" ? "page" : undefined} onClick={() => setSection("deploy")}><Icon name="deploy" /><span>Deploy</span></button>
          <button type="button" className={`nav-item ${section === "cards" ? "active" : ""}`} aria-current={section === "cards" ? "page" : undefined} onClick={() => setSection("cards")}><Icon name="cards" /><span>Cards</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-profile"><span className="avatar" aria-hidden="true">D</span><div><strong>Demo user</strong><span>Local workspace</span></div></div>
          <button className="nav-item signout" type="button" onClick={onSignOut}><Icon name="logout" /><span>Sign out</span></button>
        </div>
      </aside>

      <section className="workspace-main" aria-labelledby="section-heading">
        <header className="workspace-header"><h1 id="section-heading">{section === "chat" ? "Chat" : section === "deploy" ? "Deploy" : "Cards"}</h1><span className="prototype-badge">Local prototype</span></header>
        {section === "chat" ? (
          <div className="chat-view">
            <div className="conversation" ref={conversation}>
              {messages.length === 0 ? (
                <div className="chat-welcome">
                  <h2>What are we working on?</h2>
                  <p>A question, an idea, a task.<br />Start a conversation with Chat agent.</p>
                </div>
              ) : (
                <div className="message-list" role="log" aria-label="Chat messages" aria-live="polite" aria-relevant="additions">
                  {messages.map((message) => <article key={message.id} className={message.role === "user" ? "user-message" : "assistant-message"}><span className="message-author">{message.role === "user" ? "You" : "Chat agent"}</span><p>{message.text || "Thinking…"}</p></article>)}
                </div>
              )}
            </div>
            <div className="composer-area">
              <form className="chat-form" onSubmit={sendMessage}>
                <label htmlFor="chat-message">Message</label>
                <div className="chat-composer">
                  <textarea ref={composer} id="chat-message" name="message" rows={1} maxLength={8000} placeholder="Ask anything, or describe a task…" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); sendMessage(); }
                  }} aria-describedby="composer-note" />
                  <div className="composer-toolbar"><span className="composer-hint">{sending ? "Chat agent is replying…" : "Shift + Enter for a new line"}</span><button type="submit" className="send-button" disabled={sending || !draft.trim()} aria-label="Send message"><Icon name="send" /></button></div>
                </div>
              </form>
              {chatError && <p className="form-error" role="alert">{chatError}</p>}
              <p id="composer-note" className="composer-note" role="status">{sending ? "Waiting for Chat agent." : "Chat agent · Messages stay in this session."}</p>
            </div>
          </div>
        ) : section === "deploy" ? (
          <Deploy />
        ) : (
          <Cards cards={cards} onAdd={(card) => setCards((current) => [...current, card])} />
        )}
      </section>
    </main>
  );
}
