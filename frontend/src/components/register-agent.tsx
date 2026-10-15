"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Eip1193Provider } from "ethers";
import { checkRegistration, registrationError, submitRegistration, validateRegistration, type AgentRegistration } from "@/lib/register-agent";
import styles from "./deploy.module.css";

const empty: AgentRegistration = { name: "", wallet: "", description: "", endpointUrl: "" };
function browserWallet() {
  const ethereum = (window as Window & { ethereum?: Eip1193Provider }).ethereum;
  if (!ethereum) throw new Error("Open this page in a browser with MetaMask or another Ethereum wallet installed.");
  return ethereum;
}

export function RegisterAgent({ contractAddress, onRegistered, onClose }: {
  contractAddress: string; onRegistered: () => void; onClose: () => void;
}) {
  const [input, setInput] = useState(empty);
  const [review, setReview] = useState<AgentRegistration | null>(null);
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState("");
  const [agentId, setAgentId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [checkAttempt, setCheckAttempt] = useState(0);
  const locked = useRef(false);
  const wallet = useRef<Eip1193Provider | null>(null);
  const onRegisteredRef = useRef(onRegistered);
  useEffect(() => { onRegisteredRef.current = onRegistered; }, [onRegistered]);

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { setReview(validateRegistration(input)); setError(""); }
    catch (cause) { setError(registrationError(cause)); }
  }

  async function register() {
    if (locked.current || hash || !review) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setStatus("Complete the connection and transaction requests in your wallet.");
    try {
      wallet.current = browserWallet();
      setHash(await submitRegistration(wallet.current, contractAddress, review));
      setStatus("Transaction submitted. Waiting for confirmation on Base Sepolia…");
    } catch (cause) { setError(registrationError(cause)); setStatus(""); }
    finally { locked.current = false; setBusy(false); }
  }

  useEffect(() => {
    if (!hash || agentId !== null) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const result = await checkRegistration(wallet.current ?? browserWallet(), contractAddress, hash);
        if (!active) return;
        if (result.status === "confirmed") {
          setAgentId(result.agentId);
          setStatus(`Agent registered successfully with ID ${result.agentId}.`);
          setError("");
          onRegisteredRef.current();
          return;
        }
        if (result.status === "reverted") {
          setError("Registration reverted on-chain. No agent was added. Review the transaction in the explorer.");
          setStatus("");
          return;
        }
        timer = setTimeout(check, 3000);
      } catch (cause) {
        if (!active) return;
        setError(`Confirmation could not be checked: ${registrationError(cause)} Check the transaction link before submitting another registration.`);
        setStatus("");
      }
    };
    void check();
    return () => { active = false; clearTimeout(timer); };
  }, [hash, agentId, contractAddress, checkAttempt]);

  function field(key: keyof AgentRegistration, value: string) { setInput((current) => ({ ...current, [key]: value })); setError(""); }

  return (
    <section className={`${styles.card} ${styles.registrationCard}`} aria-labelledby="register-agent-heading">
      <div className={styles.sectionHeading}><h2 id="register-agent-heading">{review ? "Review agent registration" : "Deploy agent"}</h2><span className={styles.badge}>Base Sepolia</span></div>
      <p className={styles.sectionDescription}>Register an existing agent in the on-chain directory. Your browser wallet signs the transaction and becomes the entry owner. This does not start or host the agent server.</p>
      {!review ? <form className={styles.registrationForm} onSubmit={prepare}>
        <div className="field-group"><label htmlFor="register-name">Agent name</label><input autoFocus id="register-name" required maxLength={128} value={input.name} onChange={(e) => field("name", e.target.value)} placeholder="Everyday helper" /></div>
        <div className="field-group"><label htmlFor="register-wallet">Agent payment wallet</label><input id="register-wallet" required maxLength={42} spellCheck={false} autoComplete="off" value={input.wallet} onChange={(e) => field("wallet", e.target.value)} placeholder="0x…" aria-describedby="register-wallet-note" /><p id="register-wallet-note" className={styles.sectionDescription}>Public receiving address for this agent. It can differ from the wallet signing this registration.</p></div>
        <div className="field-group"><label htmlFor="register-description">Description (optional)</label><textarea className={styles.registrationTextarea} id="register-description" rows={3} maxLength={2048} value={input.description} onChange={(e) => field("description", e.target.value)} placeholder="What does this agent help with?" /></div>
        <div className="field-group"><label htmlFor="register-endpoint">Endpoint URL (optional)</label><input id="register-endpoint" type="url" maxLength={512} value={input.endpointUrl} onChange={(e) => field("endpointUrl", e.target.value)} placeholder="http://127.0.0.1:2001/mcp" /></div>
        <p className={styles.sectionDescription}>Registration costs network gas in Base Sepolia ETH. The contract does not store a price. Names and endpoints will be public.</p>
        <div className={styles.actions}><button className="primary-button" type="submit">Review registration</button><button className={styles.secondaryButton} type="button" onClick={onClose}>Cancel</button></div>
      </form> : <>
        <dl className={styles.walletDetails}>
          <div><dt>Agent name</dt><dd>{review.name}</dd></div>
          <div><dt>Payment wallet</dt><dd>{review.wallet}</dd></div>
          <div><dt>Description</dt><dd>{review.description || "Not provided"}</dd></div>
          <div><dt>Endpoint</dt><dd>{review.endpointUrl || "Not provided"}</dd></div>
          <div><dt>Registry contract</dt><dd>{contractAddress}</dd></div>
        </dl>
        <p className={styles.sectionDescription}>You will confirm the gas fee in your wallet. Duplicate registrations are allowed by the contract.</p>
        {!hash && <div className={styles.actions}><button className="primary-button" type="button" disabled={busy} onClick={() => void register()}>Confirm in wallet</button><button className={styles.secondaryButton} type="button" disabled={busy} onClick={() => { setReview(null); setError(""); }}>Edit details</button><button className={styles.secondaryButton} type="button" disabled={busy} onClick={onClose}>Cancel</button></div>}
      </>}
      {status && <p className={styles.sectionDescription} role="status" aria-live="polite">{status}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {hash && <p className={styles.sectionDescription}><a href={`https://sepolia.basescan.org/tx/${hash}`} target="_blank" rel="noreferrer">View transaction on BaseScan</a></p>}
      {hash && error && agentId === null && <button className={styles.secondaryButton} type="button" onClick={() => { setError(""); setStatus("Checking transaction confirmation…"); setCheckAttempt((attempt) => attempt + 1); }}>Check confirmation</button>}
      {hash && <button className={styles.secondaryButton} type="button" onClick={onClose}>{agentId !== null ? "Done" : "Close registration"}</button>}
    </section>
  );
}
