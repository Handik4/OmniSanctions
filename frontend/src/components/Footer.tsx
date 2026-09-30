import { BookOpen, Coins, ExternalLink, Github, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { fundTestAccount } from "../lib/chain";
import { CONTRACT_ADDRESS, DOCS_URL, EXPLORER_URL, GITHUB_URL } from "../lib/config";
import type { WalletState } from "../hooks/useWallet";

export function Footer({ wallet }: { wallet: WalletState }) {
  const [msg, setMsg] = useState<string | null>(null);
  const fund = async () => {
    if (!wallet.account) return setMsg("Connect a wallet first.");
    try {
      await fundTestAccount(wallet.account);
      await wallet.refreshBalance();
      setMsg("Funded with 10 test GEN.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Faucet request failed.");
    }
  };
  return (
    <footer className="mt-16 border-t border-line bg-white">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6 py-10 grid gap-8 md:grid-cols-[1.3fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-inst" />OmniSanctions RegOracle</div>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed max-w-md">
            A decentralized sanctions and compliance risk oracle. Exact watchlist matches are decided by code; fuzzy entity resolution is reasoned
            by an LLM validator committee inside deterministic clamps and recorded with an immutable audit rationale.
          </p>
        </div>
        <div className="text-sm">
          <div className="label mb-3">Verify</div>
          <ul className="space-y-2.5">
            <li><a className="inline-flex items-center gap-2 text-inst hover:underline" target="_blank" rel="noreferrer" href={`${EXPLORER_URL}/address/${CONTRACT_ADDRESS}`}><ExternalLink size={14} />Contract on explorer</a></li>
            <li className="font-mono text-xs text-slate-500 break-all">{CONTRACT_ADDRESS}</li>
            <li><a className="inline-flex items-center gap-2 hover:text-inst" target="_blank" rel="noreferrer" href={GITHUB_URL}><Github size={14} />GitHub repository</a></li>
            <li><a className="inline-flex items-center gap-2 hover:text-inst" target="_blank" rel="noreferrer" href={DOCS_URL}><BookOpen size={14} />GenLayer documentation</a></li>
          </ul>
        </div>
        <div className="text-sm">
          <div className="label mb-3">Test network</div>
          <p className="text-slate-600 leading-snug">Studio Next uses free test GEN.</p>
          <button className="btn-ghost !h-9 mt-3" onClick={fund}><Coins size={15} />Get 10 test GEN</button>
          {msg && <p className="mt-2 text-xs text-slate-500">{msg}</p>}
        </div>
      </div>
      <div className="border-t border-line bg-slate-50">
        <p className="mx-auto max-w-[1240px] px-4 sm:px-6 py-4 text-[11px] leading-relaxed text-slate-500">
          <b className="text-slate-600">Regulatory disclaimer.</b> OmniSanctions is experimental software running on a test network. Verdicts are informational, are not legal
          advice, and do not replace the sanctions-screening obligations of any regulated entity. Watchlist feeds and address telemetry in this
          deployment are demonstration fixtures unless stated otherwise. Names of listed persons and entities are used only as public examples.
        </p>
      </div>
    </footer>
  );
}
