import deployment from "./deployment.json";

interface SeedCase {
  case_id: number;
  request_tx?: string | null;
  resolve_tx?: string | null;
}

export const CHAIN_ID = 61997;
export const CHAIN_HEX = "0xF22D";
export const RPC_URL: string =
  (import.meta.env.VITE_GENLAYER_RPC_URL as string | undefined) ?? "https://studio-next.genlayer.com/api";
export const EXPLORER_URL = "https://explorer-studio-next.genlayer.com";
export const CONTRACT_ADDRESS = ((import.meta.env.VITE_CONTRACT_ADDRESS as string | undefined) ??
  deployment.contract_address) as `0x${string}`;
export const GITHUB_URL = "https://github.com/Handik4/OmniSanctions";
export const DOCS_URL = "https://docs.genlayer.com";

export const SCREENING_FEE_WEI = 20_000_000_000_000_000n; // 0.02 GEN
export const GEN = 10n ** 18n;

export const SOURCE_SHA256: string = deployment.source_sha256;
export const DEPLOY_TX: string = deployment.deploy_tx;

const seedCases: SeedCase[] = (deployment.seed?.cases ?? []) as SeedCase[];

/** Resolve-transaction hashes recorded by scripts/deploy.py for the seeded cases. */
export function seededResolveTx(caseId: number): string | null {
  return seedCases.find((c) => c.case_id === caseId)?.resolve_tx ?? null;
}

export const SAMPLE_PRESETS = [
  { key: "lazarus", label: "Lazarus Cluster", address: "0x098B716B8Aaf21512996dC57EB0615e2383E2f96", alias: "Lazarus Group", tone: "hazard" },
  { key: "clean", label: "Clean Institutional Donor", address: "0x28C6c06298d514Db089934071355E5743bf21d60", alias: "Binance 14", tone: "clean" },
  { key: "mixer", label: "Mixer Relayer", address: "0x5a1e5f00d5a1e5f00d5a1e5f00d5a1e5f00d5a1e", alias: "Yield Vault v2", tone: "warn" },
  { key: "pending", label: "Live Steward Case", address: "0x9c0ffee9c0ffee9c0ffee9c0ffee9c0ffee9c0ff", alias: "Lazarus Grp", tone: "inst" },
] as const;
