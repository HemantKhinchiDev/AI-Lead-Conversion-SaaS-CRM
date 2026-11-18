create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 80),
  email text not null check (char_length(email) between 3 and 320),
  role text not null check (role in ('platform_admin', 'business_owner', 'sales_manager', 'sales_rep')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_tenant_email_key unique (tenant_id, email)
);

create index users_tenant_id_idx on public.users (tenant_id);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select tenant_id from public.users where id = auth.uid();
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'platform_admin' and status = 'active'
  );
$$;

create or replace function public.is_business_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'business_owner' and status = 'active'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_name text := nullif(btrim(coalesce(new.raw_user_meta_data->>'business_name', '')), '');
  v_full_name text := nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');
  v_tenant_slug text;
  v_tenant_id uuid;
begin
  if v_business_name is null or char_length(v_business_name) not between 2 and 120 then
    raise exception 'business_name must be 2 to 120 characters';
  end if;
  if v_full_name is null or char_length(v_full_name) not between 2 and 80 then
    raise exception 'full_name must be 2 to 80 characters';
  end if;

  v_tenant_slug := regexp_replace(lower(v_business_name), '[^a-z0-9]+', '-', 'g');
  v_tenant_slug := trim(both '-' from v_tenant_slug);
  if v_tenant_slug = '' then
    v_tenant_slug := 'business';
  end if;
  v_tenant_slug := left(v_tenant_slug, 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.tenants (name, slug, email)
  values (v_business_name, v_tenant_slug, lower(coalesce(new.email, '')))
  returning id into v_tenant_id;

  insert into public.users (id, tenant_id, full_name, email, role)
  values (new.id, v_tenant_id, v_full_name, lower(coalesce(new.email, '')), 'business_owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create policy tenants_select_own on public.tenants
  for select to authenticated
  using (id = public.current_tenant_id() or public.is_platform_admin());

create policy tenants_update_owner on public.tenants
  for update to authenticated
  using (id = public.current_tenant_id() and public.is_business_owner())
  with check (id = public.current_tenant_id() and public.is_business_owner());

create policy users_select_own_tenant on public.users
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform_admin());

create policy users_update_owner on public.users
  for update to authenticated
  using (
    public.is_platform_admin()
    or (tenant_id = public.current_tenant_id() and public.is_business_owner())
  )
  with check (
    public.is_platform_admin()
    or (tenant_id = public.current_tenant_id() and public.is_business_owner())
  );

alter table public.users enable row level security;

revoke all on public.users from anon, authenticated;
grant select on public.users to authenticated;
grant update (full_name, status) on public.users to authenticated;

revoke all on function public.current_tenant_id() from public, anon;
revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.is_business_owner() from public, anon;
grant execute on function public.current_tenant_id() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_business_owner() to authenticated;
