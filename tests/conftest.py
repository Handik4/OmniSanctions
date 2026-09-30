"""Shared helpers for OmniSanctions direct-mode tests (pure ASCII)."""

import json

CONTRACT = "contracts/omni_sanctions.py"
ATTO = 10**18
FEE = 2 * 10**16  # 0.02 GEN

T1, T2, T3, TU = "TIER_1_CLEAN", "TIER_2_ELEVATED", "TIER_3_SANCTIONED", "TIER_UNKNOWN"

# Feed hosts. The substrings ofac / eu / un / gateway key the per-feed mocks.
OFAC_URL = "https://feeds.omnisanctions.test/ofac-sdn.json"
EU_URL = "https://feeds.omnisanctions.test/eu-consolidated.json"
UN_URL = "https://feeds.omnisanctions.test/un-securitycouncil.json"
GATEWAY = "https://gateway.omnisanctions.test/v1/address/{address}"

SANCTIONED = "0x098B716B8Aaf21512996dC57EB0615e2383E2f96"  # OFAC-listed Lazarus address
CLEAN = "0x28C6c06298d514Db089934071355E5743bf21d60"
VAULT = "0x1111111111111111111111111111111111111111"
OTHER = "0x2222222222222222222222222222222222222222"


def ok(body) -> dict:
    return {"status": 200, "body": body if isinstance(body, str) else json.dumps(body)}


def entries(*items) -> dict:
    return {"entries": list(items)}


OFAC_FEED = entries(
    {"address": SANCTIONED, "name": "Lazarus Group", "aliases": ["APT38", "Hidden Cobra"], "program": "DPRK3"},
    {"address": "0x3333333333333333333333333333333333333333", "name": "Blender.io", "program": "CYBER2"},
)
EU_FEED = entries(
    {"addresses": ["0x4444444444444444444444444444444444444444"], "name": "Garantex Europe OU",
     "aliases": ["Garantex"], "program": "EU-RUS"},
)
UN_FEED = ["0x5555555555555555555555555555555555555555", "0x6666666666666666666666666666666666666666"]


def telem(address, hops=0, cps=0, cluster=False, label="", labels=None, notes=""):
    return {
        "address": address,
        "mixer_hops": hops,
        "sanctioned_counterparties": cps,
        "attributed_to_sanctioned_cluster": cluster,
        "cluster_label": label,
        "labels": labels or [],
        "counterparty_notes": notes,
    }


def mock_feeds(vm, ofac=OFAC_FEED, eu=EU_FEED, un=UN_FEED):
    vm.mock_web(r".*ofac.*", ok(ofac))
    vm.mock_web(r".*eu-consolidated.*", ok(eu))
    vm.mock_web(r".*un-securitycouncil.*", ok(un))


def mock_telemetry(vm, payload):
    vm.mock_web(r".*gateway\.omnisanctions.*", ok(payload))


def mock_verdict(vm, tier, confidence=80, rationale="Forensic reasoning over the supplied evidence.", entity=""):
    payload = {"tier": tier, "confidence": confidence, "rationale": rationale, "matched_entity": entity}
    # Double-encoded: the harness json.loads()s the mock, then exec_prompt(json) decodes again.
    vm.mock_llm(r".*", json.dumps(json.dumps(payload)))


def fund(vm, who, amount=1000 * ATTO):
    try:
        vm.deal(who, amount)
    except Exception:
        pass


def configured(vm, direct_deploy, governor):
    """Deploy as `governor`, seed the three registries and the telemetry gateway."""
    vm.sender = governor
    c = direct_deploy(CONTRACT)
    vm.sender = governor
    c.add_registry("US OFAC Specially Designated Nationals", "US Treasury OFAC", OFAC_URL)
    c.add_registry("EU Consolidated Financial Sanctions", "European Commission FSF", EU_URL)
    c.add_registry("UN Security Council ISIL/Al-Qaida", "UN Security Council", UN_URL)
    c.set_telemetry_url(GATEWAY)
    return c


def request(c, vm, who, address, alias="", value=FEE):
    fund(vm, who)
    vm.sender = who
    vm.value = value
    try:
        return c.request_compliance_screening(address, alias)
    finally:
        vm.value = 0


def resolve(c, vm, who, case_id):
    vm.sender = who
    return c.resolve_compliance_consensus(case_id)


def screen(c, vm, who, address, alias=""):
    """Request + resolve in one step; returns the resolved case dict."""
    cid = request(c, vm, who, address, alias)
    resolve(c, vm, who, cid)
    return c.get_case(cid)


def warp_later(vm, seconds):
    import time
    from datetime import datetime, timezone

    later = datetime.fromtimestamp(time.time() + seconds, tz=timezone.utc)
    vm.warp(later.strftime("%Y-%m-%dT%H:%M:%SZ"))


def tracked(c) -> int:
    return int(c.solvency()["tracked_liabilities"])


def hx(who) -> str:
    """Lowercase 0x hex for a fixture account (bytes or Address)."""
    if isinstance(who, (bytes, bytearray)):
        return "0x" + bytes(who).hex()
    return who.as_hex.lower()
