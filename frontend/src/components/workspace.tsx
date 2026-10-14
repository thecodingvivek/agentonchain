"use client";

import { Deploy } from "@/components/deploy";
import { useEffect, useRef, useState, type FormEvent } from "react";

function Icon({ name }: { name: "chat" | "deploy" | "send" | "logout" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === "chat" && <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 2 2-5a8.5 8.5 0 1 1 18-5.5Z" />}
      {name === "deploy" && <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>}
      {name === "send" && <path d="M12 19V5m-6 6 6-6 6 6" />}
      {name === "logout" && <><path d="M9 4H4v16h5M9 12h12m-4-4 4 4-4 4" /></>}
    </svg>
  );
}

export function Workspace({ onSignOut }: { onSignOut: () => void }) {
  const [section, setSection] = useState<"chat" | "deploy">("chat");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
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
  }, [messages.length, section]);

  function sendMessage(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const message = draft.trim();
    if (!message) return;
    setMessages((current) => [...current, message]);
    setDraft("");
    composer.current?.focus();
  }

  return (
    <main className="workspace">
      <aside className="sidebar" aria-label="Workspace sidebar">
        <div className="brand sidebar-brand"><span className="sidebar-brand-name">agentonchain.</span><span className="sidebar-brand-short" aria-hidden="true">a.</span></div>
        <nav className="workspace-nav" aria-label="Main navigation">
          <button type="button" className={`nav-item ${section === "chat" ? "active" : ""}`} aria-current={section === "chat" ? "page" : undefined} onClick={() => setSection("chat")}><Icon name="chat" /><span>Chat</span></button>
          <button type="button" className={`nav-item ${section === "deploy" ? "active" : ""}`} aria-current={section === "deploy" ? "page" : undefined} onClick={() => setSection("deploy")}><Icon name="deploy" /><span>Deploy</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-profile"><span className="avatar" aria-hidden="true">D</span><div><strong>Demo user</strong><span>Local workspace</span></div></div>
          <button className="nav-item signout" type="button" onClick={onSignOut}><Icon name="logout" /><span>Sign out</span></button>
        </div>
      </aside>

      <section className="workspace-main" aria-labelledby="section-heading">
        <header className="workspace-header"><h1 id="section-heading">{section === "chat" ? "Chat" : "Deploy"}</h1><span className="prototype-badge">Local prototype</span></header>
        {section === "chat" ? (
          <div className="chat-view">
            <div className="conversation" ref={conversation}>
              {messages.length === 0 ? (
                <div className="chat-welcome">
                  <h2>What are we working on?</h2>
                  <p>A question, an idea, a task.<br />Start a conversation with your agent workspace.</p>
                </div>
              ) : (
                <div className="message-list" role="log" aria-label="Chat messages" aria-live="polite" aria-relevant="additions">
                  {messages.map((message, index) => <article key={index} className="user-message"><span className="message-author">You</span><p>{message}</p></article>)}
                </div>
              )}
            </div>
            <div className="composer-area">
              <form className="chat-form" onSubmit={sendMessage}>
                <label htmlFor="chat-message">Message</label>
                <div className="chat-composer">
                  <textarea ref={composer} id="chat-message" name="message" rows={1} placeholder="Ask anything, or describe a task…" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); sendMessage(); }
                  }} aria-describedby="composer-note" />
                  <div className="composer-toolbar"><span className="composer-hint">Shift + Enter for a new line</span><button type="submit" className="send-button" disabled={!draft.trim()} aria-label="Send message"><Icon name="send" /></button></div>
                </div>
              </form>
              <p id="composer-note" className="composer-note">Messages stay in this session. AI isn’t connected yet.</p>
            </div>
          </div>
        ) : (
          <Deploy />
        )}
      </section>
    </main>
  );
}
