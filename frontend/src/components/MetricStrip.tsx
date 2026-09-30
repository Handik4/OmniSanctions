import { Activity, Globe2, Radar, Timer } from "lucide-react";
import { fmtDuration } from "../lib/format";
import type { OracleMetrics } from "../lib/types";

export function MetricStrip({ m, loading }: { m: OracleMetrics | null; loading: boolean }) {
  const items = [
    { icon: Radar, label: "Total Screened Entities", value: m?.total_screened, hint: `${m?.total_cases ?? 0} cases opened · ${m?.inconclusive ?? 0} fail-closed`, tone: "text-navy" },
    { icon: Activity, label: "Sanctioned Addresses Isolated", value: m?.sanctioned_isolated, hint: `${m?.elevated ?? 0} elevated · ${m?.clean ?? 0} clean`, tone: "text-hazard" },
    { icon: Globe2, label: "Active Global Watchlists", value: m?.active_watchlists, hint: "OFAC · EU · UN Security Council", tone: "text-inst" },
    { icon: Timer, label: "Mean Verification Latency", value: m ? fmtDuration(m.mean_latency_seconds) : undefined, hint: "request → validator verdict", tone: "text-navy" },
  ];
  return (
    <section aria-label="Compliance metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map(({ icon: Icon, label, value, hint, tone }) => (
        <div key={label} className="card p-5">
          <div className="flex items-center justify-between">
            <span className="label">{label}</span>
            <Icon size={16} className="text-slate-400" />
          </div>
          <div className={`mt-3 text-3xl font-semibold tracking-tight tabular-nums ${tone}`}>
            {loading && value === undefined ? <span className="inline-block h-8 w-16 rounded bg-slate-100 animate-pulse" /> : value ?? "—"}
          </div>
          <div className="mt-1.5 text-xs text-slate-500">{hint}</div>
        </div>
      ))}
    </section>
  );
}
