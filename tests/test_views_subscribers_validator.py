"""Views, subscribers, registry sync, similarity scorer, validator agreement."""

import hashlib
import json

import pytest
from conftest import *


@pytest.fixture
def env(direct_vm, direct_deploy, direct_alice):
    c = configured(direct_vm, direct_deploy, direct_alice)
    mock_feeds(direct_vm)
    return c


# ---------------------------------------------------------------- subscribers
def test_register_subscriber(env, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    env.register_subscriber("Aave Labs")
    s = env.get_subscriber(hx(direct_bob))
    assert s["registered"] and s["org_name"] == "Aave Labs"
    assert s["subscription_tier"] == "STANDARD" and s["queries_conducted"] == 0


def test_unregistered_subscriber_view(env, direct_bob):
    assert env.get_subscriber(hx(direct_bob)) == {"registered": False}


def test_duplicate_registration_rejected(env, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    env.register_subscriber("Aave Labs")
    with direct_vm.expect_revert("ERR_INVALID_SUBSCRIBER"):
        env.register_subscriber("Aave Labs II")


@pytest.mark.parametrize("name", ["", "   ", "N" * 65])
def test_bad_org_names_rejected(env, direct_vm, direct_bob, name):
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("ERR_INVALID_SUBSCRIBER"):
        env.register_subscriber(name)


def test_queries_conducted_counts_only_registered(env, direct_vm, direct_bob, direct_charlie):
    direct_vm.sender = direct_bob
    env.register_subscriber("Compound")
    request(env, direct_vm, direct_bob, CLEAN)
    request(env, direct_vm, direct_bob, VAULT)
    request(env, direct_vm, direct_charlie, OTHER)  # unregistered: allowed, uncounted
    assert env.get_subscriber(hx(direct_bob))["queries_conducted"] == 2
    assert env.get_subscriber(hx(direct_charlie)) == {"registered": False}
    assert env.get_oracle_metrics()["subscribers"] == 1


def test_suspended_subscriber_cannot_screen(env, direct_vm, direct_alice, direct_bob):
    direct_vm.sender = direct_bob
    env.register_subscriber("Rogue Desk")
    direct_vm.sender = direct_alice
    env.set_subscription_tier(hx(direct_bob), "SUSPENDED")
    with direct_vm.expect_revert("suspended"):
        request(env, direct_vm, direct_bob, CLEAN)


def test_governor_can_upgrade_tier(env, direct_vm, direct_alice, direct_bob):
    direct_vm.sender = direct_bob
    env.register_subscriber("Maker")
    direct_vm.sender = direct_alice
    env.set_subscription_tier(hx(direct_bob), "INSTITUTIONAL")
    assert env.get_subscriber(hx(direct_bob))["subscription_tier"] == "INSTITUTIONAL"


def test_unknown_tier_name_rejected(env, direct_vm, direct_alice, direct_bob):
    direct_vm.sender = direct_bob
    env.register_subscriber("Maker")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("ERR_INVALID_SUBSCRIBER"):
        env.set_subscription_tier(hx(direct_bob), "PLATINUM")


# ----------------------------------------------------------------------- views
def test_check_compliance_unscreened(env):
    r = env.check_compliance(CLEAN)
    assert r["screened"] is False and r["tier"] == TU and r["blocked"] is False and r["case_id"] == 0


def test_check_compliance_pending(env, direct_vm, direct_bob):
    request(env, direct_vm, direct_bob, CLEAN)
    r = env.check_compliance(CLEAN)
    assert r["pending"] is True and r["screened"] is False


def test_check_compliance_returns_latest_verdict_and_timestamp(env, direct_vm, direct_bob):
    screen(env, direct_vm, direct_bob, SANCTIONED)
    r = env.check_compliance(SANCTIONED.lower())
    case = env.get_case(r["case_id"])
    assert r["timestamp"] == case["resolved_at"] > 0 and r["case_id"] == 1


def test_check_compliance_malformed_address_is_unscreened(env):
    r = env.check_compliance("not-an-address")
    assert r["screened"] is False and r["blocked"] is False


def test_check_compliance_not_blocked_for_clean(env, direct_vm, direct_bob):
    mock_telemetry(direct_vm, telem(CLEAN))
    mock_verdict(direct_vm, T1)
    screen(env, direct_vm, direct_bob, CLEAN)
    r = env.check_compliance(CLEAN)
    assert r["tier"] == T1 and r["blocked"] is False and r["screened"] is True


def test_check_compliance_tracks_newest_verdict(env, direct_vm, direct_bob):
    mock_telemetry(direct_vm, telem(CLEAN))
    mock_verdict(direct_vm, T1)
    screen(env, direct_vm, direct_bob, CLEAN)
    warp_later(direct_vm, 3700)
    direct_vm.clear_mocks()
    mock_feeds(direct_vm, ofac=entries({"address": CLEAN, "name": "Newly Listed Exchange", "program": "CYBER"}))
    screen(env, direct_vm, direct_bob, CLEAN)
    assert env.check_compliance(CLEAN)["tier"] == T3 and env.check_compliance(CLEAN)["case_id"] == 2


def test_get_all_cases_in_order(env, direct_vm, direct_bob):
    for a in (SANCTIONED, "0x4444444444444444444444444444444444444444"):
        screen(env, direct_vm, direct_bob, a)
    cases = env.get_all_cases()
    assert [c["case_id"] for c in cases] == [1, 2]


def test_get_all_cases_empty(env):
    assert env.get_all_cases() == []


def test_get_all_registries(env):
    regs = env.get_all_registries()
    assert [r["name"] for r in regs] == [
        "US OFAC Specially Designated Nationals",
        "EU Consolidated Financial Sanctions",
        "UN Security Council ISIL/Al-Qaida",
    ]
    assert all(r["is_active"] and r["root_hash"] == "" for r in regs)


def test_deactivated_registry_still_listed_but_not_counted(env, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    env.set_registry_active(3, False)
    assert len(env.get_all_registries()) == 3 and env.get_oracle_metrics()["active_watchlists"] == 2


def test_metrics_zero_state(env):
    m = env.get_oracle_metrics()
    assert m["total_screened"] == 0 and m["sanctioned_isolated"] == 0 and m["active_watchlists"] == 3
    assert m["mean_latency_seconds"] == 0 and m["telemetry_url"] == GATEWAY


def test_metrics_counts_by_tier(env, direct_vm, direct_bob):
    screen(env, direct_vm, direct_bob, SANCTIONED)
    mock_telemetry(direct_vm, telem(CLEAN))
    mock_verdict(direct_vm, T1)
    screen(env, direct_vm, direct_bob, CLEAN)
    m = env.get_oracle_metrics()
    assert (m["total_screened"], m["sanctioned_isolated"], m["clean"], m["elevated"]) == (2, 1, 1, 0)


def test_mean_latency_reflects_block_time(env, direct_vm, direct_bob):
    cid = request(env, direct_vm, direct_bob, SANCTIONED)
    warp_later(direct_vm, 40)
    resolve(env, direct_vm, direct_bob, cid)
    assert 39 <= env.get_oracle_metrics()["mean_latency_seconds"] <= 42


def test_whoami(env, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    assert env.whoami() == hx(direct_bob)


# ---------------------------------------------------------- similarity scorer
def test_similarity_identical_is_100(env):
    assert env.preview_similarity("Lazarus Group", "lazarus  GROUP!") == 100


def test_similarity_disjoint_is_low(env):
    assert env.preview_similarity("Lazarus Group", "Binance Exchange") < 40


def test_similarity_is_symmetric(env):
    assert env.preview_similarity("Blender.io", "Blender") == env.preview_similarity("Blender", "Blender.io")


def test_similarity_empty_is_zero(env):
    assert env.preview_similarity("", "Lazarus") == 0 and env.preview_similarity("!!!", "Lazarus") == 0


def test_similarity_single_typo_is_strong(env):
    assert env.preview_similarity("Lazarus Grup", "Lazarus Group") >= 85


def test_similarity_partial_name_is_weak_not_strong(env):
    s = env.preview_similarity("Lazarus", "Lazarus Group")
    assert 60 <= s < 85


def test_similarity_token_reorder(env):
    assert env.preview_similarity("Group Lazarus", "Lazarus Group") == 100


# --------------------------------------------------------------- registry sync
def test_sync_registry_commits_sha256_root(env, direct_vm, direct_alice):
    direct_vm.clear_mocks()
    body = json.dumps(OFAC_FEED)
    direct_vm.mock_web(r".*ofac.*", {"status": 200, "body": body})
    direct_vm.sender = direct_alice
    digest = env.sync_registry(1)
    assert digest == hashlib.sha256(body.encode()).hexdigest()
    r = env.get_all_registries()[0]
    assert r["root_hash"] == digest and r["entries_count"] == 2 and r["last_synced_timestamp"] > 0


def test_sync_registry_rejects_corrupt_feed(env, direct_vm, direct_alice):
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*ofac.*", ok("<html/>"))
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("[EXTERNAL]"):
        env.sync_registry(1)
    assert env.get_all_registries()[0]["root_hash"] == ""


def test_sync_registry_unreachable_is_transient(env, direct_vm, direct_alice):
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*ofac.*", {"status": 503, "body": ""})
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("[TRANSIENT]"):
        env.sync_registry(1)


def test_sync_unknown_registry(env, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("ERR_INVALID_REGISTRY"):
        env.sync_registry(77)


# ------------------------------------------------------ validator agreement
def leader_then(env, vm, who, address, alias, telemetry, tier, conf=80):
    vm.clear_mocks()
    mock_feeds(vm)
    mock_telemetry(vm, telemetry)
    mock_verdict(vm, tier, conf)
    return screen(env, vm, who, address, alias)


def test_validator_agrees_with_identical_reexecution(env, direct_vm, direct_bob):
    leader_then(env, direct_vm, direct_bob, OTHER, "Lazarus Group", telem(OTHER), T3, 80)
    assert direct_vm.run_validator() is True


def test_validator_agrees_within_confidence_tolerance(env, direct_vm, direct_bob):
    leader_then(env, direct_vm, direct_bob, OTHER, "Lazarus Group", telem(OTHER), T3, 80)
    mock_verdict(direct_vm, T3, 80)  # same world; override the leader's reported confidence instead
    lr = {"outcome": "FUZZY_RESOLUTION", "tier": T3, "confidence": 70, "rationale": "r", "matched_entity": "",
          "registries_checked": 3}
    assert direct_vm.run_validator(leader_result=lr) is True


def test_validator_rejects_confidence_outside_tolerance(env, direct_vm, direct_bob):
    leader_then(env, direct_vm, direct_bob, OTHER, "Lazarus Group", telem(OTHER), T3, 80)
    lr = {"outcome": "FUZZY_RESOLUTION", "tier": T3, "confidence": 99, "rationale": "r", "matched_entity": "",
          "registries_checked": 3}
    # validator recomputes 80; |99-80| = 19 <= 25 agrees, 99 vs a clamped-low validator would not
    direct_vm.clear_mocks()
    mock_feeds(direct_vm)
    mock_telemetry(direct_vm, telem(OTHER))
    mock_verdict(direct_vm, T3, 60)
    lr["confidence"] = 99
    assert direct_vm.run_validator(leader_result=lr) is False


def test_validator_rejects_tier_mismatch(env, direct_vm, direct_bob):
    leader_then(env, direct_vm, direct_bob, OTHER, "Lazarus Group", telem(OTHER), T3, 80)
    mock_verdict_swap = {"outcome": "FUZZY_RESOLUTION", "tier": T2, "confidence": 80, "rationale": "r",
                         "matched_entity": "", "registries_checked": 3}
    assert direct_vm.run_validator(leader_result=mock_verdict_swap) is False


def test_validator_rejects_leader_claiming_clean_when_feed_has_exact_hit(env, direct_vm, direct_bob):
    leader_then(env, direct_vm, direct_bob, SANCTIONED, "", telem(SANCTIONED), T1)
    # A malicious leader reports the sanctioned address as clean.
    lie = {"outcome": "CLEAN_ATTESTATION", "tier": T1, "confidence": 99, "rationale": "clean",
           "matched_entity": "", "registries_checked": 3}
    assert direct_vm.run_validator(leader_result=lie) is False


def test_validator_rejects_leader_error(env, direct_vm, direct_bob):
    leader_then(env, direct_vm, direct_bob, OTHER, "Lazarus Group", telem(OTHER), T3)
    assert direct_vm.run_validator(leader_error=Exception("[LLM_ERROR] boom")) is False


def test_validator_rejects_fabricated_inconclusive(env, direct_vm, direct_bob):
    leader_then(env, direct_vm, direct_bob, OTHER, "Lazarus Group", telem(OTHER), T3)
    lie = {"outcome": "INCONCLUSIVE", "tier": TU, "confidence": 0, "rationale": "x", "matched_entity": "",
           "registries_checked": 0}
    assert direct_vm.run_validator(leader_result=lie) is False
