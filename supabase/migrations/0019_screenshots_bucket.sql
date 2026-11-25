-- Public bucket for review screenshots and task banners uploaded by the app.
-- The server uploads with the service role key (bypasses RLS); these policies
-- only make the files publicly readable via getPublicUrl().
insert into storage.buckets (id, name, public, file_size_limit)
values ('screenshots', 'screenshots', true, 10485760)
on conflict (id) do update set public = true;

drop policy if exists "screenshots public read" on storage.objects;
create policy "screenshots public read"
  on storage.objects for select
  using (bucket_id = 'screenshots');
