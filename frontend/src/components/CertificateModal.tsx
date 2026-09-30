import { Download, Printer, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchConsensus } from "../lib/chain";
import { CONTRACT_ADDRESS, EXPLORER_URL, SOURCE_SHA256, seededResolveTx } from "../lib/config";
import { fmtGen, fmtTime, OUTCOME_LABEL, TIER_META } from "../lib/format";
import { recalledResolveTx } from "../lib/txstore";
import type { ConsensusRecord, ScreeningCase } from "../lib/types";
import { ConfidenceBar, TierBadge } from "./ui";

export function CertificateModal({ c, onClose }: { c: ScreeningCase; onClose: () => void }) {
  const txHash = seededResolveTx(c.case_id) ?? recalledResolveTx(c.case_id);
  const [rec, setRec] = useState<ConsensusRecord | null>(null);
  const [recState, setRecState] = useState<"none" | "loading" | "ready" | "failed">(txHash ? "loading" : "none");

  useEffect(() => {
    if (!txHash) return;
    let dead = false;
    fetchConsensus(txHash).then((r) => {
      if (dead) return;
      setRec(r);
      setRecState(r ? "ready" : "failed");
    });
    return () => { dead = true; };
  }, [txHash]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const certId = `OSR-${c.case_id.toString().padStart(5, "0")}-${c.target_address.slice(2, 8).toUpperCase()}`;
  const meta = TIER_META[c.risk_tier];

  const download = () => {
    const doc = {
      certificate: certId, contract: CONTRACT_ADDRESS, network: "GenLayer Studio Next (61997)",
      source_sha256: SOURCE_SHA256, case: c, consensus: rec, consensus_tx: txHash,
      generated_at: new Date().toISOString(),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${certId}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="print-root fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-[2px] p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Certificate of Compliance Audit" onClick={onClose}>
      <div className="print-sheet mx-auto max-w-3xl rounded-xl bg-white shadow-pop border border-line" onClick={(e) => e.stopPropagation()}>
        <div className="no-print flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <span className="label">Regulatory export</span>
          <div className="flex items-center gap-2">
            <button className="btn-ghost !h-8 !px-3 text-xs" onClick={download}><Download size={14} />JSON</button>
            <button className="btn-primary !h-8 !px-3 text-xs" onClick={() => window.print()}><Printer size={14} />Print / PDF</button>
            <button aria-label="Close" className="p-1.5 text-slate-500 hover:text-navy" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        <div className="p-8 sm:p-10">
          <div className="flex items-start justify-between gap-6 border-b-2 border-navy pb-5">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-navy text-white"><ShieldCheck size={24} /></span>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">OmniSanctions RegOracle</div>
                <h1 className="text-2xl font-semibold tracking-tight leading-tight">Certificate of Compliance Audit</h1>
              </div>
            </div>
            <div className="text-right text-xs text-slate-500 shrink-0">
              <div className="label">Certificate no.</div><div className="font-mono text-sm text-navy mt-1">{certId}</div>
            </div>
          </div>

          <div className={`mt-6 rounded-lg border p-5 ${meta.bg} ${meta.ring}`}>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div><div className="label">Determination</div><div className="mt-2"><TierBadge tier={c.risk_tier} size="lg" /></div></div>
              <div className="w-56 max-w-full"><div className="label mb-1.5">Confidence</div><ConfidenceBar value={c.confidence_score} tier={c.risk_tier} /></div>
            </div>
          </div>

          <dl className="mt-6 grid sm:grid-cols-[170px_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-slate-500">Subject address</dt><dd className="font-mono text-[13px] break-all">{c.target_address}</dd>
            <dt className="text-slate-500">Claimed alias</dt><dd>{c.entity_alias || "—"}</dd>
            <dt className="text-slate-500">Method</dt><dd>{OUTCOME_LABEL[c.outcome] ?? c.outcome}</dd>
            <dt className="text-slate-500">Attributed entity</dt><dd>{c.matched_entity || "—"}</dd>
            <dt className="text-slate-500">Watchlists consulted</dt><dd>{c.registries_checked}</dd>
            <dt className="text-slate-500">Case status</dt><dd>{c.status} · case #{c.case_id}</dd>
            <dt className="text-slate-500">Requested</dt><dd>{fmtTime(c.timestamp)}</dd>
            <dt className="text-slate-500">Verdict recorded</dt><dd>{fmtTime(c.resolved_at)}</dd>
            <dt className="text-slate-500">Screening fee</dt><dd>{fmtGen(c.screening_fee)} GEN</dd>
          </dl>

          <div className="mt-6">
            <div className="label mb-2">Timestamped audit rationale</div>
            <div className="rounded-lg border border-line bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">{c.audit_rationale || "—"}</div>
          </div>

          <div className="mt-6">
            <div className="label mb-2">Validator consensus record</div>
            <div className="rounded-lg border border-line">
              <div className="px-4 py-3 border-b border-line flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>Outcome: <b>{rec?.result ?? (recState === "loading" ? "loading…" : "not available")}</b></span>
                {txHash && <a className="font-mono text-xs text-inst hover:underline break-all" target="_blank" rel="noreferrer" href={`${EXPLORER_URL}/tx/${txHash}`}>{txHash}</a>}
              </div>
              {rec && rec.votes.length > 0 ? (
                <ul className="divide-y divide-line">
                  {rec.votes.map((v) => (
                    <li key={v.validator} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                      <span className="font-mono break-all">{v.validator}</span>
                      <span className={`font-semibold whitespace-nowrap ${/agree/i.test(v.vote) ? "text-clean" : "text-warn"}`}>{v.vote}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-3 text-xs text-slate-500">
                  {recState === "none" ? "The consensus transaction for this case was not recorded by this browser; the verdict above is read directly from contract state and can be verified on the explorer."
                    : recState === "loading" ? "Fetching validator votes…" : "Validator votes could not be retrieved from the RPC."}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 grid sm:grid-cols-[170px_1fr] gap-x-6 gap-y-2 text-xs text-slate-500">
            <span>Oracle contract</span><a className="font-mono text-inst hover:underline break-all" target="_blank" rel="noreferrer" href={`${EXPLORER_URL}/address/${CONTRACT_ADDRESS}`}>{CONTRACT_ADDRESS}</a>
            <span>Network</span><span>GenLayer Studio Next · chain 61997</span>
            <span>Source SHA-256</span><span className="font-mono break-all">{SOURCE_SHA256}</span>
          </div>

          <p className="mt-8 border-t border-line pt-4 text-[11px] leading-relaxed text-slate-500">
            This certificate records the output of a decentralized validator consensus on a test network and is provided for
            informational purposes only. It is not legal advice and does not constitute a determination by any sanctions authority.
            Watchlist and telemetry sources are those configured on the contract at the time of screening.
          </p>
        </div>
      </div>
    </div>
  );
}
