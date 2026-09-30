import { GEN } from "./config";
import type { Tier } from "./types";

export const short = (a: string, head = 6, tail = 4) =>
  a && a.length > head + tail + 2 ? `${a.slice(0, head)}…${a.slice(-tail)}` : a;

export function fmtTime(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function fmtDuration(seconds: number): string {
  if (!seconds) return "—";
  if (seconds < 90) return `${seconds}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function fmtGen(wei: string | bigint, digits = 3): string {
  const v = typeof wei === "bigint" ? wei : BigInt(wei || "0");
  const whole = v / GEN;
  const frac = Number(v % GEN) / 1e18;
  return (Number(whole) + frac).toFixed(digits).replace(/\.?0+$/, "") || "0";
}

export const TIER_META: Record<
  Tier,
  { label: string; short: string; tone: "clean" | "warn" | "hazard" | "slate"; text: string; bg: string; ring: string; bar: string; dot: string }
> = {
  TIER_1_CLEAN: {
    label: "Tier 1 · Clean", short: "TIER 1", tone: "clean",
    text: "text-clean", bg: "bg-emerald-50", ring: "border-emerald-200", bar: "bg-clean", dot: "bg-clean",
  },
  TIER_2_ELEVATED: {
    label: "Tier 2 · Elevated", short: "TIER 2", tone: "warn",
    text: "text-warn", bg: "bg-amber-50", ring: "border-amber-200", bar: "bg-warn", dot: "bg-warn",
  },
  TIER_3_SANCTIONED: {
    label: "Tier 3 · Sanctioned", short: "TIER 3", tone: "hazard",
    text: "text-hazard", bg: "bg-red-50", ring: "border-red-200", bar: "bg-hazard", dot: "bg-hazard",
  },
  TIER_UNKNOWN: {
    label: "Inconclusive", short: "UNKNOWN", tone: "slate",
    text: "text-slate-600", bg: "bg-slate-100", ring: "border-slate-200", bar: "bg-slate-400", dot: "bg-slate-400",
  },
};

export const OUTCOME_LABEL: Record<string, string> = {
  EXACT_MATCH: "Exact watchlist match",
  FUZZY_RESOLUTION: "Fuzzy entity resolution",
  CLEAN_ATTESTATION: "Clean attestation",
  INCONCLUSIVE: "Inconclusive (fail-closed)",
  "": "Awaiting consensus",
};

export const isAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s.trim());
