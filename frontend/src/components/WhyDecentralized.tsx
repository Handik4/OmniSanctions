import { Ban, Check, EyeOff, Fingerprint, GitMerge, Lock, ScrollText, ServerCrash, ShieldAlert, Undo2, X } from "lucide-react";
import { SectionTitle } from "./ui";

const central = [
  { icon: ServerCrash, t: "Single point of failure", d: "One vendor API outage blinds every protocol that depends on it." },
  { icon: EyeOff, t: "Black-box scoring", d: "Risk scores arrive with no reproducible reasoning to show a regulator." },
  { icon: Ban, t: "Unilateral censorship", d: "A single operator can delist, throttle or silently re-score any counterparty." },
  { icon: Lock, t: "Mutable history", d: "Past classifications can be rewritten; there is no immutable audit trail." },
];
const open = [
  { icon: GitMerge, t: "Validator quorum", d: "Independent GenVM validators re-execute the screening and must reach MAJORITY_AGREE." },
  { icon: Fingerprint, t: "Deterministic first", d: "Exact watchlist hits are decided by code. The LLM only reasons inside a computed corridor." },
  { icon: ScrollText, t: "Immutable audit rationale", d: "Tier, confidence and forensic rationale are written on-chain and exportable as a certificate." },
  { icon: Undo2, t: "Fail-closed with refund", d: "Unreachable or corrupt evidence yields TIER_UNKNOWN and returns the fee — never a false clean." },
];

export function WhyDecentralized() {
  return (
    <section aria-labelledby="why">
      <SectionTitle eyebrow="Architecture" title="Why Decentralized Compliance?" />
      <div id="why" className="card overflow-hidden">
        <div className="grid md:grid-cols-2">
          <div className="p-6 md:p-7 bg-slate-50/70 md:border-r border-b md:border-b-0 border-line">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-red-50 text-hazard border border-red-200"><ShieldAlert size={16} /></span>
              <div>
                <div className="label text-hazard">Status quo</div>
                <h3 className="font-semibold">Centralized black-box APIs</h3>
              </div>
            </div>
            <ul className="mt-5 space-y-4">
              {central.map(({ icon: I, t, d }) => (
                <li key={t} className="flex gap-3">
                  <X size={16} className="mt-0.5 shrink-0 text-hazard" />
                  <div><div className="text-sm font-semibold flex items-center gap-1.5"><I size={13} className="text-slate-400" />{t}</div><p className="text-sm text-slate-600 mt-0.5 leading-snug">{d}</p></div>
                </li>
              ))}
            </ul>
          </div>
          <div className="p-6 md:p-7">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-clean border border-emerald-200"><Check size={16} /></span>
              <div>
                <div className="label text-clean">OmniSanctions</div>
                <h3 className="font-semibold">GenVM open multi-validator oracle</h3>
              </div>
            </div>
            <ul className="mt-5 space-y-4">
              {open.map(({ icon: I, t, d }) => (
                <li key={t} className="flex gap-3">
                  <Check size={16} className="mt-0.5 shrink-0 text-clean" />
                  <div><div className="text-sm font-semibold flex items-center gap-1.5"><I size={13} className="text-slate-400" />{t}</div><p className="text-sm text-slate-600 mt-0.5 leading-snug">{d}</p></div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
