# OmniSanctions RegOracle — Executive Technical Specification

![Network](https://img.shields.io/badge/network-GenLayer%20Studio%20Next%20(61997)-2563eb)
![Contract](https://img.shields.io/badge/contract-0xfb05...9c03-0f172a)
![Tests](https://img.shields.io/badge/tests-261%20passed-059669)
![License](https://img.shields.io/badge/license-MIT-64748b)

| | |
|---|---|
| Network | GenLayer Studio Next · chain `61997` (`0xF22D`) · RPC `https://studio-next.genlayer.com/api` |
| Contract | [`0xfb0536b49bb7eb5a54283d67e9DaF8f2bE339c03`](https://explorer-studio-next.genlayer.com/address/0xfb0536b49bb7eb5a54283d67e9DaF8f2bE339c03) |
| Deploy tx | [`0x2acde4d3…e44d`](https://explorer-studio-next.genlayer.com/tx/0x2acde4d3bd8d209d15ca336292a56da6d6c25d77d2bc0f9a5b606992a365e44d) |
| Source SHA-256 | `1f1cc21c1e44fcfab733b214129b6a49378ead42d20be45f14d3f696abd82c54` |
| Runner | `py-genlayer` v0.3.0 · `contracts/omni_sanctions.py` |

## 1. Executive summary

Sanctions screening in DeFi today is outsourced to centralized, closed APIs (Chainalysis, TRM Labs and peers). Each one is a **single point of failure**, a
**censorship choke point** (one operator can delist, throttle or re-score a counterparty) and a **black box** whose scores arrive without reasoning a regulator can re-run.

OmniSanctions replaces the API call with an on-chain oracle. A quorum of independent GenVM validators re-executes every screening — fetching regulatory
watchlists and address telemetry, verifying feed integrity, resolving fuzzy entity attribution — and must reach `MAJORITY_AGREE` before a **compliance tier,
confidence score and forensic audit rationale** are written to contract state. The verdict is immutable, publicly auditable, and readable by any protocol through a free
`check_compliance(address)` view.

Design stance: **code decides what code can decide.** Exact watchlist hits, feed integrity, fees and tier bounds are deterministic; the LLM committee only reasons about
what is genuinely fuzzy (alias and cluster attribution), and only inside a corridor computed from authoritative evidence.

## 2. Architecture & data flow

```
  integrator / steward
        │  request_compliance_screening(addr, alias)  + 0.02 GEN   ──►  fee ESCROWED, case PENDING
        │  resolve_compliance_consensus(case_id)
        ▼
 ┌─────────────────────── every validator runs _screen() independently ───────────────────────┐
 │                                                                                             │
 │  for each ACTIVE watchlist (OFAC SDN · EU Consolidated · UN 1267 …)                         │
 │     fetch feed ─► SHA-256(raw bytes) == on-chain root_hash ? ──no──► FEED_INTEGRITY_MISMATCH│
 │                   │yes                                              (fail-closed, refund)   │
 │                   ▼                                                                         │
 │            schema-valid? ─no─► fail-closed          exact address hit?                      │
 │                                                        │                                    │
 │   ╔═══════════ FAST PATH (deterministic) ═════════╗    │yes                                 │
 │   ║  hit on ANY verified list ─► TIER_3, conf 100 ║◄───┘   model never consulted            │
 │   ╚═══════════════════════════════════════════════╝                                         │
 │        │no hit; all lists verified + reachable                                              │
 │        ▼                                                                                    │
 │  telemetry gateway ─► schema-valid? ─no─► fail-closed (TIER_UNKNOWN, refund)                │
 │        ▼                                                                                    │
 │  _bounds(): corridor [floor,ceiling] from VERIFIED telemetry only (alias never sets floor)  │
 │        ▼                                                                                    │
 │  ╔═══════ GenVM VALIDATOR COMMITTEE PATH ═══════╗                                           │
 │  ║ LLM fuzzy entity / cluster resolution        ║  output clamped to [floor,ceiling],       │
 │  ║ (alias = UNVERIFIED context)                 ║  confidence clamped to a per-tier band    │
 │  ╚══════════════════════════════════════════════╝                                           │
 └─────────────────────────────────────────────┬───────────────────────────────────────────────┘
                                               ▼
        validators compare outcome + tier (+ confidence within ±25)  ──►  MAJORITY_AGREE
                                               ▼
   state: tier · confidence · rationale · fee 70% validator pool / 30% treasury
                                               ▼
   any protocol ── check_compliance(addr) (free view) ──► {tier, confidence, blocked, timestamp}
```

## 3. Compliance risk tiers

| Tier | On-chain value | Trigger | Integrator guidance |
|---|---|---|---|
| **Tier 1 · Clean** | `TIER_1_CLEAN` | No watchlist hit, no mixer hops, no sanctioned counterparties, no cluster attribution — across **all** active lists | Full DeFi access |
| **Tier 2 · Elevated** | `TIER_2_ELEVATED` | Verified mixer exposure within 1-3 hops, or a sanctioned counterparty | Integrator policy: caps, timelocks, enhanced review |
| **Tier 3 · Sanctioned** | `TIER_3_SANCTIONED` | Direct OFAC/EU/UN address hit (deterministic), or gateway-confirmed cluster attribution | Strictly blocked (`blocked: true`) |
| **Tier 0 · Unknown** | `TIER_UNKNOWN` | Fail-closed: feed unreachable / corrupt / incomplete, telemetry missing, or `FEED_INTEGRITY_MISMATCH`. Case → `REJECTED`, **fee refunded** (`claim_refund`) | Treat as unscreened |

A consensus *split* does not write a verdict: the transaction is not accepted, the case stays `PENDING`, and the requestor can `cancel_screening` to reclaim the fee.
Tier 2/Tier 0 handling (caps, timelocks) is the integrating protocol's policy; the oracle supplies the tier.

## 4. Audit hardening & security matrix

| Control | Mechanism | Verified by |
|---|---|---|
| **Anti-defamation** | The caller's `entity_alias` is unverified input and **never moves the tier floor**. A clean address with clean telemetry and zero hits is always capable of `TIER_1_CLEAN`, whatever alias is supplied. Alias is tag-isolated and labelled unverified in the prompt. | `tests/test_omni_sanctions.py` (PoC 1, parametrized malicious aliases) |
| **Cryptographic feed integrity** | `sync_registry` commits SHA-256 of the feed's raw bytes as `root_hash`. Each screening re-hashes the payload; empty or mismatching root ⇒ `FEED_INTEGRITY_MISMATCH`, `TIER_UNKNOWN`, full refund. A tampered feed can neither forge nor hide a designation. | PoC 2 tests, live `deploy.py` root check |
| **Sybil / spam defense** | Exact **0.02 GEN** screening bond; one in-flight case per address; concrete verdict cached 1 h (`ERR_RECENTLY_SCREENED`); fee split **70% validator pool / 30% treasury**; ledger invariant `balance ≥ escrow + treasury + pool + refunds`. | economics tests |
| **Deterministic corridor clamping** | `_bounds()` derives `[floor, ceiling]` from verified telemetry; the model's tier and confidence are clamped into it. It cannot escalate a signal-free wallet or clear a wallet with verified exposure; hallucinated or malformed output reverts (`[LLM_ERROR]`) and forces rotation. | clamp tests |
| **Prompt-injection isolation** | Alias, feed names and gateway labels are sanitized (no angle brackets / control chars) and wrapped in untrusted tags. | sanitization tests |
| **SSRF guard** | Feed/gateway URLs must be `https` public DNS names (no IP literals, localhost, internal suffixes, credentials, odd ports). | URL tests |
| **Fund safety** | Pull-pattern refunds (checks-effects-interactions), reentrancy flag, governor-only treasury/pool withdrawals bounded by ledger. | economics tests |

## 5. Live on-chain consensus proofs

Contract [`0xfb0536b49bb7eb5a54283d67e9DaF8f2bE339c03`](https://explorer-studio-next.genlayer.com/address/0xfb0536b49bb7eb5a54283d67e9DaF8f2bE339c03) on Studio Next. Resolution transactions are recorded in `deployments/studio-next.json`.

| Case | Target | Verdict | Confidence | Consensus | Resolution tx |
|---|---|---|---|---|---|
| 1 · Lazarus / Ronin | `0x098B716B…` | **TIER_3_SANCTIONED** (exact OFAC hit) | 100% | MAJORITY_AGREE | [`0x77e34ea9…8d60`](https://explorer-studio-next.genlayer.com/tx/0x77e34ea9f695228dd924efacf39e0b195d1133b0926552a89c9d05be24768d60) |
| 2 · Binance hot wallet | `0x28C6c062…` | **TIER_1_CLEAN** | 95% | MAJORITY_AGREE | [`0x2b8b7ddc…ba57`](https://explorer-studio-next.genlayer.com/tx/0x2b8b7ddc3d6fed1263ce3f107deacb7270dcb88f1d73befbd86a1591d234ba57) |
| 3 · Mixer 1-hop vault | `0x5a1e5f00…` | **TIER_2_ELEVATED** | 85% | MAJORITY_AGREE | [`0xb8f219b0…ef41`](https://explorer-studio-next.genlayer.com/tx/0xb8f219b03fc6daa019bb31844ef379679b51d5dd3962918f66cc70100679ef41) |
| 4 · Interactive test case | `0x9c0ffee9…` | **PENDING** — open for steward evaluation | — | — | request [`0x2fa26d52…d921`](https://explorer-studio-next.genlayer.com/tx/0x2fa26d52a600782598d2363c72bc508bbf783bc58a0cefb7310d7543c46dd921) |

Committed feed roots (equal to the SHA-256 of the files in `feeds/`):

| Watchlist | root_hash | sync tx |
|---|---|---|
| US OFAC Specially Designated Nationals | `92602a902ff0afa1…` | [`0x6f259010…062f`](https://explorer-studio-next.genlayer.com/tx/0x6f25901077c0feb85d819cef9e40db57c40e6bf1d1d7635496075a06c573062f) |
| EU Consolidated Financial Sanctions | `802685eacaab067c…` | [`0x6a16ab78…22bc`](https://explorer-studio-next.genlayer.com/tx/0x6a16ab78e6408eef22e463a67549fafde04eb3bdb98633bfb6e6761f4ccb22bc) |
| UN Security Council ISIL/Al-Qaida | `30360de99c950929…` | [`0x032b89c0…577b`](https://explorer-studio-next.genlayer.com/tx/0x032b89c0f11c6fa8e2f64f88ab900c3908a2520a573ff929236d4b3d0f77577b) |

## 6. Limitations & trust model

- **Indirect mixer exposure & alias elevation.** For addresses with *verified* 1-3 hop mixer telemetry, a user-supplied alias can permit the LLM corridor to consider
  Tier 3 if multi-validator consensus establishes direct attribution. Clean addresses (clean telemetry, zero hits) remain immune. Production roadmap isolates Tier 3
  strictly to deterministic cluster-attribution gateways.
- **Feed authority.** In this deployment the watchlists and telemetry are **demo fixtures** committed in this repository (`feeds/`, served from
  `raw.githubusercontent.com/Handik4/OmniSanctions/main/feeds`) and bound by `root_hash`. They are not regulator data; only the Lazarus/Ronin address is a real OFAC-listed
  address. A production deployment would point registries at regulator-signed publications or an attested gateway.
- **Governor scope.** A single `governor` key (the deployer) can add/deactivate registries, set the telemetry URL, commit `root_hash` via `sync_registry`, set subscriber
  tiers and withdraw the treasury / validator pool. It cannot alter a recorded verdict, and a list change without a fresh `sync_registry` makes screenings fail closed.
  The governor is therefore trusted for feed *selection*, not for individual outcomes; multisig / timelocked governance is roadmap.
- **Telemetry is not hash-committed** (it is per-address); it is schema-validated and is the authoritative input to the corridor, so the gateway is a trust dependency.
- **Test scope.** Direct-mode tests use mocks; they do not prove multi-validator agreement on live LLM output — the live runs above are the integration evidence. Testnet only; not legal advice.

## 7. Verification commands

```bash
uv venv --python 3.12 && uv pip install --prerelease=allow -r requirements.txt

.venv/bin/python -m pytest -q                               # 261 passed
.venv/bin/genvm-lint check contracts/omni_sanctions.py      # lint + validation

cd frontend && npm install
npm run build                                               # tsc + vite, 0 errors
npm run console-check                                       # headless Chrome vs the LIVE contract: zero console errors
```

Deploy / operate (`.env` key is generated, mode 600, git-ignored; 10 GEN via `sim_fundAccount`; ~0.1 GEN fee distribution attached to every write):

```bash
.venv/bin/python scripts/deploy.py                 # deploy, seed watchlists, commit + verify root_hash, open cases
.venv/bin/python scripts/interact_live.py resolve 4   # trigger real validator consensus on a pending case
.venv/bin/python scripts/interact_live.py status | cases | check <addr> | screen <addr> [alias] | refund
```

## 8. Steward evaluation guide

1. Open the app (`cd frontend && npm run dev`); metrics, audit history and watchlists read live from the contract without a wallet.
2. **Connect Wallet** (adds chain 61997), then **Get 10 test GEN** in the footer.
3. Resolve **Case 4** from the audit table (*Run consensus*), or paste any address with an alias.
4. Try to break it: alias `Lazarus Group` on a clean address (stays Tier 1); re-screen within an hour (served from cache); an address with no telemetry (fails closed, refund);
   edit a feed without re-syncing (integrity mismatch).

### Feed formats

Watchlists: a bare address array, or `{"entries":[{"address"|"addresses":[…],"name","aliases":[…],"program"}]}`. Gateway (`{address}` template):
`{"address","mixer_hops","sanctioned_counterparties","attributed_to_sanctioned_cluster","cluster_label","labels","counterparty_notes"}`.

## Repository layout

```
contracts/omni_sanctions.py   intelligent contract          tests/                 direct-mode suite (261)
scripts/                      deploy + live interaction     feeds/                 demo watchlist + telemetry fixtures
deployments/studio-next.json  address, tx hashes, roots     frontend/              Vite + React + Tailwind light-mode HUD
```

## License

MIT — see [`LICENSE`](LICENSE).
