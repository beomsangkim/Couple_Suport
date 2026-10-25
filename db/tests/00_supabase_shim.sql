-- 로컬 PostgreSQL에서 Supabase 환경을 흉내 내는 최소 shim. 테스트 전용이며 운영에 적용하지 않는다.
-- Supabase에는 아래 역할·스키마·함수가 이미 있다.

create role anon nologin;
create role authenticated nologin;

create schema auth;
create schema extensions; -- Supabase는 확장을 extensions 스키마에 둔다
grant usage on schema extensions to anon, authenticated;
create table auth.users (id uuid primary key, email text);

-- Supabase와 같은 방식: PostgREST가 요청마다 설정하는 request.jwt.claims에서 sub를 읽는다.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

grant usage on schema auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;

-- PostgREST가 노출하는 public 스키마의 기본 권한을 Supabase와 비슷하게 넓게 열어 둔다.
-- (마이그레이션이 이것을 좁히는지 테스트하기 위함)
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
