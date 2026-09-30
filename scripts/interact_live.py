#!/usr/bin/env python3
"""Drive the deployed OmniSanctions contract on Studio Next.

    interact_live.py status
    interact_live.py cases
    interact_live.py check  <address>
    interact_live.py screen <address> [alias]     # pays the 0.02 GEN fee, then resolves
    interact_live.py request <address> [alias]    # pays the fee only
    interact_live.py resolve <case_id>
    interact_live.py cancel  <case_id>
    interact_live.py refund                        # claim refunded fees
    interact_live.py register "Org Name"
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from common import (  # noqa: E402
    SCREENING_FEE, ensure_account, ensure_funded, load_deployment, log, make_client, read, write,
)


def show(obj) -> None:
    print(json.dumps(obj, indent=2, default=str))


def main(argv: list[str]) -> None:
    if not argv:
        raise SystemExit(__doc__)
    cmd, rest = argv[0], argv[1:]
    dep = load_deployment()
    addr = dep["contract_address"]
    account = ensure_account()
    client = make_client(account)
    me = account.address.lower()

    if cmd == "status":
        show(read(client, addr, "get_oracle_metrics"))
        show(read(client, addr, "get_all_registries"))
    elif cmd == "cases":
        for c in read(client, addr, "get_all_cases"):
            print(f"#{c['case_id']:<3} {c['status']:<9} {c['risk_tier']:<18} conf={c['confidence_score']:<3} "
                  f"{c['target_address']}  {c['entity_alias']}")
    elif cmd == "check":
        show(read(client, addr, "check_compliance", [rest[0]]))
    elif cmd in ("screen", "request"):
        ensure_funded(client, account)
        target, alias = rest[0], (rest[1] if len(rest) > 1 else "")
        write(client, addr, "request_compliance_screening", [target, alias], value=SCREENING_FEE)
        case_id = max(c["case_id"] for c in read(client, addr, "get_all_cases") if c["target_address"] == target.lower())
        log(f"case {case_id} opened")
        if cmd == "screen":
            write(client, addr, "resolve_compliance_consensus", [case_id])
            show(read(client, addr, "get_case", [case_id]))
    elif cmd == "resolve":
        ensure_funded(client, account)
        write(client, addr, "resolve_compliance_consensus", [int(rest[0])])
        show(read(client, addr, "get_case", [int(rest[0])]))
    elif cmd == "cancel":
        write(client, addr, "cancel_screening", [int(rest[0])])
    elif cmd == "refund":
        log(f"claimable: {read(client, addr, 'claimable_of', [me])}")
        write(client, addr, "claim_refund")
    elif cmd == "register":
        write(client, addr, "register_subscriber", [rest[0]])
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
