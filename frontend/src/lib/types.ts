export type Tier = "TIER_1_CLEAN" | "TIER_2_ELEVATED" | "TIER_3_SANCTIONED" | "TIER_UNKNOWN";
export type CaseStatus = "PENDING" | "RESOLVED" | "REJECTED";

export interface ScreeningCase {
  case_id: number;
  target_address: string;
  entity_alias: string;
  requestor: string;
  screening_fee: string;
  risk_tier: Tier;
  confidence_score: number;
  audit_rationale: string;
  status: CaseStatus;
  timestamp: number;
  resolved_at: number;
  outcome: string;
  matched_entity: string;
  registries_checked: number;
  resolver: string;
}

export interface Registry {
  registry_id: number;
  name: string;
  source_authority: string;
  feed_url: string;
  root_hash: string;
  last_synced_timestamp: number;
  is_active: boolean;
  entries_count: number;
}

export interface OracleMetrics {
  total_cases: number;
  total_screened: number;
  sanctioned_isolated: number;
  elevated: number;
  clean: number;
  inconclusive: number;
  active_watchlists: number;
  mean_latency_seconds: number;
  subscribers: number;
  screening_fee: string;
  treasury: string;
  validator_pool: string;
  escrow: string;
  refunds_owed: string;
  telemetry_url: string;
  governor: string;
  solvent: boolean;
}

export interface ComplianceLookup {
  address: string;
  screened: boolean;
  tier: Tier;
  confidence: number;
  timestamp: number;
  case_id: number;
  blocked: boolean;
  pending: boolean;
}

export interface ValidatorVote {
  validator: string;
  vote: string;
}

export interface ConsensusRecord {
  txHash: string;
  result: string; // e.g. MAJORITY_AGREE
  votes: ValidatorVote[];
  leader: string;
}
