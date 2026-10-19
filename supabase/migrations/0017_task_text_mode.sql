-- 0017: Text review mode - admin can paste a fixed numbered review list per
-- task instead of relying on the AI. Each list entry is handed out once; it
-- is marked used when the worker copies it (not on generate).

alter table public.tasks
  add column if not exists generation_mode text not null default 'prompt'
    check (generation_mode in ('prompt', 'text')),
  add column if not exists text_reviews text;

create table if not exists public.task_text_reviews (
  task_id  uuid not null references public.tasks (id) on delete cascade,
  review   text not null,
  used_at  timestamptz,
  primary key (task_id, review)
);

create index if not exists task_text_reviews_available_idx
  on public.task_text_reviews (task_id)
  where used_at is null;

alter table public.task_text_reviews enable row level security;
-- task_text_reviews has no policies: only service_role may access it
