import { useCallback, useEffect, useRef, useState } from "react";
import { view } from "../lib/chain";
import type { OracleMetrics, Registry, ScreeningCase } from "../lib/types";

export interface OracleState {
  metrics: OracleMetrics | null;
  registries: Registry[];
  cases: ScreeningCase[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** Live protocol state straight from the contract's view methods (no wallet needed). */
export function useOracle(pollMs = 20_000): OracleState {
  const [metrics, setMetrics] = useState<OracleMetrics | null>(null);
  const [registries, setRegistries] = useState<Registry[]>([]);
  const [cases, setCases] = useState<ScreeningCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [m, r, c] = await Promise.all([
        view<OracleMetrics>("get_oracle_metrics"),
        view<Registry[]>("get_all_registries"),
        view<ScreeningCase[]>("get_all_cases"),
      ]);
      if (!alive.current) return;
      setMetrics(m);
      setRegistries(r);
      setCases([...c].sort((a, b) => b.case_id - a.case_id));
      setError(null);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const t = setInterval(() => void refresh(), pollMs);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [refresh, pollMs]);

  return { metrics, registries, cases, loading, error, refresh };
}
