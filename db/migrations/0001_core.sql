-- 함께살이 핵심 스키마 + RLS (개정안 S-7, §3 권한표, §4 데이터 모델)
-- 원칙
--   * 권한 판단은 auth.uid()와 memberships 테이블로만 한다. user_metadata·JWT 커스텀 클레임은 쓰지 않는다.
--   * 파트너가 볼 열과 본인만 볼 열은 테이블을 나눈다(RLS는 행 단위라 열을 가리지 못함).
--   * 승인·제안·철회·연결 해제는 RPC로만 한다. 해당 테이블에 직접 INSERT/UPDATE 권한을 주지 않는다.
--   * 헬퍼 함수는 PostgREST에 노출하지 않는 app 스키마에 두고 search_path를 고정한다.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated;

-- ---------------------------------------------------------------------------
-- 테이블

create table public.profiles_shared (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 20),
  color text not null default 'teal' check (color in ('teal', 'amber', 'indigo', 'rose', 'olive', 'slate'))
);

create table public.profiles_private (
  user_id uuid primary key references auth.users (id) on delete cascade,
  invite_blocks uuid[] not null default '{}',
  notify_detail boolean not null default false -- 잠금 화면 알림에 세부 내용 표시(기본 끔)
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active' check (status in ('active', 'ended')),
  ended_on date,
  redact_text boolean not null default false,
  created_at timestamptz not null default now(),
  check ((status = 'ended') = (ended_on is not null))
);

create table public.memberships (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ended')),
  primary key (household_id, user_id)
);
-- 한 사람은 활성 공간 하나에만 속한다.
create unique index memberships_one_active_per_user on public.memberships (user_id) where status = 'active';

create table public.agreement_versions (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) < 8192),
  effective_from date not null,
  review_on date check (review_on is null or review_on >= effective_from),
  content_hash text not null,
  status text not null check (status in ('proposed', 'scheduled', 'active', 'superseded', 'withdrawn', 'cancelled')),
  created_by uuid not null references auth.users (id),
  previous_version_id uuid references public.agreement_versions (id),
  withdrawn_by uuid references auth.users (id),
  withdrawn_on date
);
create unique index agreement_one_pending on public.agreement_versions (agreement_id) where status = 'proposed';
create unique index agreement_one_active on public.agreement_versions (agreement_id) where status = 'active';

create table public.approvals (
  version_id uuid not null references public.agreement_versions (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  content_hash text not null,
  primary key (version_id, user_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  amount bigint not null check (amount > 0 and amount <= 100000000),
  currency text not null default 'KRW' check (currency = 'KRW'),
  description text not null check (char_length(description) between 1 and 80),
  paid_by uuid not null references auth.users (id),
  created_by uuid not null default auth.uid() references auth.users (id),
  spent_on date not null,
  shares jsonb not null,
  disputed_by uuid references auth.users (id),
  settlement_id uuid,
  version int not null default 1,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 80),
  unique (created_by, idempotency_key)
);

-- ---------------------------------------------------------------------------
-- 헬퍼 (security definer: RLS 정책 안에서 memberships를 재귀 없이 읽기 위함)

create function app.is_active_member(hid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.households h on h.id = m.household_id
    where m.household_id = hid
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and h.status = 'active'
  );
$$;

-- 활성 구성원이거나, 종료된 공간의 이전 구성원(30일 읽기 전용)
create function app.can_read_household(hid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_member(hid) or exists (
    select 1
    from public.memberships m
    join public.households h on h.id = m.household_id
    where m.household_id = hid
      and m.user_id = (select auth.uid())
      and h.status = 'ended'
      and h.ended_on + 30 > current_date
  );
$$;

create function app.shares_household(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships me
    join public.memberships them on them.household_id = me.household_id
    where me.user_id = (select auth.uid()) and them.user_id = other
      and app.can_read_household(me.household_id)
  );
$$;

create function app.active_household() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.household_id
  from public.memberships m
  join public.households h on h.id = m.household_id
  where m.user_id = (select auth.uid()) and m.status = 'active' and h.status = 'active';
$$;

revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

-- ---------------------------------------------------------------------------
-- 불변식 트리거

-- 정원 2명. 동시 수락에도 넘치지 않게 공간 행을 잠근다.
create function app.enforce_capacity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'active' then
    perform 1 from public.households where id = new.household_id for update;
    if (select count(*) from public.memberships
        where household_id = new.household_id and status = 'active' and user_id <> new.user_id) >= 2 then
      raise exception 'household_full' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger memberships_capacity before insert or update on public.memberships
  for each row execute function app.enforce_capacity();

-- 승인 이후 본문·소속 불변. 상태 전이는 RPC가 한다.
create function app.forbid_version_content_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.content is distinct from old.content
     or new.title is distinct from old.title
     or new.effective_from is distinct from old.effective_from
     or new.review_on is distinct from old.review_on
     or new.content_hash is distinct from old.content_hash
     or new.household_id is distinct from old.household_id
     or new.agreement_id is distinct from old.agreement_id
     or new.created_by is distinct from old.created_by then
    raise exception 'immutable_version' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger agreement_versions_immutable before update on public.agreement_versions
  for each row execute function app.forbid_version_content_change();

-- 지출: 결제자는 활성 구성원, 배분은 활성 구성원 전원이고 합계가 금액과 같아야 한다.
create function app.check_expense() returns trigger
language plpgsql set search_path = '' as $$
declare
  members uuid[];
  share_sum bigint;
begin
  -- 사용자 요청이면 소속부터 확인해, 공간 밖 요청에 배분 검증 결과 같은 정보를 돌려주지 않는다.
  if (select auth.uid()) is not null and not app.is_active_member(new.household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if new.household_id is distinct from old.household_id or new.created_by is distinct from old.created_by then
      raise exception 'immutable_owner' using errcode = '42501';
    end if;
    if old.settlement_id is not null then
      raise exception 'settled' using errcode = '42501';
    end if;
  end if;
  select array_agg(user_id order by user_id) into members
    from public.memberships where household_id = new.household_id and status = 'active';
  if not (new.paid_by = any (members)) then
    raise exception 'payer_not_member' using errcode = '23514';
  end if;
  if (select array_agg(k::uuid order by k::uuid) from jsonb_object_keys(new.shares) k) is distinct from members then
    raise exception 'shares_must_cover_members' using errcode = '23514';
  end if;
  select sum((v)::bigint) into share_sum from jsonb_each_text(new.shares) as s(k, v);
  if share_sum <> new.amount or exists (select 1 from jsonb_each_text(new.shares) s(k, v) where v::bigint < 0) then
    raise exception 'shares_must_sum_to_amount' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger expenses_check before insert or update on public.expenses
  for each row execute function app.check_expense();

-- 수정 시 버전 증가 강제, 확인 필요 표시 해제
create function app.bump_expense_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.version <> old.version + 1 then
    raise exception 'stale_version' using errcode = '40001';
  end if;
  if row(new.amount, new.description, new.paid_by, new.spent_on, new.shares)
     is distinct from row(old.amount, old.description, old.paid_by, old.spent_on, old.shares) then
    new.disputed_by := null;
  end if;
  return new;
end;
$$;
create trigger expenses_version before update on public.expenses
  for each row execute function app.bump_expense_version();

-- ---------------------------------------------------------------------------
-- RLS

alter table public.profiles_shared enable row level security;
alter table public.profiles_private enable row level security;
alter table public.households enable row level security;
alter table public.memberships enable row level security;
alter table public.agreement_versions enable row level security;
alter table public.approvals enable row level security;
alter table public.expenses enable row level security;

alter table public.profiles_shared force row level security;
alter table public.profiles_private force row level security;
alter table public.households force row level security;
alter table public.memberships force row level security;
alter table public.agreement_versions force row level security;
alter table public.approvals force row level security;
alter table public.expenses force row level security;

-- 비로그인 역할은 테이블에 아무 권한이 없다.
revoke all on all tables in schema public from anon;
-- 기본 권한을 걷어내고 필요한 것만 다시 준다.
revoke all on all tables in schema public from authenticated;

grant select on public.profiles_shared to authenticated;
grant update (display_name, color) on public.profiles_shared to authenticated;
create policy profiles_shared_select on public.profiles_shared for select to authenticated
  using (user_id = (select auth.uid()) or app.shares_household(user_id));
create policy profiles_shared_update on public.profiles_shared for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, update (invite_blocks, notify_detail) on public.profiles_private to authenticated;
create policy profiles_private_own on public.profiles_private for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select on public.households to authenticated;
create policy households_select on public.households for select to authenticated
  using (app.can_read_household(id));

grant select on public.memberships to authenticated;
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or app.can_read_household(household_id));

grant select on public.agreement_versions to authenticated;
create policy versions_select on public.agreement_versions for select to authenticated
  using (app.can_read_household(household_id));

grant select on public.approvals to authenticated;
create policy approvals_select on public.approvals for select to authenticated
  using (exists (select 1 from public.agreement_versions v
                 where v.id = version_id and app.can_read_household(v.household_id)));

grant select, insert, delete on public.expenses to authenticated;
grant update (amount, description, paid_by, spent_on, shares, version) on public.expenses to authenticated;
create policy expenses_select on public.expenses for select to authenticated
  using (app.can_read_household(household_id));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (app.is_active_member(household_id) and created_by = (select auth.uid())
              and settlement_id is null and disputed_by is null);
create policy expenses_update on public.expenses for update to authenticated
  using (created_by = (select auth.uid()) and settlement_id is null and app.is_active_member(household_id))
  with check (created_by = (select auth.uid()) and settlement_id is null and app.is_active_member(household_id));
create policy expenses_delete on public.expenses for delete to authenticated
  using (created_by = (select auth.uid()) and settlement_id is null and app.is_active_member(household_id));

-- 파트너 표시용 뷰. security_invoker라서 호출자의 RLS가 그대로 적용된다.
create view public.household_members with (security_invoker = true) as
  select m.household_id, m.user_id, m.status, p.display_name, p.color
  from public.memberships m
  join public.profiles_shared p on p.user_id = m.user_id;
revoke all on public.household_members from anon;
grant select on public.household_members to authenticated;

-- ---------------------------------------------------------------------------
-- RPC

create function app.version_hash(p_title text, p_content jsonb, p_from date, p_review date) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(convert_to(
    jsonb_build_object('title', p_title, 'content', p_content, 'effective_from', p_from, 'review_on', p_review)::text,
    'UTF8'), 'sha256'), 'hex');
$$;

create function public.propose_agreement_version(
  p_agreement_id uuid, p_title text, p_content jsonb, p_effective_from date, p_review_on date
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  hid uuid := app.active_household();
  prev uuid;
  vid uuid;
begin
  if hid is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_effective_from < current_date then raise exception 'invalid_date' using errcode = '22023'; end if;
  if p_agreement_id is null then
    p_agreement_id := gen_random_uuid();
  else
    if not exists (select 1 from public.agreement_versions where agreement_id = p_agreement_id and household_id = hid) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    select id into prev from public.agreement_versions
      where agreement_id = p_agreement_id and status in ('active', 'proposed') order by status = 'active' desc limit 1;
    update public.agreement_versions set status = 'superseded'
      where agreement_id = p_agreement_id and status = 'proposed';
  end if;

  insert into public.agreement_versions
    (agreement_id, household_id, title, content, effective_from, review_on, content_hash, status, created_by, previous_version_id)
  values
    (p_agreement_id, hid, p_title, p_content, p_effective_from, p_review_on,
     app.version_hash(p_title, p_content, p_effective_from, p_review_on), 'proposed', (select auth.uid()), prev)
  returning id into vid;

  -- 제안 보내기 = 제안자의 동의
  insert into public.approvals (version_id, user_id, content_hash)
    select vid, (select auth.uid()), content_hash from public.agreement_versions where id = vid;
  return vid;
end;
$$;

create function public.approve_agreement_version(p_version_id uuid, p_content_hash text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v public.agreement_versions;
  n int;
begin
  select * into v from public.agreement_versions where id = p_version_id for update;
  if not found or not app.is_active_member(v.household_id) then
    raise exception 'not_found' using errcode = 'P0002'; -- 다른 공간이면 존재 여부를 드러내지 않음
  end if;
  if v.status <> 'proposed' then raise exception 'invalid_state' using errcode = '55000'; end if;
  if v.content_hash <> p_content_hash then raise exception 'stale_content' using errcode = '40001'; end if;
  -- 금전 약속은 단계 인증(aal2)이 필요하다. Supabase는 MFA/패스키 검증 후 JWT의 aal을 aal2로 올린다.
  if v.content ->> 'type' = 'split' and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'step_up_required' using errcode = '42501';
  end if;

  insert into public.approvals (version_id, user_id, content_hash)
    values (v.id, (select auth.uid()), p_content_hash)
    on conflict do nothing;

  select count(*) into n from public.approvals a
    join public.memberships m on m.user_id = a.user_id and m.household_id = v.household_id and m.status = 'active'
    where a.version_id = v.id and a.content_hash = v.content_hash;

  if n = 2 then
    if v.effective_from <= current_date then
      update public.agreement_versions set status = 'superseded'
        where agreement_id = v.agreement_id and status = 'active';
      update public.agreement_versions set status = 'active' where id = v.id;
      return 'active';
    end if;
    update public.agreement_versions set status = 'scheduled' where id = v.id;
    return 'scheduled';
  end if;
  return 'proposed';
end;
$$;

-- 철회: 어느 구성원이든 혼자서 즉시(개정안 S-2)
create function public.withdraw_agreement_version(p_version_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.agreement_versions;
begin
  select * into v from public.agreement_versions where id = p_version_id for update;
  if not found or not app.is_active_member(v.household_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v.status not in ('active', 'scheduled') then raise exception 'invalid_state' using errcode = '55000'; end if;
  update public.agreement_versions
    set status = 'withdrawn', withdrawn_by = (select auth.uid()), withdrawn_on = current_date
    where id = v.id;
end;
$$;

-- 확인 필요 표시: 작성자가 아닌 구성원만
create function public.set_expense_dispute(p_expense_id uuid, p_disputed boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.expenses;
begin
  select * into e from public.expenses where id = p_expense_id for update;
  if not found or not app.is_active_member(e.household_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if e.settlement_id is not null then raise exception 'invalid_state' using errcode = '55000'; end if;
  if p_disputed and e.created_by = (select auth.uid()) then raise exception 'invalid_state' using errcode = '55000'; end if;
  if not p_disputed and e.disputed_by is distinct from (select auth.uid()) then raise exception 'invalid_state' using errcode = '55000'; end if;
  -- 트리거가 버전 증가를 요구하므로 함께 올린다. 내용은 바꾸지 않는다.
  update public.expenses
    set disputed_by = case when p_disputed then (select auth.uid()) else null end, version = version + 1
    where id = e.id;
end;
$$;

-- 연결 해제: 혼자서, 상대 동의 없이(개정안 S-10)
create function public.leave_household(p_redact_text boolean, p_block_partner boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  hid uuid := app.active_household();
  partner uuid;
begin
  if hid is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform 1 from public.households where id = hid for update;
  select user_id into partner from public.memberships
    where household_id = hid and status = 'active' and user_id <> (select auth.uid());
  update public.memberships set status = 'ended' where household_id = hid and status = 'active';
  update public.households set status = 'ended', ended_on = current_date, redact_text = p_redact_text where id = hid;
  update public.agreement_versions set status = 'cancelled' where household_id = hid and status = 'proposed';
  if p_block_partner and partner is not null then
    update public.profiles_private set invite_blocks = array_append(invite_blocks, partner)
      where user_id = (select auth.uid()) and not (partner = any (invite_blocks));
  end if;
end;
$$;

-- public 스키마 함수는 기본적으로 PUBLIC 실행 권한이 있다. 모두 걷어내고 로그인 사용자에게만 준다.
revoke all on function public.propose_agreement_version(uuid, text, jsonb, date, date) from public, anon;
revoke all on function public.approve_agreement_version(uuid, text) from public, anon;
revoke all on function public.withdraw_agreement_version(uuid) from public, anon;
revoke all on function public.set_expense_dispute(uuid, boolean) from public, anon;
revoke all on function public.leave_household(boolean, boolean) from public, anon;
grant execute on function public.propose_agreement_version(uuid, text, jsonb, date, date) to authenticated;
grant execute on function public.approve_agreement_version(uuid, text) to authenticated;
grant execute on function public.withdraw_agreement_version(uuid) to authenticated;
grant execute on function public.set_expense_dispute(uuid, boolean) to authenticated;
grant execute on function public.leave_household(boolean, boolean) to authenticated;

-- 위에서 나중에 만든 app 함수들에도 다시 적용
revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;
