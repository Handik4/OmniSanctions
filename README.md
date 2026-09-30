# OmniSanctions RegOracle

Decentralized sanctions and compliance risk oracle with fuzzy entity resolution, on **GenLayer Studio Next** (chain 61997).

| | |
|---|---|
| Network | GenLayer Studio Next · chain `61997` (`0xF22D`) · RPC `https://studio-next.genlayer.com/api` |
| Contract | [`0x3FE369576cF628BB441A40b1243f0E11ce0F381E`](https://explorer-studio-next.genlayer.com/address/0x3FE369576cF628BB441A40b1243f0E11ce0F381E) |
| Deploy tx | see `deployments/studio-next.json` (includes `source_sha256`) |
| Source | `contracts/omni_sanctions.py` (runner `py-genlayer` v0.3.0) |

## Protocol theory

A DeFi protocol pays a **0.02 GEN** fee to have an address screened. A GenVM validator quorum then produces a tier:

| Tier | Meaning |
|---|---|
| `TIER_1_CLEAN` | no sanctions exposure found across **every** active watchlist |
| `TIER_2_ELEVATED` | indirect exposure: mixer hop, sanctioned counterparty, weak alias match |
| `TIER_3_SANCTIONED` | exact watchlist hit, or a strong attributed cluster/alias match |
| `TIER_UNKNOWN` | **fail-closed**: evidence unreachable / corrupt / incomplete. Fee refunded |

Three ideas carry the design:

1. **Deterministic first.** An exact address hit on any reachable watchlist is `TIER_3`, decided in code at confidence 100. The model is never consulted and cannot talk it down.
2. **The model reasons only inside a computed corridor.** `_bounds()` derives a `[floor, ceiling]` tier range from hard signals (mixer within 3 hops, sanctioned counterparties, integer fuzzy score ≥60 / ≥85, gateway cluster attribution). A signal-free wallet is capped at Tier 1; a wallet with any exposure signal cannot be cleared; Tier 3 from fuzzy evidence needs a *strong* signal. Confidence is clamped to a per-tier band.
3. **Fail closed, never a false clean.** A non-sanctioned verdict needs *all* active watchlists and the telemetry gateway to be reachable and schema-valid. Otherwise: `TIER_UNKNOWN`, escrow → refund.

Consensus uses `gl.vm.run_nondet` with a custom validator: each validator re-runs the whole screening and agrees only if `outcome` and `tier` match and confidence is within ±25. A leader that lies (e.g. reports a listed address as clean) is rejected — covered by tests via `run_validator`.

```
                request_compliance_screening (0.02 GEN)
   integrator ─────────────────────────────────────────►  ┌────────────────────────┐
                                                          │ OmniSanctions contract │
   resolve_compliance_consensus(case)                     │  escrow → pools/refund │
   ─────────────────────────────────────────────────────► │  cases · registries    │
                                                          └───────────┬────────────┘
                    leader + validators each run  _screen()           │
   ┌──────────────────────────────────────────────────────────────────▼──────────┐
   │ 1 fetch every active watchlist feed ──► schema-validate ──► exact match?   │
   │      yes ─► TIER_3 (code)                                                   │
   │ 2 any feed/gateway bad ─► TIER_UNKNOWN (fail-closed, refund)                │
   │ 3 telemetry gateway ─► _bounds() corridor ─► LLM (fuzzy/cluster) ─► clamp   │
   └──────────────────────────────────────────────────────────────────┬──────────┘
                                          MAJORITY_AGREE              ▼
   DeFi protocol ── check_compliance(addr) (free view) ◄── tier · confidence · rationale (immutable)
```

**Economics.** Exact fee (`ERR_INCORRECT_SCREENING_FEE` otherwise) is escrowed; on a concrete verdict 70% → validator pool, 30% → treasury (governor-withdrawable); on fail-closed/cancel the fee becomes claimable (`claim_refund`, pull pattern). One in-flight case per address, and a concrete verdict is cached for 1 h (`ERR_RECENTLY_SCREENED`). Ledger invariant: `balance ≥ escrow + treasury + validator_pool + refunds_owed` (exposed by `solvency()` and `get_oracle_metrics().solvent`).

### Feed formats

Watchlists (`add_registry`, https + public DNS names only — SSRF-guarded): a bare address array, or
`{"entries":[{"address"|"addresses":[…],"name","aliases":[…],"program"}]}`. The gateway (`set_telemetry_url`, `{address}` placeholder) returns
`{"address","mixer_hops","sanctioned_counterparties","attributed_to_sanctioned_cluster","cluster_label","labels","counterparty_notes"}`.
Fixtures for the demo live in `feeds/`. **They are demonstration data**; only the Lazarus/Ronin address is a real OFAC-listed address.

## Repository layout

```
contracts/omni_sanctions.py   the intelligent contract
tests/                        direct-mode suite (220 test items)
scripts/deploy.py             key → fund → deploy → seed
scripts/interact_live.py      status / screen / resolve / refund CLI
feeds/                        demo watchlist + telemetry fixtures
deployments/studio-next.json  address, tx hashes, source_sha256, seed record
frontend/                     Vite + React + Tailwind institutional light-mode HUD
```

## Run it

```bash
uv venv --python 3.12 && uv pip install --prerelease=allow -r requirements.txt
.venv/bin/genvm-lint check contracts/omni_sanctions.py
.venv/bin/python -m pytest -q                      # 220 passed

.venv/bin/python scripts/deploy.py                 # key in .env (0600, git-ignored), 10 GEN via sim_fundAccount,
                                                   # ~0.1 GEN fee distribution on every write
cd frontend && npm install && npm run build && npm run console-check
npm run dev
```

`FEEDS_BASE_URL` (or `--feeds-base`) sets where validators fetch `ofac-sdn.json`, `eu-consolidated.json`, `un-securitycouncil.json` and `telemetry/{address}.json`.
The default is `https://raw.githubusercontent.com/Handik4/OmniSanctions/main/feeds`, which works once this repo is published there.

## Steward evaluation guide

1. Open the app; the metric strip, audit history and watchlist tabs read live from the contract without a wallet.
2. Connect a wallet (Connect Wallet adds chain 61997), use **Get 10 test GEN** in the footer.
3. Pick a sample chip, or paste any address, add an alias (try `Lazarus Grp` — a typo that still scores ≥85 against the listed name).
4. **Execute Validator Consensus**: two signed transactions (request + resolve). Watch the 3-stage stepper.
5. Inspect the tier badge, confidence bar and rationale; open **Issue Certificate** to print/export.
6. Try to break it: re-screen within an hour (served from cache), screen an address with no telemetry (fails closed, refund), inject instructions into the alias.

## Live status of the seeded deployment

The contract, 3 watchlists, the telemetry gateway, a subscriber and 4 screening cases are on-chain (see `deployments/studio-next.json`). The four
cases were *requested* on-chain; resolving them by live consensus requires validators to reach the feed URLs, which requires publishing
`feeds/` at `FEEDS_BASE_URL`. Until then they are `PENDING` (fees safely escrowed), and cases 1–3 resolve with
`scripts/interact_live.py resolve <id>` once the feeds are reachable; case 4 is left pending for the steward to evaluate in the UI.

## Limits

Direct-mode tests exercise the leader path and validator logic with mocks; they do not prove multi-validator agreement on live LLM output — the
live resolution runs are the integration evidence. Demo feeds are fixtures, not real regulator data. Testnet only; not legal advice.
