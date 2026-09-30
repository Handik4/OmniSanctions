// Resolve-transaction hashes for cases resolved from this browser. The chain
// stores the verdict, not the tx hash that produced it, so certificates need it
// kept alongside (seeded cases come from the deployment record instead).
const STORE_NAME = "omnisanctions:resolve-tx:v1";

function load(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORE_NAME) ?? "{}");
  } catch {
    return {};
  }
}

export function rememberResolveTx(caseId: number, hash: string): void {
  try {
    const all = load();
    all[String(caseId)] = hash;
    localStorage.setItem(STORE_NAME, JSON.stringify(all));
  } catch {
    /* storage unavailable: certificate simply omits the consensus record */
  }
}

export const recalledResolveTx = (caseId: number): string | null => load()[String(caseId)] ?? null;
