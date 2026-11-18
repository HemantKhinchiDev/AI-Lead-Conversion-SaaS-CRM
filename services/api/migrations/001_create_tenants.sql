create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  industry text not null default 'real_estate',
  email text,
  phone text,
  website text,
  timezone text not null default 'Asia/Kolkata',
  default_language text not null default 'en' check (default_language in ('en', 'hi')),
  status text not null default 'trial' check (status in ('active', 'suspended', 'trial')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tenants_status_idx on public.tenants (status);

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

alter table public.tenants enable row level security;

revoke all on public.tenants from anon, authenticated;
grant select on public.tenants to authenticated;
grant update (name, email, phone, website, timezone, default_language) on public.tenants to authenticated;
