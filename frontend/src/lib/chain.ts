import { chains, createClient } from "genlayer-js";
import { CHAIN_HEX, CHAIN_ID, CONTRACT_ADDRESS, EXPLORER_URL, RPC_URL } from "./config";
import type { ConsensusRecord, ScreeningCase } from "./types";

// genlayer-js reads consensus fields off the chain object when dispatching a
// write, so the SDK's own Studio definition is spread and only the RPC is pinned.
const chain = { ...chains.studioDevnet, rpcUrls: { default: { http: [RPC_URL] } } };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const reader: AnyClient = createClient({ chain });

export interface Eip1193 {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (ev: string, cb: (...a: unknown[]) => void) => void;
  removeListener?: (ev: string, cb: (...a: unknown[]) => void) => void;
}
export const injected = (): Eip1193 | undefined =>
  (typeof window !== "undefined" ? (window as unknown as { ethereum?: Eip1193 }).ethereum : undefined);

/** Normalise genlayer-js calldata (Map / bigint) into plain JSON-safe values. */
export function toPlain(v: unknown): unknown {
  if (v instanceof Map) {
    const o: Record<string, unknown> = {};
    v.forEach((val, key) => (o[String(key)] = toPlain(val)));
    return o;
  }
  if (typeof v === "bigint") return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString();
  if (Array.isArray(v)) return v.map(toPlain);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, toPlain(x)]));
  }
  return v;
}

export async function view<T>(functionName: string, args: unknown[] = []): Promise<T> {
  const out = await reader.readContract({ address: CONTRACT_ADDRESS, functionName, args });
  return toPlain(out) as T;
}

export async function ensureChain(): Promise<void> {
  const eth = injected();
  if (!eth) throw new Error("No injected wallet found. Install MetaMask or a compatible EIP-1193 wallet.");
  const current = (await eth.request({ method: "eth_chainId" })) as string;
  if (parseInt(current, 16) === CHAIN_ID) return;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: CHAIN_HEX,
        chainName: "GenLayer Studio Next",
        rpcUrls: [RPC_URL],
        nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
        blockExplorerUrls: [EXPLORER_URL],
      }],
    });
  }
}

function signer(account: string): AnyClient {
  const eth = injected();
  if (!eth) throw new Error("No injected wallet found.");
  return createClient({ chain, account: account as `0x${string}`, provider: eth });
}

export async function write(account: string, functionName: string, args: unknown[] = [], value = 0n): Promise<string> {
  await ensureChain();
  const client = signer(account);
  // Studio Next rejects writes without a fee distribution (FeesDistributionMissing).
  const fees = await client.estimateTransactionFees();
  return client.writeContract({ address: CONTRACT_ADDRESS, functionName, args, value, fees }) as Promise<string>;
}

export async function waitDecided(hash: string): Promise<Record<string, unknown>> {
  return reader.waitForTransactionReceipt({ hash, waitUntil: "decided", retries: 200, interval: 3000 });
}

export async function balanceOf(address: string): Promise<bigint> {
  try {
    const hex = (await reader.request({ method: "eth_getBalance", params: [address, "latest"] })) as string;
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

/** Studio-only faucet (sim_fundAccount). */
export async function fundTestAccount(address: string, amount = 10n * 10n ** 18n): Promise<void> {
  await reader.fundAccount({ address, amount });
}

export async function fetchConsensus(txHash: string): Promise<ConsensusRecord | null> {
  try {
    const tx = toPlain(await reader.getTransaction({ hash: txHash })) as Record<string, unknown>;
    const cd = (tx.consensus_data ?? tx.consensusData) as Record<string, unknown> | undefined;
    const votesRaw = (cd?.votes ?? {}) as Record<string, unknown>;
    const votes = Object.entries(votesRaw).map(([validator, vote]) => ({ validator, vote: String(vote) }));
    const lr = cd?.leader_receipt as Array<Record<string, unknown>> | undefined;
    return {
      txHash,
      result: String(tx.result_name ?? tx.resultName ?? "—"),
      votes,
      leader: String(lr?.[0]?.node_config ? "" : (tx.last_leader ?? "")),
    };
  } catch {
    return null;
  }
}

export const latestCaseFor = (cases: ScreeningCase[], address: string, requestor?: string) =>
  cases
    .filter((c) => c.target_address === address.toLowerCase() && (!requestor || c.requestor === requestor.toLowerCase()))
    .sort((a, b) => b.case_id - a.case_id)[0];
