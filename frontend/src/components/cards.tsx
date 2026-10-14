"use client";

import { useRef, useState, type FormEvent } from "react";
import { AgentCard } from "@/components/deploy";
import type { MockAgent } from "@/lib/mock-agents";
import styles from "./deploy.module.css";

export function Cards({ cards, onAdd }: { cards: MockAgent[]; onAdd: (card: MockAgent) => void }) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const nameInput = useRef<HTMLInputElement>(null);

  function addCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const description = String(data.get("description") ?? "").trim();
    const endpoint = String(data.get("endpoint") ?? "").trim();
    setNotice("");

    if (!name || !description) {
      setError("Enter a name and description for your card.");
      return;
    }

    let url: URL;
    try {
      url = new URL(endpoint);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid endpoint");
    } catch {
      setError("Enter an HTTP or HTTPS endpoint URL without embedded credentials.");
      return;
    }

    const skills = [...new Set(String(data.get("skills") ?? "").split(",").map((skill) => skill.trim()).filter(Boolean))];
    onAdd({
      id: `custom-${crypto.randomUUID()}`,
      source: "custom",
      name,
      description,
      developer: String(data.get("developer") ?? "").trim() || "Demo user",
      skills,
      endpointUrl: url.href,
      pricing: null,
      rating: null,
      reviewCount: 0,
      status: "available",
      identity: { kind: "local" },
      paymentMode: "none",
    });
    setError("");
    setNotice(`${name} added to your cards.`);
    form.reset();
    nameInput.current?.focus();
  }

  return (
    <div className={styles.view}>
      <div className={styles.content}>
        <section className={styles.section} aria-labelledby="add-card-heading">
          <div className={styles.sectionHeading}><h2 id="add-card-heading">Add your card</h2></div>
          <p id="card-note" className={styles.sectionDescription}>Create an agent card for your workspace. Cards stay in this session and clear on reload or sign-out. Adding a card does not deploy or connect the agent.</p>
          <form className={`${styles.card} ${styles.cardForm}`} onSubmit={addCard} aria-describedby="card-note" onChange={() => { setError(""); setNotice(""); }}>
            <div className="field-group"><label htmlFor="card-name">Card name</label><input ref={nameInput} id="card-name" name="name" placeholder="My assistant" maxLength={100} required /></div>
            <div className="field-group"><label htmlFor="card-description">Description</label><textarea id="card-description" name="description" placeholder="What does your agent do?" rows={3} maxLength={1000} required /></div>
            <div className="field-group"><label htmlFor="card-developer">Developer (optional)</label><input id="card-developer" name="developer" placeholder="Demo user" maxLength={100} /></div>
            <div className="field-group"><label htmlFor="card-skills">Skills (optional)</label><input id="card-skills" name="skills" placeholder="Research, writing, coding" maxLength={500} aria-describedby="card-skills-note" /><p id="card-skills-note" className={styles.sectionDescription}>Separate skills with commas.</p></div>
            <div className="field-group"><label htmlFor="card-endpoint">Endpoint URL</label><input id="card-endpoint" name="endpoint" type="url" placeholder="http://127.0.0.1:2000/eve/v1/session" maxLength={2048} required /></div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="primary-button">Add card</button>
          </form>
          <p role="status" aria-live="polite" className={styles.sectionDescription}>{notice}</p>
        </section>
        <section className={styles.section} aria-labelledby="your-cards-heading">
          <div className={styles.sectionHeading}><h2 id="your-cards-heading">Your cards</h2><span>{cards.length} {cards.length === 1 ? "card" : "cards"}</span></div>
          {cards.length ? <div className={styles.grid}>{cards.map((card) => <AgentCard key={card.id} agent={card} />)}</div> : <div className={styles.empty}><h3>No cards yet</h3><p>Add your first agent card using the form above.</p></div>}
        </section>
      </div>
    </div>
  );
}
