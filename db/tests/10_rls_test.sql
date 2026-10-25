-- RLS·RPC 보안 시나리오 테스트 (개정안 §7). 실패하면 예외로 중단된다.
\set ON_ERROR_STOP 1
\set QUIET 1

create schema test;
grant usage on schema test to anon, authenticated;

create function test.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end;
$$;

-- sql을 현재 역할로 실행해 지정한 SQLSTATE(또는 메시지)로 실패하는지 확인한다.
create function test.throws(sql text, expected text, label text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAIL (no error): %', label;
exception
  when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> expected and sqlerrm not like '%' || expected || '%' then
      raise exception 'FAIL (got % %): %', sqlstate, sqlerrm, label;
    end if;
    raise notice 'ok - %', label;
end;
$$;

-- 사용자로 전환. Supabase의 PostgREST처럼 request.jwt.claims를 설정한다.
create function test.claims(uid uuid, aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, false);
$$;

grant execute on all functions in schema test to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 가상 데이터 (superuser로 준비)
-- A1=민, A2=지우 (공간 A) / B1=서준, B2=윤 (공간 B) / C1=하늘 (공간 없음)

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'min@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'jiwoo@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'seojun@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'yoon@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'haneul@example.test');

insert into public.profiles_shared (user_id, display_name, color)
  select id, split_part(email, '@', 1), 'teal' from auth.users;
insert into public.profiles_private (user_id) select id from auth.users;

insert into public.households (id) values
  ('00000000-0000-0000-0000-00000000aaaa'), ('00000000-0000-0000-0000-00000000bbbb'), ('00000000-0000-0000-0000-00000000cccc');
insert into public.memberships (household_id, user_id) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-0000000000b2');

insert into public.expenses (id, household_id, amount, description, paid_by, created_by, spent_on, shares, idempotency_key) values
  ('00000000-0000-0000-0000-0000000e00a1', '00000000-0000-0000-0000-00000000aaaa', 10001, '장보기',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', current_date,
   '{"00000000-0000-0000-0000-0000000000a1": 5001, "00000000-0000-0000-0000-0000000000a2": 5000}', 'seed-a-0001'),
  ('00000000-0000-0000-0000-0000000e00b1', '00000000-0000-0000-0000-00000000bbbb', 120000, '공간 B 관리비',
   '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', current_date,
   '{"00000000-0000-0000-0000-0000000000b1": 60000, "00000000-0000-0000-0000-0000000000b2": 60000}', 'seed-b-0001');

-- ---------------------------------------------------------------------------
-- 비로그인

set role anon;
select test.claims(null);
select test.throws('select * from public.expenses', '42501', 'anon은 지출 테이블을 읽을 수 없다');
select test.throws('select * from public.profiles_shared', '42501', 'anon은 프로필을 읽을 수 없다');
select test.throws($$select public.withdraw_agreement_version(gen_random_uuid())$$, '42501', 'SEC-22 anon은 RPC를 실행할 수 없다');
select test.throws($$select public.leave_household(false, false)$$, '42501', 'SEC-22 anon은 연결 해제 RPC를 실행할 수 없다');
reset role;

-- ---------------------------------------------------------------------------
-- 공간 격리

set role authenticated;
select test.claims('00000000-0000-0000-0000-0000000000b1');
select test.ok((select count(*) from public.expenses) = 1, 'SEC-01 다른 공간 지출은 보이지 않는다');
select test.ok((select count(*) from public.expenses where id = '00000000-0000-0000-0000-0000000e00a1') = 0, 'SEC-01 ID로 직접 조회해도 0행');
update public.expenses set amount = 1, version = version + 1 where id = '00000000-0000-0000-0000-0000000e00a1';
delete from public.expenses where id = '00000000-0000-0000-0000-0000000e00a1';
select test.throws($$insert into public.expenses (household_id, amount, description, paid_by, spent_on, shares, idempotency_key)
  values ('00000000-0000-0000-0000-00000000aaaa', 1000, '끼워넣기', '00000000-0000-0000-0000-0000000000b1', current_date, '{}', 'forge-0001')$$,
  '42501', 'SEC-03 다른 공간에 지출을 넣을 수 없다');
select test.ok((select count(*) from public.household_members where household_id = '00000000-0000-0000-0000-00000000aaaa') = 0,
  'SEC-23 security_invoker 뷰로도 다른 공간 구성원이 보이지 않는다');
select test.ok((select count(*) from public.profiles_private) = 1, 'SEC-05 개인 설정은 본인 것만 보인다');
reset role;
select test.ok((select amount from public.expenses where id = '00000000-0000-0000-0000-0000000e00a1') = 10001, 'SEC-02 다른 공간 지출 수정·삭제가 DB에 반영되지 않았다');

-- ---------------------------------------------------------------------------
-- 같은 공간 안에서의 위조

set role authenticated;
select test.claims('00000000-0000-0000-0000-0000000000a2');
select test.ok((select count(*) from public.profiles_shared) = 2, '파트너의 공유 프로필(이름·색)은 보인다');
select test.ok((select count(*) from public.profiles_private) = 1, 'SEC-05 파트너의 개인 설정은 보이지 않는다');
select test.throws($$insert into public.expenses (household_id, amount, description, paid_by, created_by, spent_on, shares, idempotency_key)
  values ('00000000-0000-0000-0000-00000000aaaa', 1000, '위조', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', current_date,
  '{"00000000-0000-0000-0000-0000000000a1": 500, "00000000-0000-0000-0000-0000000000a2": 500}', 'forge-0002')$$,
  '42501', 'SEC-04 작성자를 상대로 위조할 수 없다');
select test.throws($$insert into public.expenses (household_id, amount, description, paid_by, spent_on, shares, idempotency_key)
  values ('00000000-0000-0000-0000-00000000aaaa', 1000, '합계 틀림', '00000000-0000-0000-0000-0000000000a2', current_date,
  '{"00000000-0000-0000-0000-0000000000a1": 500, "00000000-0000-0000-0000-0000000000a2": 400}', 'forge-0003')$$,
  'shares_must_sum_to_amount', '배분 합계는 금액과 같아야 한다');
select test.throws($$insert into public.expenses (household_id, amount, description, paid_by, spent_on, shares, idempotency_key)
  values ('00000000-0000-0000-0000-00000000aaaa', 1000, '외부 결제자', '00000000-0000-0000-0000-0000000000b1', current_date,
  '{"00000000-0000-0000-0000-0000000000a1": 500, "00000000-0000-0000-0000-0000000000a2": 500}', 'forge-0004')$$,
  'payer_not_member', 'SEC-04 결제자를 공간 밖 사용자로 위조할 수 없다');
-- 상대가 쓴 지출은 수정할 수 없다(0행)
update public.expenses set amount = 2, version = version + 1 where id = '00000000-0000-0000-0000-0000000e00a1';
select test.throws($$update public.expenses set household_id = '00000000-0000-0000-0000-00000000bbbb' where id = '00000000-0000-0000-0000-0000000e00a1'$$,
  '42501', 'SEC-24 소속 공간 열은 UPDATE 권한이 없다');
select test.throws($$update public.expenses set settlement_id = gen_random_uuid() where id = '00000000-0000-0000-0000-0000000e00a1'$$,
  '42501', 'SEC-24 정산 연결 열은 UPDATE 권한이 없다');
select test.throws($$update public.expenses set disputed_by = auth.uid() where id = '00000000-0000-0000-0000-0000000e00a1'$$,
  '42501', '확인 필요 표시는 RPC로만 바꾼다');
select public.set_expense_dispute('00000000-0000-0000-0000-0000000e00a1', true);
select test.throws($$insert into public.memberships (household_id, user_id) values ('00000000-0000-0000-0000-00000000bbbb', auth.uid())$$,
  '42501', 'SEC-04 멤버십을 직접 만들 수 없다');
select test.throws($$insert into public.approvals (version_id, user_id, content_hash) values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000a1', 'x')$$,
  '42501', 'SEC-04 동의를 직접 넣을 수 없다(상대 명의 위조 포함)');
reset role;
select test.ok((select amount from public.expenses where id = '00000000-0000-0000-0000-0000000e00a1') = 10001, '상대가 쓴 지출 수정은 반영되지 않았다');
select test.ok((select disputed_by from public.expenses where id = '00000000-0000-0000-0000-0000000e00a1') = '00000000-0000-0000-0000-0000000000a2', '상대 지출에 확인 필요 표시는 할 수 있다');

-- 작성자는 버전을 올려야만 수정할 수 있고, 수정하면 확인 필요 표시가 풀린다
set role authenticated;
select test.claims('00000000-0000-0000-0000-0000000000a1');
select test.throws($$update public.expenses set amount = 10002, shares = '{"00000000-0000-0000-0000-0000000000a1": 5002, "00000000-0000-0000-0000-0000000000a2": 5000}'
  where id = '00000000-0000-0000-0000-0000000e00a1'$$, 'stale_version', 'SEC-14 버전을 올리지 않은(오래된 화면) 수정은 거부된다');
update public.expenses set amount = 10002, version = version + 1,
  shares = '{"00000000-0000-0000-0000-0000000000a1": 5002, "00000000-0000-0000-0000-0000000000a2": 5000}'
  where id = '00000000-0000-0000-0000-0000000e00a1';
reset role;
select test.ok((select disputed_by is null and amount = 10002 from public.expenses where id = '00000000-0000-0000-0000-0000000e00a1'), '작성자 수정 후 확인 필요 표시가 풀린다');

-- ---------------------------------------------------------------------------
-- 합의

set role authenticated;
select test.claims('00000000-0000-0000-0000-0000000000a1');
select set_config('test.v1', public.propose_agreement_version(null, '생활비 나누기',
  '{"type":"split","rule":{"kind":"ratio","weights":{"a1":60,"a2":40}}}', current_date, null)::text, false);
select test.ok((select count(*) from public.approvals where version_id = current_setting('test.v1')::uuid) = 1, '제안자는 보내는 순간 동의한 것으로 기록된다');
select test.throws($$update public.agreement_versions set status = 'active' where id = current_setting('test.v1')::uuid$$, '42501', '버전 상태를 직접 바꿀 수 없다');

select test.claims('00000000-0000-0000-0000-0000000000b1', 'aal2');
select test.throws(format($$select public.approve_agreement_version(%L, (select 'x'))$$, current_setting('test.v1')), 'not_found', 'SEC-04 다른 공간의 약속에 동의할 수 없다');

select test.claims('00000000-0000-0000-0000-0000000000a2', 'aal1');
select test.throws(format($$select public.approve_agreement_version(%L, %L)$$, current_setting('test.v1'), 'deadbeef'), 'stale_content', 'SEC-16 내용 해시가 다르면 동의가 거부된다');
select set_config('test.h1', (select content_hash from public.agreement_versions where id = current_setting('test.v1')::uuid), false);
select test.throws(format($$select public.approve_agreement_version(%L, %L)$$, current_setting('test.v1'), current_setting('test.h1')), 'step_up_required', 'SEC-25 금전 약속 동의는 단계 인증(aal2)이 필요하다');
select test.claims('00000000-0000-0000-0000-0000000000a2', 'aal2');
select test.ok(public.approve_agreement_version(current_setting('test.v1')::uuid, current_setting('test.h1')) = 'active', '두 사람이 같은 버전에 동의하면 적용된다');
reset role;
select test.throws($$update public.agreement_versions set content = '{"type":"split","rule":{"kind":"equal"}}' where id = current_setting('test.v1')::uuid$$,
  'immutable_version', 'SEC-09 승인된 버전의 내용은 관리자 경로로도 바꿀 수 없다');

set role authenticated;
select test.claims('00000000-0000-0000-0000-0000000000a2');
select public.withdraw_agreement_version(current_setting('test.v1')::uuid);
reset role;
select test.ok((select status = 'withdrawn' and withdrawn_by = '00000000-0000-0000-0000-0000000000a2' from public.agreement_versions where id = current_setting('test.v1')::uuid),
  'SEC-15 한 사람이 혼자 즉시 철회할 수 있다');

-- ---------------------------------------------------------------------------
-- 정원·연결 해제

select test.throws($$insert into public.memberships (household_id, user_id) values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c1')$$,
  'household_full', 'SEC-07 정원 2명을 넘을 수 없다(DB 제약)');
select test.throws($$insert into public.memberships (household_id, user_id) values ('00000000-0000-0000-0000-00000000cccc', '00000000-0000-0000-0000-0000000000a1')$$,
  '23505', '한 사람은 활성 공간 하나에만 속한다');

set role authenticated;
select test.claims('00000000-0000-0000-0000-0000000000a1');
select public.leave_household(false, true);
select test.claims('00000000-0000-0000-0000-0000000000a2');
select test.throws($$insert into public.expenses (household_id, amount, description, paid_by, spent_on, shares, idempotency_key)
  values ('00000000-0000-0000-0000-00000000aaaa', 1000, '해제 후', auth.uid(), current_date,
  '{"00000000-0000-0000-0000-0000000000a1": 500, "00000000-0000-0000-0000-0000000000a2": 500}', 'after-leave-01')$$,
  '42501', 'SEC-19 연결 해제 후 상대는 같은 JWT로도 공동 데이터를 쓸 수 없다');
select test.ok((select count(*) from public.expenses) = 1, '해제 후 30일 동안은 종료 시점 기록을 읽을 수 있다');
select test.throws($$select public.withdraw_agreement_version(gen_random_uuid())$$, 'not_found', '해제 후에는 약속을 바꿀 수 없다');
select test.claims('00000000-0000-0000-0000-0000000000a1');
select test.ok((select '00000000-0000-0000-0000-0000000000a2'::uuid = any (invite_blocks) from public.profiles_private), 'SEC-28 해제하면서 상대의 초대를 차단할 수 있다');
reset role;

-- 31일이 지난 것처럼 만들면 읽을 수 없다
update public.households set ended_on = current_date - 31 where id = '00000000-0000-0000-0000-00000000aaaa';
set role authenticated;
select test.claims('00000000-0000-0000-0000-0000000000a2');
select test.ok((select count(*) from public.expenses) = 0, '30일이 지나면 종료된 공간 기록을 읽을 수 없다');
reset role;

-- ---------------------------------------------------------------------------
-- 정적 점검: 권한 우회 경로

select test.ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
), '모든 public 테이블에 RLS가 켜져 있다');

select test.ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and not coalesce((select bool_or(opt = 'security_invoker=true') from unnest(c.reloptions) opt), false)
), 'SEC-23 모든 public 뷰는 security_invoker다');

select test.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app') and p.prosecdef
    and not exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%')
), '모든 security definer 함수는 search_path가 고정돼 있다');

select test.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app') and has_function_privilege('anon', p.oid, 'execute')
    and p.prorettype <> 'trigger'::regtype
), 'SEC-22 anon이 실행할 수 있는 함수가 없다');

select test.ok(not exists (
  select 1 from pg_policies where schemaname = 'public'
    and (coalesce(qual, '') ~* 'user_metadata|raw_user_meta' or coalesce(with_check, '') ~* 'user_metadata|raw_user_meta')
), 'SEC-18 RLS 정책이 user_metadata를 쓰지 않는다');

\echo 'DB 보안 테스트 통과'
