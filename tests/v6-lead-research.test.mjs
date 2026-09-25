import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBusinessRecord,
  findDuplicateMatch,
  mergeCandidateData,
  createResearchJobSpec,
  runResearchJob,
  buildCrmLeadPayload,
  buildResearchOutreachDraft,
  analyzeResearchCandidate
} from '../lib/v6/lead-research.js';

describe('lead research engine', () => {
  it('creates research job spec', () => {
    const job = createResearchJobSpec({
      query: 'عيادات أسنان في المدينة المنورة',
      city: 'المدينة المنورة',
      industry: 'dental_clinic',
      target_count: 20,
      source: 'fixture'
    });
    assert.equal(job.city, 'المدينة المنورة');
    assert.equal(job.target_count, 20);
    assert.equal(job.auto_outreach, false);
    assert.equal(job.requires_approval, true);
  });

  it('normalizes business records', () => {
    const r = normalizeBusinessRecord({
      name: 'عيادة الاختبار',
      phone: '050-123-4567',
      website: 'https://www.Example-Clinic.sa/path',
      city: 'المدينة المنورة',
      industry: 'Dental Clinic'
    });
    assert.equal(r.business_name, 'عيادة الاختبار');
    assert.ok(r.phone.includes('050'));
    assert.equal(r.domain, 'example-clinic.sa');
    assert.equal(r.confidence.business_name, 'verified');
  });

  it('deduplicates by phone', () => {
    const record = normalizeBusinessRecord({ business_name: 'A', phone: '0501111111', city: 'X' });
    const dup = findDuplicateMatch(record, [{ phone: '0501111111', business_name: 'Old' }]);
    assert.equal(dup.matched, true);
    assert.equal(dup.match_on, 'phone');
  });

  it('deduplicates by domain', () => {
    const record = normalizeBusinessRecord({ business_name: 'A', website: 'https://foo.sa' });
    const dup = findDuplicateMatch(record, [{ website: 'https://www.foo.sa/x', business_name: 'B' }]);
    assert.equal(dup.matched, true);
    assert.equal(dup.match_on, 'domain');
  });

  it('deduplicates by name+city', () => {
    const record = normalizeBusinessRecord({ business_name: 'عيادة النور', city: 'المدينة' });
    const dup = findDuplicateMatch(record, [
      { business_name: 'عيادة النور', city: 'المدينة', phone: null }
    ]);
    assert.equal(dup.matched, true);
    assert.equal(dup.match_on, 'name_city');
  });

  it('merges missing fields only', () => {
    const merged = mergeCandidateData(
      { business_name: 'A', phone: '1', website: null },
      { business_name: 'B', phone: '2', website: 'https://x.sa' }
    );
    assert.equal(merged.business_name, 'A');
    assert.equal(merged.phone, '1');
    assert.equal(merged.website, 'https://x.sa');
  });

  it('runs fixture research job with enrichment and scoring', async () => {
    const result = await runResearchJob({
      query: 'عيادات أسنان',
      city: 'المدينة المنورة',
      industry: 'dental_clinic',
      target_count: 5,
      source: 'fixture'
    });
    assert.equal(result.job.status, 'completed');
    assert.ok(result.candidates.length >= 1);
    assert.ok(result.candidates.some((c) => c.opportunity_score != null || c.status === 'duplicate'));
    assert.equal(result.summary.auto_outreach, false);
  });

  it('updates duplicate instead of creating new identity', async () => {
    const existing = [
      normalizeBusinessRecord({
        business_name: 'عيادة النور للأسنان — المدينة المنورة',
        phone: '0148211001',
        city: 'المدينة المنورة',
        industry: 'dental_clinic'
      })
    ];
    const result = await runResearchJob(
      {
        query: 'عيادات',
        city: 'المدينة المنورة',
        industry: 'dental_clinic',
        target_count: 3,
        source: 'fixture'
      },
      { existingCandidates: existing }
    );
    assert.ok(result.summary.duplicates >= 1);
    assert.ok(result.candidates.some((c) => c.status === 'duplicate'));
  });

  it('builds CRM payload without sending', async () => {
    const record = normalizeBusinessRecord({
      business_name: 'مطعم الاختبار',
      phone: '0509999999',
      city: 'الرياض',
      industry: 'restaurants'
    });
    const analysis = await analyzeResearchCandidate(record);
    const payload = buildCrmLeadPayload(analysis, { query: 'مطاعم', source: 'fixture' });
    assert.equal(payload.company_name, 'مطعم الاختبار');
    assert.equal(payload.custom_fields.requires_approval, true);
    assert.ok(payload.opportunity_score != null);
  });

  it('outreach draft requires approval and never auto-sends', async () => {
    const record = normalizeBusinessRecord({
      business_name: 'شركة تجريبية',
      phone: '0508888888',
      city: 'جدة',
      industry: 'professional_services'
    });
    const analysis = await analyzeResearchCandidate(record);
    const draft = buildResearchOutreachDraft(analysis);
    assert.equal(draft.requires_approval, true);
    assert.equal(draft.auto_send, false);
    assert.equal(draft.status, 'pending_approval');
    assert.ok(draft.text.length > 10);
  });

  it('manual rows provider imports provided data only', async () => {
    const result = await runResearchJob(
      {
        query: 'import',
        city: 'الرياض',
        industry: 'retail',
        target_count: 10,
        source: 'manual'
      },
      {
        provider: 'manual',
        rows: [
          { business_name: 'متجر أ', phone: '0511111001', city: 'الرياض', industry: 'retail' },
          { business_name: 'متجر ب', phone: '0511111002', city: 'الرياض', industry: 'retail' }
        ]
      }
    );
    assert.equal(result.candidates.filter((c) => c.status !== 'duplicate').length, 2);
  });

  it('playbook vertical selected for dental research', async () => {
    const record = normalizeBusinessRecord({
      business_name: 'عيادة',
      phone: '0507777777',
      industry: 'dental_clinic',
      city: 'المدينة المنورة'
    });
    const analysis = await analyzeResearchCandidate(record);
    assert.ok(analysis.vertical);
    assert.ok(analysis.playbook);
  });
});
