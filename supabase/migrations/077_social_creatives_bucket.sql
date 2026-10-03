-- Public delivery bucket for owner-approved social creatives.
-- Uploads remain server-side (service role); public access is read-only through Storage.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-creatives',
  'social-creatives',
  true,
  10485760,
  array['image/png','image/jpeg','image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
