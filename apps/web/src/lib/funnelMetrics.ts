export interface FunnelRecord {
  tenant_id?: string | null;
  status?: string | null;
  consent_given?: boolean | null;
  eligible?: boolean | null;
  excluded?: boolean | null;
  needs_review?: boolean | null;
  call_count?: number | null;
  calls_logged?: number | null;
  qualified?: boolean | null;
  follow_up_required?: boolean | null;
  follow_up_at?: string | null;
}

export interface FunnelMetrics {
  totalLeads: number;
  eligibleLeads: number;
  reviewOrExcludedLeads: number;
  callsLogged: number;
  qualifiedLeads: number;
  followUps: number;
}

export function getFunnelMetrics(records: FunnelRecord[] = [], tenantId?: string | null): FunnelMetrics {
  if (!tenantId || !Array.isArray(records)) {
    return { totalLeads: 0, eligibleLeads: 0, reviewOrExcludedLeads: 0, callsLogged: 0, qualifiedLeads: 0, followUps: 0 };
  }
  const scoped = records.filter((r) => r && r.tenant_id === tenantId);
  let eligibleLeads = 0, reviewOrExcludedLeads = 0, callsLogged = 0, qualifiedLeads = 0, followUps = 0;
  for (const r of scoped) {
    const status = (r.status || '').toLowerCase();
    const isExcluded = Boolean(r.excluded) || ['excluded', 'do_not_call', 'do_not_contact', 'invalid', 'invalid_number'].includes(status);
    const isReview = Boolean(r.needs_review) || ['review', 'needs_review', 'review_required', 'pending_review'].includes(status);
    const isEligible = !isExcluded && !isReview && (r.eligible === true || r.consent_given === true || ['eligible', 'new', 'qualified', 'hot_lead', 'warm_lead', 'interested', 'follow_up', 'follow_up_required'].includes(status));
    if (isEligible) eligibleLeads += 1;
    if (isReview || isExcluded) reviewOrExcludedLeads += 1;
    callsLogged += typeof r.calls_logged === 'number' ? Math.max(0, r.calls_logged) : typeof r.call_count === 'number' ? Math.max(0, r.call_count) : (['called', 'contacted', 'qualified', 'hot_lead', 'warm_lead', 'interested'].includes(status) ? 1 : 0);
    if (r.qualified === true || ['qualified', 'hot_lead', 'warm_lead', 'interested', 'converted'].includes(status)) qualifiedLeads += 1;
    if (r.follow_up_required === true || Boolean(r.follow_up_at) || ['follow_up', 'followup', 'follow_up_required'].includes(status)) followUps += 1;
  }
  return { totalLeads: scoped.length, eligibleLeads, reviewOrExcludedLeads, callsLogged, qualifiedLeads, followUps };
}
