import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { TIER_META, short } from "../lib/format";
import type { Tier } from "../lib/types";

export function TierBadge({ tier, size = "md", pending = false }: { tier: Tier; size?: "sm" | "md" | "lg"; pending?: boolean }) {
  const m = TIER_META[tier] ?? TIER_META.TIER_UNKNOWN;
  const pad = size === "lg" ? "px-3.5 py-1.5 text-sm" : size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold ${pad} ${m.bg} ${m.ring} ${m.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {pending ? "Awaiting consensus" : m.label}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone =
    status === "RESOLVED" ? "text-slate-700 bg-slate-100 border-slate-200"
    : status === "PENDING" ? "text-inst bg-blue-50 border-blue-200"
    : "text-slate-500 bg-white border-slate-200";
  return <span className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${tone}`}>{status}</span>;
}

export function ConfidenceBar({ value, tier }: { value: number; tier: Tier }) {
  const m = TIER_META[tier] ?? TIER_META.TIER_UNKNOWN;
  return (
    <div className="flex items-center gap-2.5 min-w-[120px]" title={`${value}/100 confidence`}>
      <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${m.bar}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums text-slate-600 w-8 text-right">{value ? value : "—"}</span>
    </div>
  );
}

export function AddressChip({ value, full = false, href }: { value: string; full?: boolean; href?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };
  const text = full ? value : short(value, 8, 6);
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="chip-mono hover:border-inst hover:text-inst break-all">{text}</a>
      ) : (
        <span className="chip-mono break-all">{text}</span>
      )}
      <button onClick={copy} aria-label="Copy" className="text-slate-400 hover:text-navy p-0.5">
        {copied ? <Check size={13} className="text-clean" /> : <Copy size={13} />}
      </button>
    </span>
  );
}

export function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
      <div>
        <div className="label text-inst">{eyebrow}</div>
        <h2 className="text-xl font-semibold tracking-tight mt-1">{title}</h2>
      </div>
      {children}
    </div>
  );
}
