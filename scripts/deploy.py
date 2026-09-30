#!/usr/bin/env python3
"""Deploy OmniSanctions to GenLayer Studio Next (chain 61997) and seed it.

    .venv/bin/python scripts/deploy.py                 # deploy + seed (skips what is done)
    .venv/bin/python scripts/deploy.py --redeploy      # force a fresh contract
    .venv/bin/python scripts/deploy.py --feeds-base https://host/feeds

Steps: derive/generate a key in .env (git-ignored, 0600) -> fund 10 GEN through
sim_fundAccount -> deploy with the Studio Next fee distribution attached ->
record source_sha256 -> seed 3 watchlists, the telemetry gateway, a subscriber
and 4 screening cases -> write deployments/studio-next.json.

Cases 1-3 are resolved by live validator consensus, which needs the watchlist
feeds to be reachable from the validators' network. This script only OPENS the
cases (and commits/verifies each registry root_hash against feeds/); run
scripts/interact_live.py resolve <id> to trigger real validator consensus."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from common import (  # noqa: E402
    CHAIN_ID, CONTRACT_PATH, DEFAULT_FEEDS_BASE, EXPLORER_URL, RPC_URL, SCREENING_FEE,
    DEPLOYMENT_PATH, ensure_account, ensure_funded, explorer_address, explorer_tx, fee_quote,
    load_deployment, log, make_client, now, read, save_deployment, source_sha256, wait, write,
)

WATCHLISTS = [
    ("US OFAC Specially Designated Nationals", "US Department of the Treasury - OFAC", "ofac-sdn.json"),
    ("EU Consolidated Financial Sanctions", "European Commission - FSF", "eu-consolidated.json"),
    ("UN Security Council ISIL/Al-Qaida", "UN Security Council 1267 Committee", "un-securitycouncil.json"),
]

LAZARUS = "0x098B716B8Aaf21512996dC57EB0615e2383E2f96"
EXCHANGE = "0x28C6c06298d514Db089934071355E5743bf21d60"
VAULT = "0x5a1e5f00d5a1e5f00d5a1e5f00d5a1e5f00d5a1e"
PENDING = "0x9c0ffee9c0ffee9c0ffee9c0ffee9c0ffee9c0ff"

SEED_CASES = [
    # (label, address, alias, expected tier, resolve now?)
    ("Sanctioned Lazarus / Ronin exploit cluster", LAZARUS, "Lazarus Group", "TIER_3_SANCTIONED", True),
    ("High-volume institutional exchange deposit", EXCHANGE, "Binance 14", "TIER_1_CLEAN", True),
    ("DeFi vault, 1-hop Tornado Cash exposure", VAULT, "Yield Vault v2", "TIER_2_ELEVATED", True),
    ("Live case awaiting steward evaluation", PENDING, "Lazarus Grp", None, False),
]


def reachable(url: str) -> bool:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "omnisanctions-preflight"})
        with urllib.request.urlopen(req, timeout=15) as r:
            json.loads(r.read().decode())
            return 200 <= r.status < 300
    except Exception:
        return False


def extract_address(receipt) -> str | None:
    """Hosted networks carry the address on the decoded tx data; the simulator
    puts it on receipt.data. Try both."""
    def dig(obj, *path):
        for p in path:
            if isinstance(obj, dict) and p in obj:
                obj = obj[p]
            else:
                return None
        return obj
    for path in (
        ("tx_data_decoded", "contract_address"), ("txDataDecoded", "contractAddress"),
        ("data", "contract_address"), ("to_address",), ("recipient",),
    ):
        v = dig(receipt, *path)
        if isinstance(v, str) and v.startswith("0x") and len(v) == 42 and int(v, 16) != 0:
            return v
    return None


def deploy(client, account) -> tuple[str, str]:
    code = CONTRACT_PATH.read_text()
    fees = fee_quote(client)
    log(f"deploying {CONTRACT_PATH.name} ({len(code)} bytes), fee deposit {int(fees['fee_value']) / 1e18:.4f} GEN")
    tx = client.deploy_contract(code=code, args=[], fees=fees)
    tx_hex = tx if isinstance(tx, str) else tx.hex()
    tx_hex = tx_hex if tx_hex.startswith("0x") else "0x" + tx_hex
    log(f"  -> deploy tx {tx_hex}")
    receipt = wait(client, tx_hex)
    addr = extract_address(receipt)
    if not addr:
        raise SystemExit(f"could not find the contract address in the receipt:\n{json.dumps(receipt, default=str)[:2000]}")
    return addr, tx_hex


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--redeploy", action="store_true")
    ap.add_argument("--feeds-base", default=os.environ.get("FEEDS_BASE_URL", DEFAULT_FEEDS_BASE))
    args = ap.parse_args()
    base = args.feeds_base.rstrip("/")

    account = ensure_account()
    client = make_client(account)
    log(f"network Studio Next chain {CHAIN_ID}  rpc {RPC_URL}\ndeployer {account.address}")
    ensure_funded(client, account)

    dep = {}
    if DEPLOYMENT_PATH.exists() and not args.redeploy:
        dep = load_deployment()
    sha = source_sha256()
    if dep.get("contract_address") and dep.get("source_sha256") == sha:
        log(f"contract already deployed at {dep['contract_address']} (source unchanged)")
    else:
        addr, tx = deploy(client, account)
        dep = {
            "network": "studio-next", "chain_id": CHAIN_ID, "rpc_url": RPC_URL,
            "contract_address": addr, "explorer_url": explorer_address(addr),
            "deployer": account.address, "deploy_tx": tx, "deploy_tx_url": explorer_tx(tx),
            "source": "contracts/omni_sanctions.py", "source_sha256": sha,
            "feeds_base_url": base, "seed": {"registries": [], "cases": []}, "deployed_at": now(),
        }
        save_deployment(dep)
        log(f"deployed {addr}")
    addr = dep["contract_address"]
    seed = dep.setdefault("seed", {"registries": [], "cases": []})
    dep["feeds_base_url"] = base

    # ---- watchlists + gateway ------------------------------------------------
    existing = read(client, addr, "get_all_registries")
    for name, authority, fname in WATCHLISTS:
        if any(r["name"] == name for r in existing):
            continue
        tx, _ = write(client, addr, "add_registry", [name, authority, f"{base}/{fname}"], label=f"add_registry {name}")
        seed["registries"].append({"name": name, "feed": f"{base}/{fname}", "tx": tx})
        save_deployment(dep)
    if read(client, addr, "get_oracle_metrics")["telemetry_url"] != f"{base}/telemetry/{{address}}.json":
        tx, _ = write(client, addr, "set_telemetry_url", [f"{base}/telemetry/{{address}}.json"], label="set_telemetry_url")
        seed["telemetry_tx"] = tx
        save_deployment(dep)
    if not read(client, addr, "get_subscriber", [account.address.lower()])["registered"]:
        tx, _ = write(client, addr, "register_subscriber", ["OmniSanctions Steward Desk"], label="register_subscriber")
        seed["subscriber_tx"] = tx
        save_deployment(dep)

    # ---- commit + verify each feed's root_hash --------------------------------
    # The contract fails closed (FEED_INTEGRITY_MISMATCH) unless a feed hashes to
    # the root committed on-chain, so publish the roots of the files in feeds/.
    import hashlib
    from common import ROOT
    onchain = {r["name"]: r for r in read(client, addr, "get_all_registries")}
    for name, _, fname in WATCHLISTS:
        local = hashlib.sha256((ROOT / "feeds" / fname).read_bytes()).hexdigest()
        if onchain[name]["root_hash"] != local:
            tx, _ = write(client, addr, "sync_registry", [onchain[name]["registry_id"]], label=f"sync_registry {name}")
            seed.setdefault("sync_txs", {})[name] = tx
            onchain = {r["name"]: r for r in read(client, addr, "get_all_registries")}
            save_deployment(dep)
        if onchain[name]["root_hash"] != local:
            raise SystemExit(f"root_hash for {name} is {onchain[name]['root_hash']} but feeds/{fname} hashes to {local}. "
                             "Is the published feed identical to the local file?")
        log(f"  root_hash verified {name}: {local}")
    seed["root_hashes"] = {n: onchain[n]["root_hash"] for n, _, _ in WATCHLISTS}

    # ---- feed preflight ------------------------------------------------------
    probes = [f"{base}/{f}" for _, _, f in WATCHLISTS] + [f"{base}/telemetry/{EXCHANGE.lower()}.json"]
    feeds_up = all(reachable(u) for u in probes)
    if not feeds_up:
        log(f"\n! feeds not reachable at {base} - cases will be requested but left PENDING.\n"
            "  Publish feeds/ (see README) and finish with:  scripts/interact_live.py resolve <id>\n")

    # ---- seed cases ----------------------------------------------------------
    done = {c["address"].lower(): c for c in seed["cases"]}
    for label, address, alias, expected, do_resolve in SEED_CASES:
        rec = done.get(address.lower())
        if rec is None:  # adopt a case a previous, interrupted run already opened
            found = [c for c in read(client, addr, "get_all_cases") if c["target_address"] == address.lower()]
            if found:
                c0 = max(found, key=lambda c: c["case_id"])
                rec = {"case_id": c0["case_id"], "label": label, "address": address, "alias": alias,
                       "expected_tier": expected, "request_tx": None, "resolve_tx": None}
                seed["cases"].append(rec)
                save_deployment(dep)
        if rec is None:
            log(f"\ncase: {label}")
            tx, _ = write(client, addr, "request_compliance_screening", [address, alias],
                          value=SCREENING_FEE, label="request_compliance_screening")
            cases = read(client, addr, "get_all_cases")
            case_id = max(c["case_id"] for c in cases if c["target_address"] == address.lower())
            rec = {"case_id": case_id, "label": label, "address": address, "alias": alias,
                   "expected_tier": expected, "request_tx": tx, "resolve_tx": None}
            seed["cases"].append(rec)
            save_deployment(dep)
        case = read(client, addr, "get_case", [rec["case_id"]])
        log(f"  case {rec['case_id']}: {case['status']} {case['risk_tier']} conf={case['confidence_score']}")

    dep["metrics"] = read(client, addr, "get_oracle_metrics")
    save_deployment(dep)
    log(f"\nexplorer: {dep['explorer_url']}\nrecord:   {DEPLOYMENT_PATH}")


if __name__ == "__main__":
    main()
