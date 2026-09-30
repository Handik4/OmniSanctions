import { ChevronDown, ChevronRight, FileCheck2, Globe, Loader2, Play } from "lucide-react";
import { Fragment, useState } from "react";
import { CONTRACT_ADDRESS, EXPLORER_URL, seededResolveTx } from "../lib/config";
import { fmtGen, fmtTime, OUTCOME_LABEL } from "../lib/format";
import { recalledResolveTx } from "../lib/txstore";
import type { Registry, ScreeningCase } from "../lib/types";
import { AddressChip, ConfidenceBar, SectionTitle, StatusPill, TierBadge } from "./ui";

interface Props {
  cases: ScreeningCase[];
  registries: Registry[];
  loading: boolean;
  running: boolean;
  onCertificate: (c: ScreeningCase) => void;
  onResolve: (id: number) => void;
}

export function AuditHistory({ cases, registries, loading, running, onCertificate, onResolve }: Props) {
  const [tab, setTab] = useState<"history" | "lists">("history");
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section aria-labelledby="audit">
      <SectionTitle eyebrow="Ledger" title="Sanction Watchlist Explorer & Audit History">
        <div role="tablist" className="inline-flex rounded-lg border border-line bg-white p-1">
          {([["history", `Audit history (${cases.length})`], ["lists", `Watchlists (${registries.length})`]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`px-3.5 h-8 rounded-md text-sm font-semibold whitespace-nowrap transition-colors ${tab === k ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-50"}`}>{l}</button>
          ))}
        </div>
      </SectionTitle>

      <div id="audit" className="card overflow-hidden">
        {tab === "history" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr>
                  <th className="th w-10" />
                  <th className="th">Case</th><th className="th">Target</th><th className="th">Risk tier</th>
                  <th className="th">Confidence</th><th className="th">Status</th><th className="th">Requested</th><th className="th text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && cases.length === 0 && (
                  <tr><td colSpan={8} className="td text-center text-slate-500 py-10"><Loader2 className="inline animate-spin mr-2" size={16} />Reading cases from the contract…</td></tr>
                )}
                {!loading && cases.length === 0 && (
                  <tr><td colSpan={8} className="td text-center text-slate-500 py-10">No screening cases recorded yet.</td></tr>
                )}
                {cases.map((c) => {
                  const isOpen = open === c.case_id;
                  const resolveTx = seededResolveTx(c.case_id) ?? recalledResolveTx(c.case_id);
                  return (
                    <Fragment key={c.case_id}>
                      <tr className={`border-b border-line hover:bg-slate-50/60 ${isOpen ? "bg-slate-50/60" : ""}`}>
                        <td className="td pr-0">
                          <button aria-label={isOpen ? "Collapse rationale" : "Expand rationale"} aria-expanded={isOpen}
                            onClick={() => setOpen(isOpen ? null : c.case_id)} className="text-slate-400 hover:text-navy">
                            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td className="td font-mono text-xs text-slate-600">#{c.case_id}</td>
                        <td className="td"><AddressChip value={c.target_address} />{c.entity_alias && <div className="text-xs text-slate-500 mt-1 truncate max-w-[220px]">“{c.entity_alias}”</div>}</td>
                        <td className="td"><TierBadge tier={c.risk_tier} pending={c.status === "PENDING"} /></td>
                        <td className="td"><ConfidenceBar value={c.confidence_score} tier={c.risk_tier} /></td>
                        <td className="td"><StatusPill status={c.status} /></td>
                        <td className="td text-xs text-slate-500 whitespace-nowrap">{fmtTime(c.timestamp)}</td>
                        <td className="td text-right whitespace-nowrap">
                          {c.status === "PENDING" ? (
                            <button className="btn-blue !h-8 !px-3 text-xs" disabled={running} onClick={() => onResolve(c.case_id)}><Play size={13} />Run consensus</button>
                          ) : (
                            <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => onCertificate(c)}><FileCheck2 size={13} />Certificate</button>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-line bg-slate-50/40">
                          <td />
                          <td colSpan={7} className="px-4 pb-5 pt-1">
                            <div className="grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5">
                              <div>
                                <div className="label mb-1.5">Validator rationale</div>
                                <p className="rounded-lg border border-line bg-white p-4 text-sm leading-relaxed text-slate-700">
                                  {c.audit_rationale || "This case is awaiting validator consensus — its rationale will be committed on-chain when it resolves."}
                                </p>
                              </div>
                              <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 content-start">
                                <dt className="text-slate-500">Outcome</dt><dd>{OUTCOME_LABEL[c.outcome] ?? c.outcome}</dd>
                                <dt className="text-slate-500">Attribution</dt><dd>{c.matched_entity || "—"}</dd>
                                <dt className="text-slate-500">Watchlists</dt><dd>{c.registries_checked || "—"} consulted</dd>
                                <dt className="text-slate-500">Fee</dt><dd>{fmtGen(c.screening_fee)} GEN</dd>
                                <dt className="text-slate-500">Requestor</dt><dd><AddressChip value={c.requestor} /></dd>
                                {c.status !== "PENDING" && <><dt className="text-slate-500">Resolved</dt><dd>{fmtTime(c.resolved_at)}</dd></>}
                                {resolveTx && <><dt className="text-slate-500">Consensus tx</dt><dd><a className="chip-mono hover:text-inst" target="_blank" rel="noreferrer" href={`${EXPLORER_URL}/tx/${resolveTx}`}>{resolveTx.slice(0, 10)}…{resolveTx.slice(-6)} ↗</a></dd></>}
                              </dl>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead><tr><th className="th">Watchlist</th><th className="th">Source authority</th><th className="th">Feed root (SHA-256)</th><th className="th">Entries</th><th className="th">Status</th></tr></thead>
              <tbody>
                {registries.length === 0 && <tr><td colSpan={5} className="td text-center text-slate-500 py-10">No watchlists configured.</td></tr>}
                {registries.map((r) => (
                  <tr key={r.registry_id} className="border-b border-line hover:bg-slate-50/60">
                    <td className="td"><div className="font-semibold flex items-center gap-2"><Globe size={14} className="text-inst shrink-0" />{r.name}</div><div className="text-xs text-slate-500 mt-1 font-mono break-all max-w-[340px]">{r.feed_url}</div></td>
                    <td className="td text-slate-600">{r.source_authority}</td>
                    <td className="td">{r.root_hash ? <span className="chip-mono">{r.root_hash.slice(0, 12)}…{r.root_hash.slice(-6)}</span> : <span className="text-xs text-slate-400">not yet synced</span>}
                      {r.last_synced_timestamp > 0 && <div className="text-xs text-slate-500 mt-1">synced {fmtTime(r.last_synced_timestamp)}</div>}</td>
                    <td className="td tabular-nums">{r.entries_count || "—"}</td>
                    <td className="td"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${r.is_active ? "bg-emerald-50 border-emerald-200 text-clean" : "bg-slate-100 border-slate-200 text-slate-500"}`}><span className={`h-1.5 w-1.5 rounded-full ${r.is_active ? "bg-clean" : "bg-slate-400"}`} />{r.is_active ? "Active" : "Inactive"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-3 border-t border-line bg-slate-50/60 text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1 justify-between">
          <span>Live from contract <span className="font-mono">{CONTRACT_ADDRESS.slice(0, 10)}…{CONTRACT_ADDRESS.slice(-6)}</span> · refreshed every 20s</span>
          <span>Tap a row's chevron for the validator rationale</span>
        </div>
      </div>
    </section>
  );
}
