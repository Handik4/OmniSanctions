# OmniSanctions RegOracle

Decentralized sanctions and compliance risk oracle with fuzzy entity resolution, on **GenLayer Studio Next** (chain 61997).

| | |
|---|---|
| Network | GenLayer Studio Next · chain `61997` (`0xF22D`) · RPC `https://studio-next.genlayer.com/api` |
| Contract | [`0xfb0536b49bb7eb5a54283d67e9DaF8f2bE339c03`](https://explorer-studio-next.genlayer.com/address/0xfb0536b49bb7eb5a54283d67e9DaF8f2bE339c03) |
| Deploy tx | [`0x2acde4d3bd…`](https://explorer-studio-next.genlayer.com/tx/0x2acde4d3bd8d209d15ca336292a56da6d6c25d77d2bc0f9a5b606992a365e44d) |
| Source SHA-256 | `1f1cc21c1e44fcfab733b214129b6a49378ead42d20be45f14d3f696abd82c54` |
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
2. **The model reasons only inside a computed corridor, built from authoritative evidence only.** `_bounds()` derives `[floor, ceiling]` from *verified gateway telemetry* (mixer within 3 hops, sanctioned counterparties, cluster attribution) and — upstream — exact watchlist hits. The caller-supplied `entity_alias` is **unverified** and never moves the floor: a clean address stays capable of `TIER_1_CLEAN` whatever string the caller supplies (audit finding: alias-spoofing defamation). A strong alias match (≥85) can only lift the *ceiling* to Tier 3 when verified telemetry already shows exposure. Confidence is clamped to a per-tier band.
3. **Fail closed, never a false clean.** A non-sanctioned verdict needs *all* active watchlists and the telemetry gateway to be reachable and schema-valid. Otherwise: `TIER_UNKNOWN`, escrow → refund.
4. **Cryptographic feed integrity.** `sync_registry` (governor) commits the SHA-256 of each feed's raw bytes as the registry `root_hash`. Every screening re-hashes the downloaded payload; an empty or mismatching root fails closed with rationale `FEED_INTEGRITY_MISMATCH` and a full refund — a compromised host can neither forge a designation nor hide one. A legitimate list update requires a new `sync_registry`.

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
tests/                        direct-mode suite (261 test items; audit PoCs in test_omni_sanctions.py)
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
.venv/bin/python -m pytest -q                      # 261 passed

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

## Live proofs on Studio Next

Real validator consensus on the deployed contract (recorded in `deployments/studio-next.json`):

| Case | Target | Alias | Verdict | Consensus | Resolution tx |
|---|---|---|---|---|---|
| 1 | `0x098B716B…` | Lazarus Group | **TIER_3_SANCTIONED** (100) | MAJORITY_AGREE | [`0x77e34ea9f6…`](https://explorer-studio-next.genlayer.com/tx/0x77e34ea9f695228dd924efacf39e0b195d1133b0926552a89c9d05be24768d60) |
| 2 | `0x28C6c062…` | Binance 14 | **TIER_1_CLEAN** (95) | MAJORITY_AGREE | [`0x2b8b7ddc3d…`](https://explorer-studio-next.genlayer.com/tx/0x2b8b7ddc3d6fed1263ce3f107deacb7270dcb88f1d73befbd86a1591d234ba57) |
| 3 | `0x5a1e5f00…` | Yield Vault v2 | **TIER_2_ELEVATED** (85) | MAJORITY_AGREE | [`0xb8f219b03f…`](https://explorer-studio-next.genlayer.com/tx/0xb8f219b03fc6daa019bb31844ef379679b51d5dd3962918f66cc70100679ef41) |
| 4 | `0x9c0ffee9…` | Lazarus Grp | *PENDING — left for stewards* | — | request [`0x2fa26d52a6…`](https://explorer-studio-next.genlayer.com/tx/0x2fa26d52a600782598d2363c72bc508bbf783bc58a0cefb7310d7543c46dd921) |

Case 1 is a deterministic exact OFAC hit; cases 2 and 3 went through the multi-validator LLM committee inside the telemetry-derived corridor.
Each registry `root_hash` equals the SHA-256 of the corresponding file in `feeds/` (checked by `deploy.py`):

- US OFAC Specially Designated Nationals: root `92602a902ff0afa1e8b9c40fce682851da7a6c921a59a4c6e8e89a176fca9321` — [sync tx](https://explorer-studio-next.genlayer.com/tx/0x6f25901077c0feb85d819cef9e40db57c40e6bf1d1d7635496075a06c573062f)
- EU Consolidated Financial Sanctions: root `802685eacaab067c402771ad3803a15adfe6c581e12b48da528b9064f42e3ec9` — [sync tx](https://explorer-studio-next.genlayer.com/tx/0x6a16ab78e6408eef22e463a67549fafde04eb3bdb98633bfb6e6761f4ccb22bc)
- UN Security Council ISIL/Al-Qaida: root `30360de99c9509292cfa8db1c2379f1c7ba7d01df922de6c277769e05192e327` — [sync tx](https://explorer-studio-next.genlayer.com/tx/0x032b89c0f11c6fa8e2f64f88ab900c3908a2520a573ff929236d4b3d0f77577b)

Feeds are served from `https://raw.githubusercontent.com/Handik4/OmniSanctions/main/feeds`.  Editing a file in `feeds/` without re-running `sync_registry` makes screenings fail closed by design.

## Limits

Direct-mode tests exercise the leader path and validator logic with mocks; they do not prove multi-validator agreement on live LLM output — the
live resolution runs are the integration evidence. Demo feeds are fixtures, not real regulator data. Testnet only; not legal advice.
