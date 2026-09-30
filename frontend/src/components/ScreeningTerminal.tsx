import { AlertTriangle, CheckCircle2, Cpu, FileCheck2, Loader2, Play, Search, Send, ServerCog, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { RunState, StageStatus } from "../hooks/useScreening";
import type { WalletState } from "../hooks/useWallet";
import { view } from "../lib/chain";
import { CONTRACT_ADDRESS, EXPLORER_URL, SAMPLE_PRESETS } from "../lib/config";
import { fmtGen, isAddress, OUTCOME_LABEL, TIER_META } from "../lib/format";
import type { ComplianceLookup, ScreeningCase } from "../lib/types";
import { AddressChip, ConfidenceBar, TierBadge } from "./ui";

interface Props {
  wallet: WalletState;
  state: RunState;
  onRun: (input: string, alias: string) => void;
  onClaimRefund: () => void;
  onReset: () => void;
  onCertificate: (c: ScreeningCase) => void;
  refundsOwed: bigint;
  input: string;
  alias: string;
  setInput: (s: string) => void;
  setAlias: (s: string) => void;
}

const STAGES = [
  { icon: Send, title: "Telemetry Ingestion", sub: "Fee escrowed, case opened, gateways queried" },
  { icon: Cpu, title: "Multi-Validator Fuzzy Resolution", sub: "Exact-match in code · LLM committee inside clamps" },
  { icon: FileCheck2, title: "Cryptographic Audit Verdict", sub: "Tier + rationale committed on-chain" },
];

function StageDot({ status, n }: { status: StageStatus; n: number }) {
  if (status === "done") return <span className="grid h-8 w-8 place-items-center rounded-full bg-clean text-white"><CheckCircle2 size={18} /></span>;
  if (status === "error") return <span className="grid h-8 w-8 place-items-center rounded-full bg-hazard text-white"><AlertTriangle size={16} /></span>;
  if (status === "active") return <span className="grid h-8 w-8 place-items-center rounded-full bg-inst text-white pulse-ring"><Loader2 size={16} className="animate-spin" /></span>;
  return <span className="grid h-8 w-8 place-items-center rounded-full border border-line bg-white text-sm font-semibold text-slate-400">{n}</span>;
}

export function ScreeningTerminal(p: Props) {
  const { state, wallet } = p;
  const [lookup, setLookup] = useState<ComplianceLookup | null>(null);
  const valid = isAddress(p.input.trim());

  // Instant, free read of the oracle cache for whatever address is typed.
  useEffect(() => {
    setLookup(null);
    if (!valid) return;
    let dead = false;
    const t = setTimeout(async () => {
      try {
        const r = await view<ComplianceLookup>("check_compliance", [p.input.trim()]);
        if (!dead) setLookup(r);
      } catch {
        /* read failure is shown by the global banner */
      }
    }, 350);
    return () => { dead = true; clearTimeout(t); };
  }, [p.input, valid]);

  const lowBalance = wallet.account && wallet.balance < 130_000_000_000_000_000n;
  const busy = state.running;
  const res = state.result;

  return (
    <section id="terminal" className="grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4 items-start">
      <div className="card">
        <div className="px-6 pt-5 pb-4 border-b border-line flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="label text-inst">Interactive terminal</div>
            <h2 className="text-xl font-semibold tracking-tight mt-1">Sanctions Screening Terminal</h2>
          </div>
          <span className="chip-mono">fee 0.02 GEN</span>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label htmlFor="target" className="label">Address or ENS name</label>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-white px-3 h-11 focus-within:border-inst focus-within:ring-2 focus-within:ring-blue-100">
              <Search size={16} className="text-slate-400 shrink-0" />
              <input
                id="target" value={p.input} onChange={(e) => p.setInput(e.target.value)} disabled={busy}
                placeholder="0x… or vitalik.eth" spellCheck={false} autoComplete="off"
                className="w-full bg-transparent font-mono text-sm outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          <div>
            <label htmlFor="alias" className="label">Claimed entity alias <span className="normal-case tracking-normal font-normal text-slate-400">(optional — drives fuzzy matching)</span></label>
            <input
              id="alias" value={p.alias} onChange={(e) => p.setAlias(e.target.value)} disabled={busy} maxLength={96}
              placeholder="e.g. Lazarus Grp" spellCheck={false}
              className="mt-2 w-full rounded-lg border border-line bg-white px-3 h-11 text-sm outline-none focus:border-inst focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="label mr-1">Samples</span>
            {SAMPLE_PRESETS.map((s) => (
              <button
                key={s.key} disabled={busy}
                onClick={() => { p.setInput(s.address); p.setAlias(s.alias); }}
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-slate-50 disabled:opacity-50 ${
                  s.tone === "hazard" ? "border-red-200 text-hazard"
                  : s.tone === "clean" ? "border-emerald-200 text-clean"
                  : s.tone === "warn" ? "border-amber-200 text-warn"
                  : "border-blue-200 text-inst"}`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {lookup && (
            <div className={`rounded-lg border px-4 py-3 text-sm flex items-center justify-between gap-3 flex-wrap ${
              lookup.screened ? `${TIER_META[lookup.tier].bg} ${TIER_META[lookup.tier].ring}` : lookup.pending ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-line"}`}>
              <span className="text-slate-700">
                {lookup.screened ? <>Oracle cache: <b>{TIER_META[lookup.tier].label}</b> · confidence {lookup.confidence} · case #{lookup.case_id}</>
                  : lookup.pending ? <>A screening for this address is <b>pending</b> — executing will run validator consensus on it.</>
                  : <>No verdict on file for this address.</>}
              </span>
              {lookup.blocked && <span className="text-xs font-semibold text-hazard">BLOCKED FOR INTEGRATORS</span>}
            </div>
          )}

          <ol className="grid sm:grid-cols-3 gap-3" aria-label="Verification stages">
            {STAGES.map((s, i) => {
              const st = state.stages[i];
              const Icon = s.icon;
              return (
                <li key={s.title} className={`relative rounded-lg border p-3.5 transition-colors ${
                  st === "active" ? "border-inst bg-blue-50/50" : st === "done" ? "border-emerald-200 bg-emerald-50/40" : st === "error" ? "border-red-200 bg-red-50/50" : "border-line bg-white"}`}>
                  <div className="flex items-start gap-3">
                    <StageDot status={st} n={i + 1} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold leading-tight flex items-center gap-1.5"><Icon size={13} className="text-slate-400 shrink-0" />{s.title}</div>
                      <div className="text-xs text-slate-500 mt-1 leading-snug">{s.sub}</div>
                    </div>
                  </div>
                  {st === "active" && <div className="mt-3 h-1 rounded-full bg-blue-100 overflow-hidden"><div className="h-full w-full bg-inst progress-stripes" /></div>}
                </li>
              );
            })}
          </ol>

          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-blue" disabled={busy || !p.input.trim()} onClick={() => p.onRun(p.input, p.alias)}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Execute Validator Consensus
            </button>
            {(res || state.error) && !busy && <button className="btn-ghost" onClick={p.onReset}>Clear</button>}
            <span className="text-xs text-slate-500">
              0.02 GEN screening fee · refunded if validators fail closed · plus ≈0.1 GEN Studio network deposit per transaction
            </span>
          </div>

          {wallet.account && lowBalance && (
            <div className="text-xs rounded-lg border border-amber-200 bg-amber-50 text-warn px-3 py-2">
              Wallet balance {fmtGen(wallet.balance)} GEN is low for a full screening (≈0.33 GEN incl. both network deposits). Studio Next test GEN is free — see the footer for the faucet action.
            </div>
          )}
          {state.message && !state.error && (
            <div className="text-sm text-slate-600 flex items-center gap-2">{busy && <Loader2 size={14} className="animate-spin text-inst" />}{state.message}</div>
          )}
          {state.error && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-hazard flex gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /><span className="break-words min-w-0">{state.error}</span>
            </div>
          )}
        </div>

        {res && (
          <div className="border-t border-line p-6 bg-slate-50/50 rounded-b-xl">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="label">Audit verdict · case #{res.case_id}</div>
                <div className="mt-2 flex items-center gap-3 flex-wrap">
                  <TierBadge tier={res.risk_tier} size="lg" />
                  <span className="text-sm text-slate-600">{OUTCOME_LABEL[res.outcome] ?? res.outcome}</span>
                </div>
              </div>
              <div className="w-56 max-w-full"><div className="label mb-1.5">Confidence</div><ConfidenceBar value={res.confidence_score} tier={res.risk_tier} /></div>
            </div>
            <blockquote className="mt-4 rounded-lg border border-line bg-white p-4 text-sm leading-relaxed text-slate-700">
              {res.audit_rationale || "Rationale pending."}
            </blockquote>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
              <span>Target <AddressChip value={res.target_address} /></span>
              {res.matched_entity && <span>Attributed to <b className="text-navy">{res.matched_entity}</b></span>}
              <span>{res.registries_checked} watchlist(s) consulted</span>
              {state.txs.resolve && <a className="text-inst hover:underline" target="_blank" rel="noreferrer" href={`${EXPLORER_URL}/tx/${state.txs.resolve}`}>Consensus tx ↗</a>}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="btn-primary" onClick={() => p.onCertificate(res)}><FileCheck2 size={16} />Issue Certificate of Compliance Audit</button>
              {res.risk_tier === "TIER_UNKNOWN" && p.refundsOwed > 0n && (
                <button className="btn-ghost" onClick={p.onClaimRefund}><Undo2 size={16} />Claim {fmtGen(p.refundsOwed)} GEN refund</button>
              )}
            </div>
          </div>
        )}
      </div>

      <aside className="card p-6 space-y-4">
        <div className="flex items-center gap-2"><ServerCog size={16} className="text-inst" /><h3 className="font-semibold">Integrator view</h3></div>
        <p className="text-sm text-slate-600 leading-relaxed">
          DeFi protocols read the newest verdict with a free, instant view call — no fee, no wallet.
        </p>
        <div>
          <div className="label mb-1.5">check_compliance(address)</div>
          <pre className="rounded-lg bg-navy text-slate-100 text-[12px] leading-relaxed p-4 overflow-x-auto font-mono">
{lookup ? JSON.stringify(lookup, null, 2) : valid ? "// reading…" : "// enter a valid address"}
          </pre>
        </div>
        <div>
          <div className="label mb-1.5">Use from another intelligent contract</div>
          <pre className="rounded-lg bg-slate-50 border border-line text-[12px] leading-relaxed p-4 overflow-x-auto font-mono text-slate-700">
{`oracle = gl.get_contract_at(
  Address("${CONTRACT_ADDRESS}"))
v = oracle.view().check_compliance(cp)
if v["blocked"]:
    raise gl.vm.UserError(
        "sanctioned counterparty")`}
          </pre>
        </div>
      </aside>
    </section>
  );
}
