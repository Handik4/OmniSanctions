"""Fees, treasury, solvency, spam defence, access control."""

import pytest
from conftest import *


@pytest.fixture
def env(direct_vm, direct_deploy, direct_alice):
    c = configured(direct_vm, direct_deploy, direct_alice)
    mock_feeds(direct_vm)
    return c


# ------------------------------------------------------------------- fee gate
@pytest.mark.parametrize("value", [0, 1, FEE - 1, FEE + 1, 2 * FEE, 10**18])
def test_wrong_fee_rejected(env, direct_vm, direct_bob, value):
    with direct_vm.expect_revert("ERR_INCORRECT_SCREENING_FEE"):
        request(env, direct_vm, direct_bob, CLEAN, value=value)
    assert env.get_oracle_metrics()["total_cases"] == 0 and tracked(env) == 0


def test_exact_fee_accepted_and_escrowed(env, direct_vm, direct_bob):
    cid = request(env, direct_vm, direct_bob, CLEAN)
    assert cid == 1 and tracked(env) == FEE
    m = env.get_oracle_metrics()
    assert m["escrow"] == str(FEE) and m["treasury"] == "0"


def test_case_records_fee_and_requestor(env, direct_vm, direct_bob):
    c = env.get_case(request(env, direct_vm, direct_bob, CLEAN, "Binance 14"))
    assert c["screening_fee"] == str(FEE) and c["requestor"] == hx(direct_bob)
    assert c["status"] == "PENDING" and c["risk_tier"] == TU and c["entity_alias"] == "Binance 14"


def test_screening_fee_is_two_hundredths_of_a_gen(env):
    assert env.get_oracle_metrics()["screening_fee"] == str(2 * 10**16)


def test_fee_split_70_30_on_resolution(env, direct_vm, direct_bob):
    screen(env, direct_vm, direct_bob, SANCTIONED)
    m = env.get_oracle_metrics()
    assert m["validator_pool"] == str(FEE * 7 // 10) and m["treasury"] == str(FEE * 3 // 10)
    assert m["escrow"] == "0"


def test_split_sums_to_fee_exactly(env, direct_vm, direct_bob):
    screen(env, direct_vm, direct_bob, SANCTIONED)
    m = env.get_oracle_metrics()
    assert int(m["validator_pool"]) + int(m["treasury"]) == FEE


def test_ledger_tracks_fees_over_a_mixed_sequence(env, direct_vm, direct_bob, direct_charlie):
    screen(env, direct_vm, direct_bob, SANCTIONED)                       # resolved
    screen(env, direct_vm, direct_charlie, "0x4444444444444444444444444444444444444444")  # resolved
    pending = request(env, direct_vm, direct_bob, VAULT)                  # pending
    assert tracked(env) == 3 * FEE
    m = env.get_oracle_metrics()
    assert int(m["escrow"]) + int(m["treasury"]) + int(m["validator_pool"]) + int(m["refunds_owed"]) == 3 * FEE
    assert env.get_case(pending)["status"] == "PENDING"


def test_solvency_invariant_after_refund_and_payouts(env, direct_vm, direct_alice, direct_bob):
    screen(env, direct_vm, direct_bob, SANCTIONED)
    direct_vm.sender = direct_alice
    env.payout_validator_pool(hx(direct_bob), 5 * 10**15)
    env.withdraw_treasury(hx(direct_bob), 10**15)
    assert tracked(env) == FEE - 5 * 10**15 - 10**15


# ---------------------------------------------------------------- withdrawals
def test_withdraw_treasury_governor_only(env, direct_vm, direct_bob):
    screen(env, direct_vm, direct_bob, SANCTIONED)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("ERR_UNAUTHORIZED"):
        env.withdraw_treasury(hx(direct_bob), 1)


def test_withdraw_treasury_reduces_ledger(env, direct_vm, direct_alice, direct_bob):
    screen(env, direct_vm, direct_bob, SANCTIONED)
    direct_vm.sender = direct_alice
    env.withdraw_treasury(hx(direct_alice), 10**15)
    assert env.get_oracle_metrics()["treasury"] == str(FEE * 3 // 10 - 10**15)


def test_cannot_overdraw_treasury(env, direct_vm, direct_alice, direct_bob):
    screen(env, direct_vm, direct_bob, SANCTIONED)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("ERR_INVALID_STATE"):
        env.withdraw_treasury(hx(direct_alice), FEE)
    with direct_vm.expect_revert("ERR_INVALID_STATE"):
        env.withdraw_treasury(hx(direct_alice), 0)


def test_cannot_withdraw_escrowed_fees(env, direct_vm, direct_alice, direct_bob):
    request(env, direct_vm, direct_bob, CLEAN)  # pending: fee is escrow, not treasury
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("ERR_INVALID_STATE"):
        env.withdraw_treasury(hx(direct_alice), 1)


def test_payout_validator_pool_governor_only_and_bounded(env, direct_vm, direct_alice, direct_bob):
    screen(env, direct_vm, direct_bob, SANCTIONED)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("ERR_UNAUTHORIZED"):
        env.payout_validator_pool(hx(direct_bob), 1)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("ERR_INVALID_STATE"):
        env.payout_validator_pool(hx(direct_bob), FEE)


def test_withdraw_rejects_zero_destination(env, direct_vm, direct_alice, direct_bob):
    screen(env, direct_vm, direct_bob, SANCTIONED)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("ERR_INVALID_ADDRESS"):
        env.withdraw_treasury("0x" + "0" * 40, 1)


# --------------------------------------------------------- spam / duplicates
def test_duplicate_active_screening_rejected(env, direct_vm, direct_bob, direct_charlie):
    request(env, direct_vm, direct_bob, CLEAN)
    with direct_vm.expect_revert("ERR_DUPLICATE_ACTIVE_SCREENING"):
        request(env, direct_vm, direct_charlie, CLEAN.lower())


def test_duplicate_rejected_regardless_of_address_case(env, direct_vm, direct_bob):
    request(env, direct_vm, direct_bob, CLEAN)
    with direct_vm.expect_revert("ERR_DUPLICATE_ACTIVE_SCREENING"):
        request(env, direct_vm, direct_bob, "0x" + CLEAN[2:].upper())


def test_rejected_duplicate_does_not_take_a_second_fee(env, direct_vm, direct_bob):
    request(env, direct_vm, direct_bob, CLEAN)
    with direct_vm.expect_revert("ERR_DUPLICATE_ACTIVE_SCREENING"):
        request(env, direct_vm, direct_bob, CLEAN)
    assert tracked(env) == FEE


def test_recent_verdict_served_from_cache(env, direct_vm, direct_bob):
    screen(env, direct_vm, direct_bob, SANCTIONED)
    with direct_vm.expect_revert("ERR_RECENTLY_SCREENED"):
        request(env, direct_vm, direct_bob, SANCTIONED)


def test_rescreen_allowed_after_cooldown(env, direct_vm, direct_bob):
    screen(env, direct_vm, direct_bob, SANCTIONED)
    warp_later(direct_vm, 3700)
    assert request(env, direct_vm, direct_bob, SANCTIONED) == 2


def test_case_ids_are_sequential(env, direct_vm, direct_bob):
    ids = [request(env, direct_vm, direct_bob, a) for a in (CLEAN, VAULT, OTHER)]
    assert ids == [1, 2, 3]


def test_pending_slot_released_after_resolution(env, direct_vm, direct_bob):
    cid = request(env, direct_vm, direct_bob, SANCTIONED)
    assert env.check_compliance(SANCTIONED)["pending"] is True
    resolve(env, direct_vm, direct_bob, cid)
    assert env.check_compliance(SANCTIONED)["pending"] is False


# ----------------------------------------------------------- input validation
@pytest.mark.parametrize("bad", [
    "", "0x", "0x123", "0x" + "g" * 40, "0x" + "1" * 39, "0x" + "1" * 41,
    "1" * 42, "vitalik.eth", "0x" + "0" * 40, " 0x" + "1" * 40 + "\n0x" + "2" * 40,
])
def test_malformed_addresses_rejected(env, direct_vm, direct_bob, bad):
    with direct_vm.expect_revert("ERR_INVALID_ADDRESS"):
        request(env, direct_vm, direct_bob, bad)
    assert tracked(env) == 0


def test_address_whitespace_is_trimmed(env, direct_vm, direct_bob):
    cid = request(env, direct_vm, direct_bob, "  " + CLEAN + " ")
    assert env.get_case(cid)["target_address"] == CLEAN.lower()


def test_alias_too_long_rejected(env, direct_vm, direct_bob):
    with direct_vm.expect_revert("ERR_INVALID_ALIAS"):
        request(env, direct_vm, direct_bob, CLEAN, "A" * 97)


def test_alias_at_limit_accepted(env, direct_vm, direct_bob):
    assert request(env, direct_vm, direct_bob, CLEAN, "A" * 96) == 1


def test_alias_angle_brackets_stripped_in_storage(env, direct_vm, direct_bob):
    cid = request(env, direct_vm, direct_bob, CLEAN, "<b>Bad</b>\x00 Corp")
    alias = env.get_case(cid)["entity_alias"]
    assert "<" not in alias and ">" not in alias and "\x00" not in alias


# ---------------------------------------------------------- lifecycle guards
def test_resolve_twice_rejected(env, direct_vm, direct_bob):
    cid = request(env, direct_vm, direct_bob, SANCTIONED)
    resolve(env, direct_vm, direct_bob, cid)
    with direct_vm.expect_revert("ERR_INVALID_STATE"):
        resolve(env, direct_vm, direct_bob, cid)


def test_replay_cannot_double_pay_pools(env, direct_vm, direct_bob):
    cid = request(env, direct_vm, direct_bob, SANCTIONED)
    resolve(env, direct_vm, direct_bob, cid)
    with direct_vm.expect_revert("ERR_INVALID_STATE"):
        resolve(env, direct_vm, direct_bob, cid)
    assert tracked(env) == FEE


def test_resolve_unknown_case(env, direct_vm, direct_bob):
    with direct_vm.expect_revert("ERR_CASE_NOT_FOUND"):
        resolve(env, direct_vm, direct_bob, 99)


def test_get_unknown_case(env):
    with pytest.raises(Exception):
        env.get_case(99)


def test_anyone_may_resolve_and_becomes_resolver(env, direct_vm, direct_bob, direct_charlie):
    cid = request(env, direct_vm, direct_bob, SANCTIONED)
    resolve(env, direct_vm, direct_charlie, cid)
    c = env.get_case(cid)
    assert c["requestor"] == hx(direct_bob) and c["resolver"] == hx(direct_charlie)


def test_cancel_refunds_requestor(env, direct_vm, direct_bob):
    cid = request(env, direct_vm, direct_bob, CLEAN)
    direct_vm.sender = direct_bob
    env.cancel_screening(cid)
    assert env.get_case(cid)["status"] == "REJECTED"
    assert env.claimable_of(hx(direct_bob)) == str(FEE)
    assert env.get_oracle_metrics()["escrow"] == "0"


def test_cancel_frees_the_duplicate_guard(env, direct_vm, direct_bob):
    cid = request(env, direct_vm, direct_bob, CLEAN)
    direct_vm.sender = direct_bob
    env.cancel_screening(cid)
    assert request(env, direct_vm, direct_bob, CLEAN) == 2


def test_cancel_requestor_only(env, direct_vm, direct_bob, direct_charlie):
    cid = request(env, direct_vm, direct_bob, CLEAN)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("ERR_UNAUTHORIZED"):
        env.cancel_screening(cid)


def test_cancel_resolved_case_rejected(env, direct_vm, direct_bob):
    cid = request(env, direct_vm, direct_bob, SANCTIONED)
    resolve(env, direct_vm, direct_bob, cid)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("ERR_INVALID_STATE"):
        env.cancel_screening(cid)


def test_cancelled_case_cannot_be_resolved(env, direct_vm, direct_bob):
    cid = request(env, direct_vm, direct_bob, SANCTIONED)
    direct_vm.sender = direct_bob
    env.cancel_screening(cid)
    with direct_vm.expect_revert("ERR_INVALID_STATE"):
        resolve(env, direct_vm, direct_bob, cid)


# ----------------------------------------------------------------- governance
def test_governor_is_deployer(env, direct_alice):
    assert env.get_oracle_metrics()["governor"] == hx(direct_alice)


@pytest.mark.parametrize("call", [
    lambda c: c.add_registry("X", "Y", "https://a.example.org/x.json"),
    lambda c: c.set_registry_active(1, False),
    lambda c: c.set_telemetry_url("https://a.example.org/{address}"),
    lambda c: c.sync_registry(1),
    lambda c: c.transfer_governor("0x" + "1" * 40),
    lambda c: c.set_subscription_tier("0x" + "1" * 40, "INSTITUTIONAL"),
])
def test_governance_is_governor_only(env, direct_vm, direct_bob, call):
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("ERR_UNAUTHORIZED"):
        call(env)


def test_transfer_governor(env, direct_vm, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    env.transfer_governor(hx(direct_bob))
    assert env.get_oracle_metrics()["governor"] == hx(direct_bob)
    with direct_vm.expect_revert("ERR_UNAUTHORIZED"):
        env.set_registry_active(1, False)


def test_governor_cannot_be_burned(env, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("ERR_INVALID_ADDRESS"):
        env.transfer_governor("0x" + "0" * 40)


@pytest.mark.parametrize("url", [
    "http://feeds.example.org/a.json",            # not https
    "https://localhost/a.json",
    "https://127.0.0.1/a.json",
    "https://169.254.169.254/latest/meta-data",   # cloud metadata
    "https://10.0.0.5/a.json",
    "https://2130706433/a.json",                  # decimal-encoded loopback
    "https://0x7f000001/a.json",
    "https://[::1]/a.json",
    "https://intranet/a.json",                    # single label
    "https://service.internal/a.json",
    "https://user:pw@feeds.example.org/a.json",   # credentials
    "https://feeds.example.org:8443/a.json",      # odd port
    "https://127.0.0.1.nip.io/a.json",            # rebinding wildcard DNS
    "https://feeds.example.org\\@127.0.0.1/",
    "https://feeds.example.org/a b.json",
    "",
    "ftp://feeds.example.org/a.json",
])
def test_unsafe_registry_urls_rejected(env, direct_vm, direct_alice, url):
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("ERR_UNSAFE_URL"):
        env.add_registry("Bad", "Bad Authority", url)


def test_safe_url_accepted(env, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    assert env.add_registry("Extra", "Authority", "https://feeds.example.org/a.json") == 4


def test_telemetry_template_requires_placeholder(env, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("ERR_UNSAFE_URL"):
        env.set_telemetry_url("https://gateway.example.org/static")


def test_telemetry_template_must_be_safe(env, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("ERR_UNSAFE_URL"):
        env.set_telemetry_url("https://127.0.0.1/{address}")


def test_registry_requires_name(env, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("ERR_INVALID_REGISTRY"):
        env.add_registry("  ", "Authority", "https://feeds.example.org/a.json")


def test_set_unknown_registry_active(env, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("ERR_INVALID_REGISTRY"):
        env.set_registry_active(42, True)


def test_active_registry_cap(env, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    for i in range(5):  # 3 seeded + 5 = 8 active
        env.add_registry(f"Extra {i}", "Authority", f"https://feeds.example.org/{i}.json")
    assert env.get_oracle_metrics()["active_watchlists"] == 8
    with direct_vm.expect_revert("at most 8"):
        env.add_registry("Ninth", "Authority", "https://feeds.example.org/9.json")
    env.set_registry_active(8, False)  # free a slot
    assert env.add_registry("Ninth", "Authority", "https://feeds.example.org/9.json") == 9
    with direct_vm.expect_revert("at most 8"):
        env.set_registry_active(8, True)
