import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { AuditHistory } from "./components/AuditHistory";
import { CertificateModal } from "./components/CertificateModal";
import { Footer } from "./components/Footer";
import { MetricStrip } from "./components/MetricStrip";
import { Navbar } from "./components/Navbar";
import { ScreeningTerminal } from "./components/ScreeningTerminal";
import { WhyDecentralized } from "./components/WhyDecentralized";
import { useOracle } from "./hooks/useOracle";
import { useScreening } from "./hooks/useScreening";
import { useWallet } from "./hooks/useWallet";
import { RPC_URL } from "./lib/config";
import type { ScreeningCase } from "./lib/types";

export default function App() {
  const wallet = useWallet();
  const oracle = useOracle();
  const screening = useScreening(wallet, oracle.refresh, oracle.cases);
  const [cert, setCert] = useState<ScreeningCase | null>(null);
  const [input, setInput] = useState("");
  const [alias, setAlias] = useState("");

  const refundsOwed = (() => {
    try {
      return BigInt(oracle.metrics?.refunds_owed ?? "0");
    } catch {
      return 0n;
    }
  })();

  const resolveFromTable = (id: number) => {
    const c = oracle.cases.find((x) => x.case_id === id);
    if (c) {
      setInput(c.target_address);
      setAlias(c.entity_alias);
    }
    document.getElementById("terminal")?.scrollIntoView({ behavior: "smooth", block: "start" });
    void screening.resolveExisting(id);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar wallet={wallet} />
      <main className="flex-1 mx-auto w-full max-w-[1240px] px-4 sm:px-6 pt-8 space-y-10">
        <div>
          <div className="label text-inst">Regulatory technology · Swiss-grade audit trail</div>
          <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight max-w-3xl">
            Sanctions screening that a regulator can re&#8209;run.
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600 leading-relaxed">
            Screen addresses against OFAC, EU and UN watchlists through a quorum of GenVM validators. Exact matches are deterministic; fuzzy
            entity resolution is reasoned by an LLM committee inside hard-coded clamps — and every verdict ships with an on-chain rationale.
          </p>
        </div>

        {oracle.error && (
          <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 text-warn px-4 py-3 text-sm flex gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>Could not read the oracle contract from <span className="font-mono">{RPC_URL}</span>: {oracle.error}. Retrying automatically.</span>
          </div>
        )}

        <MetricStrip m={oracle.metrics} loading={oracle.loading} />

        <ScreeningTerminal
          wallet={wallet} state={screening.state} onRun={screening.run} onClaimRefund={screening.claimRefund}
          onReset={screening.reset} onCertificate={setCert} refundsOwed={refundsOwed}
          input={input} alias={alias} setInput={setInput} setAlias={setAlias}
        />

        <WhyDecentralized />

        <AuditHistory
          cases={oracle.cases} registries={oracle.registries} loading={oracle.loading}
          running={screening.state.running} onCertificate={setCert} onResolve={resolveFromTable}
        />
      </main>
      <Footer wallet={wallet} />
      {cert && <CertificateModal c={cert} onClose={() => setCert(null)} />}
    </div>
  );
}
