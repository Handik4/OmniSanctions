import { ShieldCheck, Wallet } from "lucide-react";
import { short } from "../lib/format";
import type { WalletState } from "../hooks/useWallet";

export function Navbar({ wallet }: { wallet: WalletState }) {
  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur border-b border-line">
      <div className="mx-auto h-full max-w-[1240px] px-4 sm:px-6 flex flex-nowrap items-center justify-between gap-3 whitespace-nowrap overflow-hidden">
        <div className="flex flex-nowrap items-center gap-2.5 min-w-0 whitespace-nowrap">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-navy text-white">
            <ShieldCheck size={18} strokeWidth={2.2} />
          </span>
          <span className="inline-flex items-center rounded-md border border-line bg-slate-50 px-2.5 py-1 text-sm font-semibold tracking-tight whitespace-nowrap">
            OmniSanctions <span className="ml-1 text-inst">RegOracle</span>
          </span>
        </div>

        <div className="flex flex-nowrap items-center gap-2 sm:gap-3 whitespace-nowrap shrink-0">
          <span className="hidden sm:inline-flex items-center gap-2 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 whitespace-nowrap">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-clean opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-clean" />
            </span>
            Studio Next (61997)
          </span>
          <button
            onClick={() => void wallet.connect()}
            disabled={wallet.connecting}
            className="btn-primary !h-9 !px-3.5 whitespace-nowrap"
            title={wallet.error ?? undefined}
          >
            <Wallet size={15} />
            {wallet.account ? short(wallet.account, 6, 4) : wallet.connecting ? "Connecting…" : "Connect Wallet"}
          </button>
        </div>
      </div>
    </header>
  );
}
