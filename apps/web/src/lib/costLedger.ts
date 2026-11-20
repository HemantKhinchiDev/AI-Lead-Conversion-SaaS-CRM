export interface CostLedgerEntry {
  tenant_id: string;
  provider: string;
  mode: 'simulated' | 'live';
  attempt_count: number;
  estimated_cost_inr: number;
  approval_ref?: string;
}

export function recordZeroCostEntry(entry: CostLedgerEntry): CostLedgerEntry {
  if (!entry.tenant_id) throw new Error('tenant_id is required');
  const attempts = Math.max(1, Math.floor(entry.attempt_count || 0));
  const cost = Number(entry.estimated_cost_inr ?? 0);
  if (cost !== 0 && !entry.approval_ref) {
    throw new Error('T-COST-001 violation: non-zero cost requires approval_ref');
  }
  return {
    tenant_id: entry.tenant_id,
    provider: entry.provider || 'simulated',
    mode: entry.mode === 'live' ? 'live' : 'simulated',
    attempt_count: attempts,
    estimated_cost_inr: cost === 0 ? 0.0 : cost,
    ...(entry.approval_ref ? { approval_ref: entry.approval_ref } : {}),
  };
}

export function summarizeTenantCost(entries: CostLedgerEntry[] = [], tenantId?: string | null) {
  const scoped = tenantId ? entries.filter((e) => e && e.tenant_id === tenantId) : [];
  const totalAttempts = scoped.reduce((sum, e) => sum + Math.max(0, e.attempt_count || 0), 0);
  const totalCostInr = scoped.reduce((sum, e) => sum + Number(e.estimated_cost_inr || 0), 0);
  return { totalAttempts, totalCostInr: Number(totalCostInr.toFixed(2)), isZeroSpend: totalCostInr === 0 };
}
