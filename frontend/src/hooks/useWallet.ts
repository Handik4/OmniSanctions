import { useCallback, useEffect, useState } from "react";
import { balanceOf, ensureChain, injected } from "../lib/chain";
import { CHAIN_ID } from "../lib/config";

export interface WalletState {
  account: string | null;
  balance: bigint;
  chainOk: boolean;
  hasProvider: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<string | null>;
  refreshBalance: () => Promise<void>;
}

export function useWallet(): WalletState {
  const [account, setAccount] = useState<string | null>(null);
  const [balance, setBalance] = useState(0n);
  const [chainOk, setChainOk] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasProvider = !!injected();

  const refreshBalance = useCallback(async () => {
    if (account) setBalance(await balanceOf(account));
  }, [account]);

  const readChain = useCallback(async () => {
    const eth = injected();
    if (!eth) return;
    const id = (await eth.request({ method: "eth_chainId" })) as string;
    setChainOk(parseInt(id, 16) === CHAIN_ID);
  }, []);

  // Restore an already-authorised session without prompting.
  useEffect(() => {
    const eth = injected();
    if (!eth) return;
    (async () => {
      try {
        const accts = (await eth.request({ method: "eth_accounts" })) as string[];
        if (accts[0]) setAccount(accts[0].toLowerCase());
        await readChain();
      } catch {
        /* wallet locked or unavailable: stay disconnected */
      }
    })();
    const onAccounts = (a: unknown) => setAccount((a as string[])[0]?.toLowerCase() ?? null);
    const onChain = () => void readChain();
    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [readChain]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  const connect = useCallback(async () => {
    const eth = injected();
    if (!eth) {
      setError("No injected wallet detected. Install MetaMask to sign transactions.");
      return null;
    }
    setConnecting(true);
    setError(null);
    try {
      const accts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      await ensureChain();
      await readChain();
      const a = accts[0]?.toLowerCase() ?? null;
      setAccount(a);
      return a;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet connection rejected");
      return null;
    } finally {
      setConnecting(false);
    }
  }, [readChain]);

  return { account, balance, chainOk, hasProvider, connecting, error, connect, refreshBalance };
}
