import { useCallback, useState } from "react";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { view, waitDecided, write } from "../lib/chain";
import { SCREENING_FEE_WEI } from "../lib/config";
import { isAddress } from "../lib/format";
import { rememberResolveTx } from "../lib/txstore";
import type { ComplianceLookup, ScreeningCase } from "../lib/types";
import type { WalletState } from "./useWallet";

export type StageStatus = "idle" | "active" | "done" | "error";

export interface RunState {
  stages: [StageStatus, StageStatus, StageStatus];
  running: boolean;
  message: string | null;
  error: string | null;
  result: ScreeningCase | null;
  cached: ComplianceLookup | null;
  txs: { request?: string; resolve?: string };
  resolvedAddress: string | null;
}

const IDLE: RunState = {
  stages: ["idle", "idle", "idle"], running: false, message: null, error: null,
  result: null, cached: null, txs: {}, resolvedAddress: null,
};

const COOLDOWN = 3600;

/** A confirmed transaction can still have reverted in the VM; surface that. */
function assertExecuted(receipt: Record<string, unknown>, what: string): void {
  const exec = String(receipt.txExecutionResultName ?? "");
  if (exec && exec !== "FINISHED_WITH_RETURN") {
    const text = JSON.stringify(receipt);
    const m = text.match(/ERR_[A-Z_]+|\[LLM_ERROR\][^"\\]*|\[TRANSIENT\][^"\\]*|\[EXTERNAL\][^"\\]*/);
    throw new Error(`${what} reverted${m ? `: ${m[0]}` : ` (${exec})`}`);
  }
}

async function resolveInput(input: string): Promise<string> {
  const s = input.trim();
  if (isAddress(s)) return s;
  if (/^[^\s]+\.[a-z]{2,}$/i.test(s)) {
    const client = createPublicClient({ chain: mainnet, transport: http() });
    const addr = await client.getEnsAddress({ name: normalize(s) });
    if (!addr) throw new Error(`ENS name ${s} does not resolve to an address`);
    return addr;
  }
  throw new Error("Enter a 0x… address (42 characters) or an ENS name.");
}

export function useScreening(wallet: WalletState, refresh: () => Promise<void>, cases: ScreeningCase[]) {
  const [state, setState] = useState<RunState>(IDLE);
  const patch = (p: Partial<RunState>) => setState((s) => ({ ...s, ...p }));
  const setStage = (i: 0 | 1 | 2, v: StageStatus) =>
    setState((s) => {
      const stages = [...s.stages] as RunState["stages"];
      stages[i] = v;
      return { ...s, stages };
    });

  const reset = useCallback(() => setState(IDLE), []);

  const requireAccount = async (): Promise<string> => {
    const a = wallet.account ?? (await wallet.connect());
    if (!a) throw new Error(wallet.error ?? "Connect a wallet to sign the screening transaction.");
    return a;
  };

  const runResolve = async (account: string, caseId: number) => {
    setStage(0, "done");
    setStage(1, "active");
    patch({ message: "Validators are fetching watchlists and telemetry; the LLM committee is resolving entities…" });
    const hash = await write(account, "resolve_compliance_consensus", [caseId]);
    patch({ txs: { ...state.txs, resolve: hash } });
    const receipt = await waitDecided(hash);
    assertExecuted(receipt, "Consensus resolution");
    rememberResolveTx(caseId, hash);
    setStage(1, "done");
    setStage(2, "active");
    const result = await view<ScreeningCase>("get_case", [caseId]);
    setStage(2, "done");
    patch({ result, message: null });
    await refresh();
    await wallet.refreshBalance();
  };

  const run = useCallback(
    async (input: string, alias: string) => {
      setState({ ...IDLE, running: true, message: "Validating target…" });
      try {
        const address = (await resolveInput(input)).toLowerCase();
        patch({ resolvedAddress: address });

        // Oracle cache: a fresh concrete verdict is served without a new fee.
        const lookup = await view<ComplianceLookup>("check_compliance", [address]);
        const now = Math.floor(Date.now() / 1000);
        if (lookup.screened && now - lookup.timestamp < COOLDOWN) {
          const result = await view<ScreeningCase>("get_case", [lookup.case_id]);
          setState({ ...IDLE, stages: ["done", "done", "done"], cached: lookup, result, resolvedAddress: address,
            message: "Served from the on-chain oracle cache — a verdict under one hour old needs no new fee." });
          return;
        }

        const account = await requireAccount();
        const pending = cases.find((c) => c.target_address === address && c.status === "PENDING");
        if (pending) {
          patch({ message: `Case #${pending.case_id} is already pending; running validator consensus on it.` });
          await runResolve(account, pending.case_id);
          patch({ running: false });
          return;
        }

        setStage(0, "active");
        patch({ message: "Escrowing the 0.02 GEN screening fee and opening the case…" });
        const reqHash = await write(account, "request_compliance_screening", [address, alias.trim()], SCREENING_FEE_WEI);
        patch({ txs: { request: reqHash } });
        const reqReceipt = await waitDecided(reqHash);
        assertExecuted(reqReceipt, "Screening request");
        const all = await view<ScreeningCase[]>("get_all_cases");
        const mine = all
          .filter((c) => c.target_address === address && c.requestor === account && c.status === "PENDING")
          .sort((a, b) => b.case_id - a.case_id)[0];
        if (!mine) throw new Error("Screening request was accepted but the case could not be located.");
        await refresh();
        await runResolve(account, mine.case_id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setState((s) => ({
          ...s,
          error: msg.length > 400 ? msg.slice(0, 400) + "…" : msg,
          message: null,
          stages: s.stages.map((x) => (x === "active" ? "error" : x)) as RunState["stages"],
        }));
      } finally {
        patch({ running: false });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wallet.account, cases],
  );

  const resolveExisting = useCallback(
    async (caseId: number) => {
      const c = cases.find((x) => x.case_id === caseId);
      setState({ ...IDLE, running: true, resolvedAddress: c?.target_address ?? null, message: "Preparing consensus round…" });
      try {
        const account = await requireAccount();
        await runResolve(account, caseId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setState((s) => ({
          ...s, error: msg.length > 400 ? msg.slice(0, 400) + "…" : msg, message: null,
          stages: s.stages.map((x) => (x === "active" ? "error" : x)) as RunState["stages"],
        }));
      } finally {
        patch({ running: false });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wallet.account, cases],
  );

  const claimRefund = useCallback(async () => {
    try {
      const account = await requireAccount();
      const hash = await write(account, "claim_refund");
      assertExecuted(await waitDecided(hash), "Refund claim");
      patch({ message: "Refund claimed — the transfer settles when the transaction finalizes." });
      await wallet.refreshBalance();
    } catch (e) {
      patch({ error: e instanceof Error ? e.message : String(e) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.account]);

  return { state, run, resolveExisting, claimRefund, reset };
}
