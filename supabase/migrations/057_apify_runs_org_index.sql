-- Tiqnora — Apify run lookup performance
create index if not exists idx_apify_runs_organization
  on public.apify_runs(organization_id);
