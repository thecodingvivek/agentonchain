"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { PaymentWallet } from "@/lib/payment-wallet";
import { formatAmount } from "@/lib/format-amount";
import styles from "./deploy.module.css";

export function Cards({ wallet, onSave }: { wallet: PaymentWallet | null; onSave: (wallet: PaymentWallet) => void }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [signer, setSigner] = useState<{ configured: boolean; address: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    let checking = false;
    const checkSigner = async () => {
      if (!active || checking) return;
      checking = true;
      try {
        const response = await fetch("/api/wallet");
        if (!response.ok) throw new Error("Wallet status unavailable.");
        const value = await response.json();
        if (active) setSigner(value);
      } catch {
        if (active) setSigner({ configured: false, address: null });
      } finally {
        checking = false;
      }
    };
    void checkSigner();
    const interval = setInterval(checkSigner, 10_000);
    // Ignore any in-flight response after unmount instead of aborting the fetch.
    return () => { active = false; clearInterval(interval); };
  }, []);
  const ready = signer?.configured && wallet?.address.toLowerCase() === signer.address?.toLowerCase();

  function saveWallet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const address = String(data.get("address") ?? "").trim();
    const maxPerCallUsdc = String(data.get("limit") ?? "").trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(address) || /^0x0{40}$/i.test(address)) {
      setError("Enter a nonzero wallet address: 0x followed by 40 hexadecimal characters.");
      return;
    }
    if (!/^\d{1,6}(\.\d{1,6})?$/.test(maxPerCallUsdc) || Number(maxPerCallUsdc) <= 0) {
      setError("Enter a positive USDC limit with up to six decimal places.");
      return;
    }
    onSave({ address, chainId: 84532, network: "base-sepolia", maxPerCallUsdc });
    setError("");
    setEditing(false);
    setNotice(wallet ? "Payment card updated." : "Payment card saved.");
  }

  return (
    <div className={styles.view}>
      <div className={styles.content}>
        <section className={styles.section} aria-labelledby="wallet-heading">
          <div className={styles.sectionHeading}><h2 id="wallet-heading">Payment wallet</h2><span>{wallet ? "1 of 1 card" : "0 of 1 card"}</span></div>
          <p className={styles.sectionDescription}>Set the wallet Chat agent should use to pay other agents. You can save one payment card and update it anytime.</p>
          {wallet && !editing ? (
            <article className={`${styles.card} ${styles.walletCard}`} aria-label="Your payment card">
              <div className={styles.cardTop}><h3 className={styles.agentName}>Your payment card</h3><span className={styles.badge}>Base Sepolia</span></div>
              <dl className={styles.walletDetails}>
                <div><dt>Paying wallet address</dt><dd><code>{wallet.address}</code></dd></div>
                <div><dt>Currency</dt><dd>Test USDC</dd></div>
                <div><dt>Maximum per agent call</dt><dd>{formatAmount(Number(wallet.maxPerCallUsdc), "USDC")}</dd></div>
                <div><dt>Payment status</dt><dd>{ready ? "Backend signer connected" : signer?.configured ? "Address must match the backend signer" : signer ? "Backend signer unavailable" : "Checking backend signer…"}</dd></div>
              </dl>
              <p className={styles.sectionDescription}>Chat agent uses the backend wallet to pay a selected agent within your limit. Your card details stay in this session and clear on reload or sign-out.</p>
              {signer?.address && !ready && <p className={styles.sectionDescription}>Backend wallet: <code>{signer.address}</code></p>}
              <button className={styles.secondaryButton} type="button" onClick={() => { setEditing(true); setNotice(""); }}>Edit payment card</button>
            </article>
          ) : (
            <form className={`${styles.card} ${styles.cardForm}`} onSubmit={saveWallet} aria-describedby="wallet-note" onChange={() => { setError(""); setNotice(""); }}>
              <div className="field-group"><label htmlFor="wallet-address">Paying wallet address</label><input id="wallet-address" name="address" defaultValue={wallet?.address ?? ""} placeholder="0x…" spellCheck={false} autoCapitalize="none" autoComplete="off" maxLength={42} required aria-invalid={Boolean(error)} aria-describedby="wallet-note" /></div>
              <div className="field-group"><label htmlFor="wallet-network">Network</label><input id="wallet-network" value="Base Sepolia · Test USDC" readOnly /></div>
              <div className="field-group"><label htmlFor="wallet-limit">Maximum USDC per agent call</label><input id="wallet-limit" name="limit" type="text" inputMode="decimal" defaultValue={wallet?.maxPerCallUsdc ?? "0.01"} maxLength={13} required aria-describedby="wallet-limit-note" /><p id="wallet-limit-note" className={styles.sectionDescription}>Paid agents cost 0.01 USDC per call. The backend enforces the lower of your card limit and its configured spending cap.</p></div>
              <p id="wallet-note" className={styles.sectionDescription}>Enter the public address of your backend signing wallet. Card details stay in this session.</p>
              {signer?.address && <p className={styles.sectionDescription}>Backend wallet: <code>{signer.address}</code></p>}
              {error && <p className="form-error" role="alert">{error}</p>}
              <button type="submit" className="primary-button">{wallet ? "Save changes" : "Save payment card"}</button>
              {wallet && <button type="button" className={styles.secondaryButton} onClick={() => { setEditing(false); setError(""); }}>Cancel editing</button>}
            </form>
          )}
          <p role="status" aria-live="polite" className={styles.sectionDescription}>{notice}</p>
        </section>
      </div>
    </div>
  );
}
