"use client";

import { useState } from "react";
import { exploreAgents, searchMockAgents, type MockAgent } from "@/lib/mock-agents";
import { formatAmount } from "@/lib/format-amount";
import styles from "./deploy.module.css";

export function AgentCard({ agent }: { agent: MockAgent }) {
  const initials = agent.name.split(" ").map((word) => word[0]).join("");
  return (
    <article className={styles.card} aria-labelledby={`agent-${agent.id}`}>
      <div className={styles.cardTop}>
        <span className={styles.agentAvatar} aria-hidden="true">{initials}</span>
        <span className={styles.badge}>{agent.source === "custom" ? "Your card" : agent.source === "local" ? "Local agent" : `${agent.status === "deployed" ? "Deployed" : "Available"} · Mock`}</span>
      </div>
      <h3 id={`agent-${agent.id}`} className={styles.agentName}>{agent.name}</h3>
      <p className={styles.developer}>By {agent.developer}</p>
      <p className={styles.description}>{agent.description}</p>
      <ul className={styles.skills} aria-label={`${agent.name} skills`}>
        {agent.skills.map((skill) => <li key={skill}>{skill}</li>)}
      </ul>
      <dl className={styles.pricing}>
        <div><dt>Input token</dt><dd>{agent.pricing ? <>{formatAmount(agent.pricing.inputPerToken, agent.pricing.currency)}<span>USD / token</span></> : "Not configured"}</dd></div>
        <div><dt>Output token</dt><dd>{agent.pricing ? <>{formatAmount(agent.pricing.outputPerToken, agent.pricing.currency)}<span>USD / token</span></> : "Not configured"}</dd></div>
      </dl>
      <div className={styles.rating}>{agent.rating === null ? <span>No reviews yet</span> : <><strong>{agent.rating.toFixed(1)} / 5</strong><span>{agent.reviewCount} mock reviews</span></>}</div>
      <details className={styles.details}>
        <summary>View agent details</summary>
        <dl>
          <div><dt>Identity</dt><dd>{agent.identity.kind === "mock-erc8004" ? `Mock ERC-8004 · #${agent.identity.agentId}` : "Local only · Not on-chain"}</dd></div>
          <div><dt>Payment</dt><dd>{agent.paymentMode === "none" ? "No payments configured" : "Simulated at agent endpoint"}</dd></div>
          {agent.source === "local" && <div><dt>Local server</dt><dd><code>{new URL(agent.endpointUrl).origin}</code><span>Start the backend before sending a query.</span></dd></div>}
          <div><dt>Endpoint URL</dt><dd><code>{agent.endpointUrl}</code></dd></div>
        </dl>
      </details>
    </article>
  );
}

export function Deploy() {
  const [query, setQuery] = useState("");
  const matches = searchMockAgents(exploreAgents, query);
  return (
    <div className={styles.view}>
      <div className={styles.content}>
        <div className={styles.notice}><span className={styles.badge}>Local registry</span><p>The Agentonchain assistant runs on your local backend.</p></div>
        <section className={styles.section} aria-labelledby="explore-heading">
          <div className={styles.sectionHeading}><h2 id="explore-heading">Explore agents</h2><span role="status" aria-live="polite">{matches.length} {matches.length === 1 ? "agent" : "agents"}</span></div>
          <p className={styles.sectionDescription}>Find a specialist for your next task.</p>
          <div className={styles.search}>
            <label htmlFor="agent-search">Search agents</label>
            <input id="agent-search" type="search" name="agent-search" placeholder="Search by name or skill" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          {matches.length > 0 ? <div className={styles.grid}>{matches.map((agent) => <AgentCard key={agent.id} agent={agent} />)}</div> : (
            <div className={styles.empty}><h3>No matching agents</h3><p>Try a different name or skill.</p><button type="button" onClick={() => setQuery("")}>Clear search</button></div>
          )}
        </section>
      </div>
    </div>
  );
}
