"""Shared helpers for the Studio Next deploy / interaction scripts."""

from __future__ import annotations

import hashlib
import json
import os
import stat
import sys
import time
from pathlib import Path

from eth_account import Account
from genlayer_py import create_client
from genlayer_py.chains import studio_devnet

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"
DEPLOYMENT_PATH = ROOT / "deployments" / "studio-next.json"
CONTRACT_PATH = ROOT / "contracts" / "omni_sanctions.py"

RPC_URL = os.environ.get("GENLAYER_RPC_URL", "https://studio-next.genlayer.com/api")
EXPLORER_URL = "https://explorer-studio-next.genlayer.com"
CHAIN_ID = 61997
GEN = 10**18
SCREENING_FEE = 2 * 10**16  # 0.02 GEN, mirrors the contract constant
FUND_AMOUNT = 10 * GEN
DEFAULT_FEEDS_BASE = "https://raw.githubusercontent.com/Handik4/OmniSanctions/main/feeds"


def log(msg: str) -> None:
    print(msg, flush=True)


# --------------------------------------------------------------------- .env
def _read_env() -> dict[str, str]:
    out: dict[str, str] = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip()
    return out


def ensure_account():
    """Load the deployer key from .env, generating one on first run.

    The file is git-ignored and chmod 600. The key is only ever a Studio Next
    testnet key funded through sim_fundAccount -- it holds no real value."""
    env = _read_env()
    key = env.get("PRIVATE_KEY") or os.environ.get("PRIVATE_KEY")
    if not key:
        acct = Account.create()
        key = acct.key.hex()
        key = key if key.startswith("0x") else "0x" + key
        body = (
            "# OmniSanctions deployer key (Studio Next testnet only). Git-ignored.\n"
            f"PRIVATE_KEY={key}\n"
        )
        fd = os.open(ENV_PATH, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as fh:
            fh.write(body)
        log(f"generated new deployer key -> {ENV_PATH.name} (mode 600)")
    else:
        ENV_PATH.chmod(stat.S_IRUSR | stat.S_IWUSR) if ENV_PATH.exists() else None
    return Account.from_key(key)


# ------------------------------------------------------------------- client
def make_client(account=None):
    account = account or ensure_account()
    return create_client(chain=studio_devnet, endpoint=RPC_URL, account=account)


def ensure_funded(client, account, minimum: int = 2 * GEN, amount: int = FUND_AMOUNT) -> int:
    bal = client.get_balance(account.address)
    if bal < minimum:
        client.fund_account(account.address, amount)
        bal = client.get_balance(account.address)
        log(f"funded {account.address} via sim_fundAccount -> {bal / GEN:.4f} GEN")
    return bal


# ------------------------------------------------------------- transactions
def fee_quote(client) -> dict:
    """Studio Next fee distribution (~0.1 GEN). Without it every write fails
    with FeesDistributionMissing."""
    return client.estimate_transaction_fees()


def wait(client, tx_hash, retries: int = 200, interval: int = 3000, until: str = "decided"):
    return client.wait_for_transaction_receipt(
        transaction_hash=tx_hash, wait_until=until, retries=retries, interval=interval, full_transaction=False
    )


def _status(receipt) -> str:
    """Consensus outcome, e.g. MAJORITY_AGREE."""
    if isinstance(receipt, dict):
        return str(receipt.get("result_name") or receipt.get("resultName") or receipt.get("status"))
    return str(getattr(receipt, "result_name", receipt))


def _exec_result(receipt) -> str:
    """Execution verdict of the leader: SUCCESS / ERROR."""
    try:
        return str(receipt["txExecutionResultName"])
    except Exception:
        return ""


def write(client, address, method, args=None, value: int = 0, label: str = "") -> tuple[str, dict]:
    fees = fee_quote(client)
    tx = client.write_contract(address=address, function_name=method, args=args or [], value=value, fees=fees)
    tx_hex = tx if isinstance(tx, str) else tx.hex()
    tx_hex = tx_hex if tx_hex.startswith("0x") else "0x" + tx_hex
    log(f"  -> {label or method}: {tx_hex}")
    receipt = wait(client, tx_hex)
    status = _status(receipt)
    result = _exec_result(receipt)
    log(f"     status={status} {result}".rstrip())
    if result and result not in ("FINISHED_WITH_RETURN", "SUCCESS"):
        import re as _re
        m = _re.search(r"'payload': '([^']*)'", str(receipt))
        raise RuntimeError(f"{label or method} failed: {m.group(1) if m else result} (tx {tx_hex})")
    return tx_hex, receipt


def read(client, address, method, args=None):
    return client.read_contract(address=address, function_name=method, args=args or [])


# --------------------------------------------------------------- deployment
def source_sha256() -> str:
    return hashlib.sha256(CONTRACT_PATH.read_bytes()).hexdigest()


def load_deployment() -> dict:
    if not DEPLOYMENT_PATH.exists():
        raise SystemExit("deployments/studio-next.json not found - run scripts/deploy.py first")
    return json.loads(DEPLOYMENT_PATH.read_text())


def save_deployment(data: dict) -> None:
    DEPLOYMENT_PATH.parent.mkdir(parents=True, exist_ok=True)
    DEPLOYMENT_PATH.write_text(json.dumps(data, indent=2) + "\n")


def now() -> int:
    return int(time.time())


def explorer_tx(tx_hash: str) -> str:
    return f"{EXPLORER_URL}/tx/{tx_hash}"


def explorer_address(addr: str) -> str:
    return f"{EXPLORER_URL}/address/{addr}"


if __name__ == "__main__":
    sys.exit("import me")
