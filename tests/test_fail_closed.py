"""Fail-closed behaviour: unreachable / corrupt evidence => TIER_UNKNOWN + refund."""

import json

import pytest
from conftest import *


@pytest.fixture
def env(direct_vm, direct_deploy, direct_alice):
    return configured(direct_vm, direct_deploy, direct_alice)


def fresh(vm, ofac=None, eu=None, un=None, gateway=None):
    """Register mocks; each argument is a mock response dict, or None for the healthy default."""
    vm.clear_mocks()
    vm.mock_web(r".*ofac.*", ofac or ok(OFAC_FEED))
    vm.mock_web(r".*eu-consolidated.*", eu or ok(EU_FEED))
    vm.mock_web(r".*un-securitycouncil.*", un or ok(UN_FEED))
    vm.mock_web(r".*gateway\.omnisanctions.*", gateway or ok(telem(CLEAN)))
    mock_verdict(vm, T1)


def assert_failed_closed(env, vm, who, case, refund=FEE):
    assert case["risk_tier"] == TU and case["status"] == "REJECTED" and case["outcome"] == "INCONCLUSIVE"
    assert case["confidence_score"] == 0 and case["audit_rationale"].startswith("FAIL-CLOSED")
    assert env.claimable_of(who) == str(refund)
    assert env.get_oracle_metrics()["escrow"] == "0"


def test_ofac_404_fails_closed(env, direct_vm, direct_bob):
    fresh(direct_vm, ofac={"status": 404, "body": "nope"})
    assert_failed_closed(env, direct_vm, hx(direct_bob), screen(env, direct_vm, direct_bob, CLEAN))


def test_ofac_500_fails_closed(env, direct_vm, direct_bob):
    fresh(direct_vm, ofac={"status": 500, "body": ""})
    assert_failed_closed(env, direct_vm, hx(direct_bob), screen(env, direct_vm, direct_bob, CLEAN))


def test_rate_limited_feed_fails_closed(env, direct_vm, direct_bob):
    fresh(direct_vm, eu={"status": 429, "body": ""})
    assert_failed_closed(env, direct_vm, hx(direct_bob), screen(env, direct_vm, direct_bob, CLEAN))


def test_redirect_status_fails_closed(env, direct_vm, direct_bob):
    fresh(direct_vm, un={"status": 302, "body": ""})
    assert_failed_closed(env, direct_vm, hx(direct_bob), screen(env, direct_vm, direct_bob, CLEAN))


def test_partial_coverage_never_certifies_clean(env, direct_vm, direct_bob):
    fresh(direct_vm, un={"status": 503, "body": ""})  # OFAC + EU fine, UN down
    case = screen(env, direct_vm, direct_bob, CLEAN)
    assert case["risk_tier"] == TU and "UN Security Council" in case["audit_rationale"]


def test_all_feeds_down_fails_closed(env, direct_vm, direct_bob):
    down = {"status": 503, "body": ""}
    fresh(direct_vm, ofac=down, eu=down, un=down)
    case = screen(env, direct_vm, direct_bob, CLEAN)
    assert_failed_closed(env, direct_vm, hx(direct_bob), case)


def test_corrupt_json_fails_closed(env, direct_vm, direct_bob):
    fresh(direct_vm, ofac=ok("{not json"))
    case = screen(env, direct_vm, direct_bob, CLEAN)
    assert_failed_closed(env, direct_vm, hx(direct_bob), case)
    assert "invalid" in case["audit_rationale"]


def test_html_error_page_with_200_fails_closed(env, direct_vm, direct_bob):
    fresh(direct_vm, ofac=ok("<html><body>Service Unavailable</body></html>"))
    assert_failed_closed(env, direct_vm, hx(direct_bob), screen(env, direct_vm, direct_bob, CLEAN))


@pytest.mark.parametrize("payload", [
    {"data": []},                      # wrong envelope
    {"entries": "0xabc"},              # entries not a list
    {"entries": []},                   # wiped list
    [],                                # empty bare list
    ["0xabc", 42],                     # non-string element
    {"entries": [7]},                  # non-object entry
    "just a string",
    42,
    None,
])
def test_feed_schema_violations_fail_closed(env, direct_vm, direct_bob, payload):
    fresh(direct_vm, ofac=ok(json.dumps(payload)))
    assert screen(env, direct_vm, direct_bob, CLEAN)["risk_tier"] == TU


def test_missing_body_fails_closed(env, direct_vm, direct_bob):
    fresh(direct_vm, ofac={"status": 200, "body": ""})
    assert screen(env, direct_vm, direct_bob, CLEAN)["risk_tier"] == TU


def test_telemetry_gateway_down_fails_closed(env, direct_vm, direct_bob):
    fresh(direct_vm, gateway={"status": 502, "body": ""})
    case = screen(env, direct_vm, direct_bob, CLEAN)
    assert_failed_closed(env, direct_vm, hx(direct_bob), case)
    assert "telemetry gateway" in case["audit_rationale"]


@pytest.mark.parametrize("payload", [
    {"address": CLEAN},                                                        # counters missing
    {"address": CLEAN, "mixer_hops": "0", "sanctioned_counterparties": 0},     # string int
    {"address": CLEAN, "mixer_hops": True, "sanctioned_counterparties": 0},    # bool is not an int
    {"address": CLEAN, "mixer_hops": -1, "sanctioned_counterparties": 0},      # negative
    {"address": CLEAN, "mixer_hops": 0.5, "sanctioned_counterparties": 0},     # float
    {"address": VAULT, "mixer_hops": 0, "sanctioned_counterparties": 0},       # telemetry for another address
    {"mixer_hops": 0, "sanctioned_counterparties": 0},                         # no address echo
    {"address": CLEAN, "mixer_hops": 0, "sanctioned_counterparties": 0,
     "attributed_to_sanctioned_cluster": "yes"},                               # non-bool flag
    [],
])
def test_telemetry_schema_violations_fail_closed(env, direct_vm, direct_bob, payload):
    fresh(direct_vm, gateway=ok(json.dumps(payload)))
    assert screen(env, direct_vm, direct_bob, CLEAN)["risk_tier"] == TU


def test_telemetry_not_configured_fails_closed(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    c.add_registry("US OFAC SDN", "OFAC", OFAC_URL)
    fresh(direct_vm)
    assert screen(c, direct_vm, direct_bob, CLEAN)["risk_tier"] == TU


def test_no_active_registry_fails_closed(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    c.set_telemetry_url(GATEWAY)
    fresh(direct_vm)
    case = screen(c, direct_vm, direct_bob, CLEAN)
    assert case["risk_tier"] == TU and "no active watchlist" in case["audit_rationale"]


def test_fail_closed_does_not_populate_compliance_cache(env, direct_vm, direct_bob):
    fresh(direct_vm, ofac={"status": 500, "body": ""})
    screen(env, direct_vm, direct_bob, CLEAN)
    r = env.check_compliance(CLEAN)
    assert r["screened"] is False and r["tier"] == TU


def test_fail_closed_counted_and_not_screened(env, direct_vm, direct_bob):
    fresh(direct_vm, ofac={"status": 500, "body": ""})
    screen(env, direct_vm, direct_bob, CLEAN)
    m = env.get_oracle_metrics()
    assert m["inconclusive"] == 1 and m["total_screened"] == 0 and m["clean"] == 0


def test_fee_refund_is_full_and_not_shared_with_pools(env, direct_vm, direct_bob):
    fresh(direct_vm, ofac={"status": 500, "body": ""})
    screen(env, direct_vm, direct_bob, CLEAN)
    m = env.get_oracle_metrics()
    assert m["treasury"] == "0" and m["validator_pool"] == "0" and m["refunds_owed"] == str(FEE)


def test_refund_claimable_then_zeroed(env, direct_vm, direct_bob):
    fresh(direct_vm, ofac={"status": 500, "body": ""})
    screen(env, direct_vm, direct_bob, CLEAN)
    direct_vm.sender = direct_bob
    assert env.claim_refund() == str(FEE)
    assert env.claimable_of(hx(direct_bob)) == "0" and tracked(env) == 0


def test_refund_cannot_be_claimed_twice(env, direct_vm, direct_bob):
    fresh(direct_vm, ofac={"status": 500, "body": ""})
    screen(env, direct_vm, direct_bob, CLEAN)
    direct_vm.sender = direct_bob
    env.claim_refund()
    with direct_vm.expect_revert("ERR_NOTHING_TO_CLAIM"):
        env.claim_refund()


def test_refund_only_claimable_by_requestor(env, direct_vm, direct_bob, direct_charlie):
    fresh(direct_vm, ofac={"status": 500, "body": ""})
    screen(env, direct_vm, direct_bob, CLEAN)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("ERR_NOTHING_TO_CLAIM"):
        env.claim_refund()


def test_can_rescreen_after_inconclusive_without_cooldown(env, direct_vm, direct_bob):
    fresh(direct_vm, ofac={"status": 500, "body": ""})
    assert screen(env, direct_vm, direct_bob, CLEAN)["risk_tier"] == TU
    fresh(direct_vm)
    assert screen(env, direct_vm, direct_bob, CLEAN)["risk_tier"] == T1


def test_validator_disagrees_when_it_can_reach_a_feed_the_leader_could_not(env, direct_vm, direct_bob):
    fresh(direct_vm, ofac={"status": 500, "body": ""})
    screen(env, direct_vm, direct_bob, CLEAN)  # leader outcome: INCONCLUSIVE
    fresh(direct_vm)  # the validator sees a healthy world
    assert direct_vm.run_validator() is False
