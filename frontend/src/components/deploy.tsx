"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RegistryAgent, RegistryPage } from "@/lib/registry-agents";
import styles from "./deploy.module.css";
import { RegisterAgent } from "./register-agent";

function AgentCard({ agent }: { agent: RegistryAgent }) {
  const initials = agent.name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("") || "A";
  return (
    <article className={styles.card} aria-labelledby={`agent-${agent.id}`}>
      <div className={styles.cardTop}>
        <span className={styles.agentAvatar} aria-hidden="true">{initials}</span>
        <span className={styles.badge}>{agent.active ? "Active" : "Inactive"} · #{agent.id}</span>
      </div>
      <h3 id={`agent-${agent.id}`} className={styles.agentName}>{agent.name}</h3>
      <p className={styles.developer}>Registered on Base Sepolia</p>
      <p className={styles.description}>{agent.description || "No description added yet."}</p>
      <dl className={styles.walletDetails}>
        <div><dt>Payment wallet</dt><dd>{agent.wallet}</dd></div>
        <div><dt>Agent endpoint</dt><dd>{agent.endpointUrl || "No endpoint added yet."}</dd></div>
      </dl>
      <details className={`${styles.details} ${styles.registryDetails}`}>
        <summary>View registry details</summary>
        <dl>
          <div><dt>Entry owner</dt><dd>{agent.owner}</dd></div>
          <div><dt>Registration</dt><dd>Public directory entry. Identity and endpoint availability have not been verified.</dd></div>
          <div><dt>Pricing</dt><dd>Not stored in this registry.</dd></div>
        </dl>
      </details>
    </article>
  );
}

export function Deploy() {
  const [query, setQuery] = useState("");
  const [registering, setRegistering] = useState(false);
  const [page, setPage] = useState<RegistryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);

  const fetchPage = useCallback(async (offset: string, controller: AbortController) => {
    if (controller.signal.aborted) return;
    try {
      const response = await fetch(`/api/agents?offset=${offset}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not fetch registered agents.");
      if (!Array.isArray(result.agents)) throw new Error("The registry returned an invalid response.");
      if (controller.signal.aborted) return;
      const next = result as RegistryPage;
      setPage((current) => offset === "0" || !current ? next : {
        ...next,
        agents: [...current.agents.filter((agent) => !next.agents.some((entry) => entry.id === agent.id)), ...next.agents],
      });
      setUpdatedAt(new Date().toLocaleTimeString());
      setError("");
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not fetch registered agents.");
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    pending.current = controller;
    void Promise.resolve().then(() => fetchPage("0", controller));
    return () => { pending.current?.abort(); pending.current = null; };
  }, [fetchPage]);

  function load(offset = "0") {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError("");
    void fetchPage(offset, controller);
  }

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (page?.agents ?? []).filter((agent) => {
    const text = [agent.id, agent.name, agent.description, agent.wallet, agent.owner, agent.endpointUrl].join(" ").toLowerCase();
    return terms.every((term) => text.includes(term));
  });

  return (
    <div className={styles.view}>
      <div className={styles.content}>
        <div className={styles.notice}><span className={styles.badge}>Base Sepolia</span><p>Discover agents registered on-chain.</p></div>
        <section className={styles.section} aria-labelledby="explore-heading" aria-busy={loading}>
          <div className={styles.sectionHeading}>
            <h2 id="explore-heading">Explore agents</h2>
            <div className={styles.actions}>
              <button className={styles.secondaryButton} type="button" disabled={loading} onClick={() => load()} aria-label="Refresh agents">Refresh agents</button>
              {!registering && <button className={`primary-button ${styles.deployButton}`} type="button" disabled={!page} onClick={() => setRegistering(true)}>Deploy agent</button>}
            </div>
          </div>
          <p className={styles.sectionDescription}>Agent names, wallets, and endpoints come from the deployed registry. Active status is set by the entry owner.</p>
          {page && <p className={styles.sectionDescription}>Registry <a href={`https://sepolia.basescan.org/address/${page.contractAddress}`} target="_blank" rel="noreferrer">{page.contractAddress}</a></p>}
          <p className={styles.sectionDescription} role="status" aria-live="polite">
            {loading ? "Fetching agents from Base Sepolia…" : page ? `${page.agents.length} of ${page.total} registrations loaded · Last fetched ${updatedAt}${error ? " · Showing previous results" : ""}` : "No registry data loaded."}
          </p>
          {error && <p className="form-error" role="alert">{error}</p>}
          {registering && page && <RegisterAgent contractAddress={page.contractAddress} onClose={() => setRegistering(false)} onRegistered={() => {
            pending.current?.abort();
            pending.current = null;
            setQuery("");
            load();
          }} />}
          {page && <>
            <div className={styles.search}>
              <label htmlFor="agent-search">Search loaded agents</label>
              <input id="agent-search" type="search" name="agent-search" placeholder="Search by name, description, or wallet" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            {matches.length > 0 ? <div className={styles.grid}>{matches.map((agent) => <AgentCard key={agent.id} agent={agent} />)}</div> : (
              <div className={styles.empty}>
                <h3>{page.total === "0" ? "No agents registered yet" : "No matching agents"}</h3>
                <p>{page.total === "0" ? "Use Deploy agent to register your first agent." : "Try a different search or load more registrations."}</p>
                {query && <button type="button" onClick={() => setQuery("")}>Clear search</button>}
              </div>
            )}
            {page.nextOffset !== null && <button className={styles.secondaryButton} type="button" disabled={loading} onClick={() => load(page.nextOffset!)}>Load more agents</button>}
          </>}
        </section>
      </div>
    </div>
  );
}
