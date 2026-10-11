-- =====================================================================
--  SPARKS Book Club — Member Portal schema (Phase 1 MVP)
--  Implements SPARKS_Portal_Requirements.docx v1.0 (Sept 8, 2026)
--
--  Roles (Section 2): parent, student, leader, director.
--  Safeguarding (3.2): NO adult<->child or child<->child messaging tables.
--  COPPA (3.1): students hold first_name + grade + club only; all PII on
--  the family (parent) record.  Addresses readable only by directors
--  and the owning parent (Section 8, least privilege).
-- =====================================================================

-- (no extensions required: gen_random_uuid() is core Postgres)

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.app_role as enum ('parent', 'leader', 'director');
create type public.session_status as enum
  ('draft', 'submitted', 'changes_requested', 'approved', 'ordered', 'shipped', 'delivered', 'cancelled');
create type public.item_kind as enum ('book', 'activity');
create type public.shipment_status as enum ('pending', 'shipped', 'delivered', 'could_not_ship');
create type public.consent_kind as enum ('terms', 'privacy', 'program');

-- ---------------------------------------------------------------------
-- Settings (single row; Section 4.2 / 6.2 configurable values)
-- ---------------------------------------------------------------------
create table public.settings (
  id                   int primary key default 1 check (id = 1),
  spare_count          int  not null default 1  check (spare_count >= 0),
  shipping_buffer_days int  not null default 10 check (shipping_buffer_days >= 0),
  budget_cap_cents     int  not null default 30000 check (budget_cap_cents >= 0),
  updated_at           timestamptz not null default now()
);
insert into public.settings (id) values (1);

-- ---------------------------------------------------------------------
-- Schools / clubs
-- ---------------------------------------------------------------------
create table public.schools (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  city       text,
  created_at timestamptz not null default now()
);

create table public.clubs (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid references public.schools(id) on delete set null,
  name        text not null,
  grade_range text default '3rd–5th',
  meeting_url text check (meeting_url is null or meeting_url ~* '^https?://'),  -- Zoom link (shown to families/students)
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Adults: profiles + roles + club leadership
-- ---------------------------------------------------------------------
create table public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  email      text not null,
  phone      text,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role    public.app_role not null,
  granted_by uuid references public.profiles(user_id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.club_leaders (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  primary key (club_id, user_id)
);

-- ---------------------------------------------------------------------
-- Families (parent-owned; ALL household PII lives here)
-- ---------------------------------------------------------------------
create table public.families (
  id                   uuid primary key default gen_random_uuid(),
  parent_user_id       uuid not null unique references public.profiles(user_id) on delete cascade,
  address_line1        text,
  address_line2        text,
  city                 text,
  state                text,
  zip                  text,
  has_address          boolean generated always as (nullif(btrim(address_line1), '') is not null) stored,
  address_validated    boolean not null default false,
  address_validated_at timestamptz,
  address_updated_at   timestamptz,
  emergency_name       text,
  emergency_phone      text,
  calendar_token       text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  deletion_requested_at timestamptz,
  created_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Students (minimum data: first name, grade, club)
-- ---------------------------------------------------------------------
create table public.students (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  first_name   text not null check (length(first_name) between 1 and 40),
  grade        smallint not null check (grade between 1 and 8),
  club_id      uuid references public.clubs(id) on delete set null,
  username     text unique check (username ~ '^[a-z0-9_]{3,20}$'),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  enrolled     boolean not null default true,
  withdrawn_at timestamptz,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Consents (Section 3.1: version + timestamp)
-- ---------------------------------------------------------------------
create table public.consent_docs (
  kind         public.consent_kind not null,
  version      text not null,
  title        text not null,
  url          text not null check (url ~* '^(/(?![/\\])|https?://)'),
  is_current   boolean not null default false,
  published_at timestamptz not null default now(),
  primary key (kind, version)
);

create table public.consents (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  kind        public.consent_kind not null,
  version     text not null,
  accepted_by uuid references public.profiles(user_id) on delete set null,  -- family_id identifies the family; row is cascaded with it
  accepted_at timestamptz not null default now(),
  foreign key (kind, version) references public.consent_docs(kind, version)
);
create index on public.consents (family_id);

-- ---------------------------------------------------------------------
-- Sessions = the monthly meeting + its materials request (Sections 4, 6)
-- ---------------------------------------------------------------------
create table public.sessions (
  id                   uuid primary key default gen_random_uuid(),
  club_id              uuid not null references public.clubs(id) on delete cascade,
  title                text not null,
  session_at           timestamptz not null,
  duration_min         int not null default 60,
  intro                text,                -- leader's short intro, shown to students
  book_pages           int check (book_pages is null or book_pages > 0),
  notes_for_director   text,
  status               public.session_status not null default 'draft',
  created_by           uuid references public.profiles(user_id) on delete set null,
  -- computed at submit (Section 4.2 / 6.2)
  required_qty         int,
  order_by_date        date,
  estimated_cost_cents int,
  submitted_at         timestamptz,
  decided_at           timestamptz,
  decided_by           uuid references public.profiles(user_id) on delete set null,
  decision_comment     text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index on public.sessions (club_id, session_at);
create index on public.sessions (status);

create table public.session_items (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.sessions(id) on delete cascade,
  kind             public.item_kind not null,
  product_url      text not null check (product_url ~* '^https?://'),
  title            text not null,
  author           text,
  image_url        text check (image_url is null or image_url ~* '^https?://'),
  unit_price_cents int check (unit_price_cents is null or unit_price_cents >= 0),
  created_at       timestamptz not null default now()
);
create index on public.session_items (session_id);

-- ---------------------------------------------------------------------
-- Orders (v1: manual purchase; "vendor" is pluggable — Section 3.3)
-- ---------------------------------------------------------------------
create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.sessions(id) on delete cascade,
  vendor            text not null default 'amazon_business',
  order_ref         text not null,
  placed_by         uuid references public.profiles(user_id) on delete set null,
  placed_at         timestamptz not null default now(),
  actual_cost_cents int check (actual_cost_cents is null or actual_cost_cents >= 0),
  notes             text
);
create index on public.orders (session_id);

create table public.shipments (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status     public.shipment_status not null default 'pending',
  tracking   text,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, student_id)
);

-- ---------------------------------------------------------------------
-- Student -> Leader structured feedback (ONE-WAY; Section 5.1.4 / 7)
-- ---------------------------------------------------------------------
create table public.feedback (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions(id) on delete cascade,
  student_id     uuid not null references public.students(id) on delete cascade,
  rating         smallint not null check (rating between 1 and 5),
  book_thoughts  text check (book_thoughts is null or length(book_thoughts) <= 2000),
  note_to_leader text check (note_to_leader is null or length(note_to_leader) <= 2000),
  created_at     timestamptz not null default now()
);
create index on public.feedback (session_id);
create index on public.feedback (student_id);

-- ---------------------------------------------------------------------
-- Audit trail (Section 2 Director / 6 "every state change is timestamped")
-- NOTE: never write addresses or contact details into `details`.
-- ---------------------------------------------------------------------
create table public.audit_log (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  actor_id  uuid,
  action    text not null,
  entity    text not null,
  entity_id uuid,
  details   jsonb
);
create index on public.audit_log (entity, entity_id);
create index on public.audit_log (at desc);

-- =====================================================================
--  Helper functions (security definer so policies can consult tables
--  without recursive RLS evaluation)
-- =====================================================================
create or replace function public.has_role(r public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and role = r);
$$;

create or replace function public.is_director()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('director');
$$;

create or replace function public.my_family_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from families where parent_user_id = auth.uid();
$$;

create or replace function public.my_student_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from students where auth_user_id = auth.uid();
$$;

create or replace function public.leads_club(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from club_leaders cl join user_roles r on r.user_id = cl.user_id and r.role = 'leader'
                 where cl.club_id = cid and cl.user_id = auth.uid());
$$;

-- Clubs the caller belongs to as a family member (parent of a child, or the child)
create or replace function public.family_club_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct s.club_id from students s
  where s.club_id is not null and s.enrolled
    and (s.family_id = public.my_family_id() or s.id = public.my_student_id());
$$;

-- Sessions that families/students may see (never drafts or pending requests)
create or replace function public.family_visible_status(st public.session_status)
returns boolean language sql immutable as $$
  select st in ('approved', 'ordered', 'shipped', 'delivered');
$$;

create or replace function public.can_view_session(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sessions s
    where s.id = sid and ( public.is_director() or public.leads_club(s.club_id) )
  );
$$;

-- A student may give feedback on a family-visible session of their own club
create or replace function public.student_can_feedback(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sessions s join students st on st.club_id = s.club_id
    where s.id = sid and st.id = public.my_student_id() and st.enrolled and public.family_visible_status(s.status));
$$;

create or replace function public.log_audit(p_action text, p_entity text, p_entity_id uuid, p_details jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_details);
$$;

-- updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger sessions_touch before update on public.sessions
  for each row execute function public.touch_updated_at();
create trigger shipments_touch before update on public.shipments
  for each row execute function public.touch_updated_at();

-- =====================================================================
--  Signup hook: parent accounts are created by the parent (COPPA 3.1).
--  Leader/director roles are NEVER self-assigned — a director grants them.
--  Student auth users are created by the `student-login` edge function.
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  kind text := coalesce(new.raw_user_meta_data ->> 'kind', 'parent');
begin
  if kind = 'student' then
    return new;  -- the edge function links the auth user to a students row
  end if;
  insert into profiles (user_id, full_name, email, phone)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
          new.email,
          nullif(new.raw_user_meta_data ->> 'phone', ''));
  insert into user_roles (user_id, role) values (new.id, 'parent');
  insert into families (parent_user_id) values (new.id);
  -- Consent recorded at signup (version + timestamp), even before email confirmation.
  insert into consents (family_id, kind, version, accepted_by)
    select f.id, (c.key)::public.consent_kind, c.value, new.id
      from families f, jsonb_each_text(coalesce(new.raw_user_meta_data -> 'consents', '{}'::jsonb)) c
      join consent_docs d on d.kind::text = c.key and d.version = c.value
     where f.parent_user_id = new.id and c.key in ('terms', 'privacy', 'program');
  insert into audit_log (actor_id, action, entity, entity_id)
  values (new.id, 'parent_signup', 'profile', new.id);
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Losing the leader role (however it happens) also removes club assignments.
create or replace function public.on_role_removed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'leader' then delete from club_leaders where user_id = old.user_id; end if;
  return old;
end; $$;
create trigger user_roles_removed after delete on public.user_roles
  for each row execute function public.on_role_removed();

-- Address changes are audited WITHOUT recording the address itself.
create or replace function public.audit_family_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (old.address_line1, old.address_line2, old.city, old.state, old.zip)
     is distinct from (new.address_line1, new.address_line2, new.city, new.state, new.zip) then
    new.address_updated_at := now();
    if new.address_validated_at is not distinct from old.address_validated_at then
      new.address_validated := false;   -- a changed address must be re-validated
    end if;
    insert into audit_log (actor_id, action, entity, entity_id)
    values (auth.uid(), 'address_changed', 'family', new.id);
  end if;
  return new;
end; $$;
create trigger families_audit before update on public.families
  for each row execute function public.audit_family_update();

-- =====================================================================
--  Leader roster view: first name + grade only (Section 4.4)
--  Runs with owner privileges (bypasses RLS) but filters to clubs the
--  caller leads, so leaders never touch the families table.
-- =====================================================================
create view public.club_roster with (security_invoker = false) as
  select s.id as student_id, s.first_name, s.grade, s.club_id, s.enrolled
  from public.students s
  where s.club_id is not null
    and (public.leads_club(s.club_id) or public.is_director());

-- =====================================================================
--  Row-level security
-- =====================================================================
alter table public.settings      enable row level security;
alter table public.schools       enable row level security;
alter table public.clubs         enable row level security;
alter table public.profiles      enable row level security;
alter table public.user_roles    enable row level security;
alter table public.club_leaders  enable row level security;
alter table public.families      enable row level security;
alter table public.students      enable row level security;
alter table public.consent_docs  enable row level security;
alter table public.consents      enable row level security;
alter table public.sessions      enable row level security;
alter table public.session_items enable row level security;
alter table public.orders        enable row level security;
alter table public.shipments     enable row level security;
alter table public.feedback      enable row level security;
alter table public.audit_log     enable row level security;

-- settings: everyone signed in may read; directors edit
create policy settings_read  on public.settings for select to authenticated using (true);
create policy settings_write on public.settings for update to authenticated using (public.is_director()) with check (public.is_director());

-- schools / clubs: readable by anyone signed in (names only); directors manage
create policy schools_read   on public.schools for select to authenticated using (true);
create policy schools_write  on public.schools for all to authenticated using (public.is_director()) with check (public.is_director());
create policy clubs_read     on public.clubs   for select to authenticated
  using (public.is_director() or public.leads_club(id) or id in (select public.family_club_ids()));
create policy clubs_write    on public.clubs   for all to authenticated using (public.is_director()) with check (public.is_director());

-- profiles: own row, or director. (Leaders never see parent contact details.)
create policy profiles_read   on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_director());
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = auth.uid() or public.is_director()) with check (user_id = auth.uid() or public.is_director());

-- roles: see own; directors manage
create policy roles_read  on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_director());
create policy roles_write on public.user_roles for all to authenticated using (public.is_director()) with check (public.is_director());

-- club_leaders: own rows, directors, and families of that club (so a parent can see their leader's club assignment)
create policy club_leaders_read  on public.club_leaders for select to authenticated
  using (user_id = auth.uid() or public.is_director() or club_id in (select public.family_club_ids()));
create policy club_leaders_write on public.club_leaders for all to authenticated using (public.is_director()) with check (public.is_director());

-- families: ONLY the owning parent and directors. Never leaders.
create policy families_read   on public.families for select to authenticated
  using (parent_user_id = auth.uid() or public.is_director());
create policy families_update on public.families for update to authenticated
  using (parent_user_id = auth.uid() or public.is_director()) with check (parent_user_id = auth.uid() or public.is_director());

-- students: own family, the student themself, directors. Leaders use club_roster view.
create policy students_read on public.students for select to authenticated
  using (family_id = public.my_family_id() or id = public.my_student_id() or public.is_director());
create policy students_insert on public.students for insert to authenticated
  with check (family_id = public.my_family_id() or public.is_director());
create policy students_update on public.students for update to authenticated
  using (family_id = public.my_family_id() or public.is_director())
  with check (family_id = public.my_family_id() or public.is_director());

-- consent docs: public to signed-in users; directors publish
create policy consent_docs_read  on public.consent_docs for select to authenticated using (true);
create policy consent_docs_anon  on public.consent_docs for select to anon using (is_current);
create policy consent_docs_write on public.consent_docs for all to authenticated using (public.is_director()) with check (public.is_director());

-- consents: own family may read + add; directors read
create policy consents_read   on public.consents for select to authenticated using (family_id = public.my_family_id() or public.is_director());
create policy consents_insert on public.consents for insert to authenticated with check (family_id = public.my_family_id() and accepted_by = auth.uid());

-- sessions
-- NB: evaluated on the row's own columns (not via a self-lookup) so INSERT ... RETURNING works.
-- Families and students never read session rows directly (notes_for_director, decision_comment,
-- costs live here); they get a safe projection from club_schedule().
create policy sessions_read on public.sessions for select to authenticated
  using ( public.is_director() or public.leads_club(club_id) );
create policy sessions_insert on public.sessions for insert to authenticated
  with check (status = 'draft' and created_by = auth.uid() and (public.leads_club(club_id) or public.is_director()));
create policy sessions_update on public.sessions for update to authenticated
  using ( public.is_director() or (public.leads_club(club_id) and status in ('draft', 'changes_requested')) )
  with check ( public.is_director() or (public.leads_club(club_id) and status in ('draft', 'changes_requested')) );
create policy sessions_delete on public.sessions for delete to authenticated
  using ( public.is_director() or (public.leads_club(club_id) and status = 'draft') );

-- session_items follow their session
create policy items_read on public.session_items for select to authenticated using (public.can_view_session(session_id));
create policy items_write on public.session_items for all to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id
                 and (public.is_director() or (public.leads_club(s.club_id) and s.status in ('draft', 'changes_requested')))))
  with check (exists (select 1 from public.sessions s where s.id = session_id
                 and (public.is_director() or (public.leads_club(s.club_id) and s.status in ('draft', 'changes_requested')))));

-- orders: directors only (everyone else sees status via the session row)
create policy orders_all on public.orders for all to authenticated using (public.is_director()) with check (public.is_director());

-- shipments: directors manage; a parent may see their own children's
create policy shipments_read on public.shipments for select to authenticated
  using (public.is_director() or exists (select 1 from public.students st where st.id = student_id and st.family_id = public.my_family_id()));
create policy shipments_write on public.shipments for all to authenticated using (public.is_director()) with check (public.is_director());

-- feedback: student writes about a session in their club; student/parent/leader/director read; nobody edits
create policy feedback_insert on public.feedback for insert to authenticated
  with check (student_id = public.my_student_id() and public.student_can_feedback(session_id));
create policy feedback_read on public.feedback for select to authenticated
  using ( student_id = public.my_student_id()
       or public.is_director()
       or exists (select 1 from public.students st where st.id = student_id and st.family_id = public.my_family_id())
       or exists (select 1 from public.sessions s where s.id = session_id and public.leads_club(s.club_id)) );
create policy feedback_delete on public.feedback for delete to authenticated using (public.is_director());

-- audit log: directors read; written only through security-definer functions
create policy audit_read on public.audit_log for select to authenticated using (public.is_director());

create policy students_delete on public.students for delete to authenticated using (public.is_director());
create policy families_delete on public.families for delete to authenticated using (public.is_director());

-- Column privileges: the status machine, computed columns, validation flags,
-- club assignment and login fields are only changed through the RPCs / edge
-- functions below (which run as the table owner or service role).
revoke all on public.families from authenticated;
grant select, delete on public.families to authenticated;
grant update (address_line1, address_line2, city, state, zip, emergency_name, emergency_phone)
  on public.families to authenticated;
revoke all on public.students from authenticated;
grant select, delete on public.students to authenticated;
grant insert (family_id, first_name, grade) on public.students to authenticated;
grant update (first_name, grade) on public.students to authenticated;
revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
revoke all on public.sessions from authenticated;
grant select, delete on public.sessions to authenticated;
grant insert (club_id, title, session_at, duration_min, intro, book_pages, notes_for_director, status, created_by) on public.sessions to authenticated;
grant update (title, session_at, duration_min, intro, book_pages, notes_for_director, club_id)
  on public.sessions to authenticated;
grant select on public.club_roster to authenticated;
revoke insert, update, delete on public.audit_log from authenticated;

-- =====================================================================
--  Ordering pipeline RPCs (Section 6). All security definer; each checks
--  the caller's role explicitly.
-- =====================================================================

-- 6.2 Validate + submit. Returns {ok, errors[], warnings[], required_qty, order_by_date, estimated_cost_cents}
create or replace function public.submit_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s        sessions%rowtype;
  cfg      settings%rowtype;
  errors   text[] := '{}';
  warnings text[] := '{}';
  n_enrolled int;
  qty      int;
  order_by date;
  cost     bigint := 0;
  n_books  int;
  missing_price int;
  dup      text;
begin
  select * into s from sessions where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;
  if not (leads_club(s.club_id) or is_director()) then raise exception 'Not allowed'; end if;
  if s.status not in ('draft', 'changes_requested') then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('This request is already ' || s.status || '.'));
  end if;
  select * into cfg from settings where id = 1;

  select count(*) into n_enrolled from students where club_id = s.club_id and students.enrolled;
  qty := n_enrolled + 1 + cfg.spare_count;          -- students + leader copy + spares
  order_by := (s.session_at at time zone 'America/New_York')::date - cfg.shipping_buffer_days;

  select count(*) filter (where kind = 'book'),
         count(*) filter (where unit_price_cents is null),
         coalesce(sum(coalesce(unit_price_cents, 0)), 0) * qty
    into n_books, missing_price, cost
    from session_items where session_id = p_session_id;

  if n_books = 0 then errors := array_append(errors, 'Add the book (an Amazon or bookshop link) before submitting.'); end if;
  if n_enrolled = 0 then errors := array_append(errors, 'No students are enrolled in this club yet, so there is nothing to order.'); end if;
  if order_by < (now() at time zone 'America/New_York')::date then
    errors := array_append(errors, format('Too late to ship in time: the order would need to be placed by %s (session date minus %s-day shipping buffer). Pick a later session date.',
                               to_char(order_by, 'Mon DD, YYYY'), cfg.shipping_buffer_days));
  end if;
  if cost > cfg.budget_cap_cents then
    errors := array_append(errors, format('Estimated cost $%s is over the per-session budget cap of $%s (%s copies of each item).',
                               to_char(cost / 100.0, 'FM999990.00'), to_char(cfg.budget_cap_cents / 100.0, 'FM999990.00'), qty));
  end if;
  if missing_price > 0 then
    warnings := array_append(warnings, format('%s item(s) have no price yet, so the budget check may be incomplete.', missing_price));
  end if;

  -- Duplicate-book check against this club's past sessions (same product link or same title)
  select si.title into dup
    from session_items si join sessions ps on ps.id = si.session_id
   where ps.club_id = s.club_id and ps.id <> p_session_id and si.kind = 'book'
     and ps.status in ('submitted', 'approved', 'ordered', 'shipped', 'delivered')
     and exists (select 1 from session_items me where me.session_id = p_session_id and me.kind = 'book'
                 and (lower(me.product_url) = lower(si.product_url) or lower(me.title) = lower(si.title)))
   limit 1;
  if dup is not null then
    errors := array_append(errors, format('"%s" was already used by this club in an earlier session.', dup));
  end if;

  if array_length(errors, 1) > 0 then
    return jsonb_build_object('ok', false, 'errors', to_jsonb(errors), 'warnings', to_jsonb(warnings),
                              'required_qty', qty, 'order_by_date', order_by, 'estimated_cost_cents', cost);
  end if;

  update sessions
     set status = 'submitted', submitted_at = now(), required_qty = qty, order_by_date = order_by,
         estimated_cost_cents = cost, decision_comment = null
   where id = p_session_id;
  perform log_audit('session_submitted', 'session', p_session_id,
                    jsonb_build_object('required_qty', qty, 'order_by_date', order_by, 'estimated_cost_cents', cost));
  return jsonb_build_object('ok', true, 'errors', '[]'::jsonb, 'warnings', to_jsonb(warnings),
                            'required_qty', qty, 'order_by_date', order_by, 'estimated_cost_cents', cost);
end; $$;

-- 6.3 Director decision
create or replace function public.decide_session(p_session_id uuid, p_approve boolean, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype;
begin
  if not is_director() then raise exception 'Directors only'; end if;
  select * into s from sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  if s.status <> 'submitted' then raise exception 'Only submitted requests can be decided (current: %)', s.status; end if;
  if p_approve then
    update sessions set status = 'approved', decided_at = now(), decided_by = auth.uid(), decision_comment = p_comment
     where id = p_session_id;
    -- one shipment row per enrolled student, so nothing gets lost later
    insert into shipments (session_id, student_id)
      select p_session_id, id from students where club_id = s.club_id and enrolled
      on conflict do nothing;
    perform log_audit('session_approved', 'session', p_session_id, jsonb_build_object('comment', p_comment));
  else
    if coalesce(trim(p_comment), '') = '' then raise exception 'Please tell the leader what to change.'; end if;
    update sessions set status = 'changes_requested', decided_at = now(), decided_by = auth.uid(), decision_comment = p_comment
     where id = p_session_id;
    perform log_audit('session_changes_requested', 'session', p_session_id, jsonb_build_object('comment', p_comment));
  end if;
end; $$;

-- 6.4 Order package: quantities, cost, and the shipping manifest.
-- Addresses appear ONLY here, ONLY for directors, and every call is audited.
create or replace function public.order_package(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype; items jsonb; manifest jsonb; leader jsonb; n_enrolled int; n_spare int;
begin
  if not is_director() then raise exception 'Directors only'; end if;
  select * into s from sessions where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;
  if s.status not in ('approved', 'ordered', 'shipped', 'delivered') then
    raise exception 'The order package is only available after approval.';
  end if;
  -- Students enrolled/assigned after approval but before the order is placed still get a shipment row
  if s.status in ('approved', 'ordered') then
    insert into shipments (session_id, student_id)
      select p_session_id, id from students where club_id = s.club_id and enrolled
      on conflict do nothing;
  end if;
  select count(*) into n_enrolled from students where club_id = s.club_id and students.enrolled;
  select spare_count into n_spare from settings where id = 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', si.id, 'kind', si.kind, 'title', si.title, 'author', si.author, 'product_url', si.product_url,
           'image_url', si.image_url, 'unit_price_cents', si.unit_price_cents, 'qty', s.required_qty,
           'line_total_cents', coalesce(si.unit_price_cents, 0) * s.required_qty) order by si.kind, si.title), '[]'::jsonb)
    into items from session_items si where si.session_id = p_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'shipment_id', sh.id, 'student_id', st.id, 'student_first_name', st.first_name, 'grade', st.grade,
           'enrolled', (st.enrolled and st.club_id = s.club_id),   -- false = withdrawn OR moved to another club: do not ship
           'in_club', st.club_id = s.club_id,
           'added_after_approval', (sh.created_at > coalesce(s.decided_at, sh.created_at) + interval '5 seconds'),
           'parent_name', p.full_name, 'parent_email', p.email, 'parent_phone', p.phone,
           'address_line1', f.address_line1, 'address_line2', f.address_line2, 'city', f.city, 'state', f.state, 'zip', f.zip,
           'address_validated', f.address_validated, 'address_updated_at', f.address_updated_at,
           'address_changed_after_order', (f.address_updated_at is not null and exists
               (select 1 from orders o where o.session_id = p_session_id and o.placed_at < f.address_updated_at)),
           'shipment_status', sh.status, 'tracking', sh.tracking, 'note', sh.note) order by st.first_name), '[]'::jsonb)
    into manifest
    from shipments sh
    join students st on st.id = sh.student_id
    join families f on f.id = st.family_id
    join profiles p on p.user_id = f.parent_user_id
   where sh.session_id = p_session_id;

  select jsonb_agg(jsonb_build_object('name', p.full_name, 'email', p.email)) into leader
    from club_leaders cl join profiles p on p.user_id = cl.user_id
    join user_roles r on r.user_id = cl.user_id and r.role = 'leader'
   where cl.club_id = s.club_id;

  perform log_audit('order_package_viewed', 'session', p_session_id, jsonb_build_object('manifest_rows', jsonb_array_length(manifest)));

  return jsonb_build_object(
    'session', jsonb_build_object('id', s.id, 'title', s.title, 'session_at', s.session_at, 'status', s.status,
                                  'required_qty', s.required_qty, 'order_by_date', s.order_by_date,
                                  'estimated_cost_cents', s.estimated_cost_cents, 'club_id', s.club_id,
                                  'enrolled_now', n_enrolled, 'required_qty_now', n_enrolled + 1 + n_spare),
    'leaders', coalesce(leader, '[]'::jsonb),
    'items', items,
    'manifest', manifest,
    'orders', (select coalesce(jsonb_agg(to_jsonb(o) order by o.placed_at), '[]'::jsonb) from orders o where o.session_id = p_session_id));
end; $$;

-- 6.5 Purchaser records the order ID(s)
create or replace function public.record_order(p_session_id uuid, p_order_ref text, p_vendor text default 'amazon_business', p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype; oid uuid;
begin
  if not is_director() then raise exception 'Directors only'; end if;
  select * into s from sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  if s.status not in ('approved', 'ordered') then raise exception 'Orders can only be recorded for approved requests (current: %)', s.status; end if;
  if coalesce(trim(p_order_ref), '') = '' then raise exception 'Order number is required'; end if;
  insert into orders (session_id, vendor, order_ref, placed_by, notes) values (p_session_id, p_vendor, p_order_ref, auth.uid(), p_notes)
    returning id into oid;
  update sessions set status = 'ordered' where id = p_session_id;
  perform log_audit('order_recorded', 'session', p_session_id, jsonb_build_object('order_id', oid, 'vendor', p_vendor, 'order_ref', p_order_ref));
  perform rollup_session_status(p_session_id);   -- shipments marked before the order was recorded
  return oid;
end; $$;

-- 6.6 Shipment tracking per student; session rolls forward automatically
-- Internal: derive the session status from its shipments (only while ordered/shipped/delivered)
create or replace function public.rollup_session_status(sid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare total int; n_pending int; n_delivered int; n_failed int; cur public.session_status;
begin
  select status into cur from sessions where id = sid;
  if cur not in ('ordered', 'shipped', 'delivered') then return; end if;
  select count(*), count(*) filter (where status = 'pending'), count(*) filter (where status = 'delivered'),
         count(*) filter (where status = 'could_not_ship')
    into total, n_pending, n_delivered, n_failed from shipments where session_id = sid;
  if total = 0 then return; end if;
  update sessions set status = case
      when n_pending = 0 and n_delivered > 0 and n_delivered + n_failed = total then 'delivered'
      when n_pending = 0 and n_failed < total then 'shipped'
      else 'ordered' end::public.session_status
   where id = sid;
end; $$;

create or replace function public.set_shipment_status(p_shipment_id uuid, p_status public.shipment_status, p_tracking text default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare sh shipments%rowtype;
begin
  if not is_director() then raise exception 'Directors only'; end if;
  update shipments set status = p_status, tracking = coalesce(p_tracking, tracking), note = coalesce(p_note, note)
   where id = p_shipment_id returning * into sh;
  if not found then raise exception 'Shipment not found'; end if;
  perform log_audit('shipment_updated', 'shipment', p_shipment_id, jsonb_build_object('session_id', sh.session_id, 'status', p_status));
  perform rollup_session_status(sh.session_id);
end; $$;

-- Director: generic status override (cancel, or force shipped/delivered)
create or replace function public.set_session_status(p_session_id uuid, p_status public.session_status, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype;
begin
  if not is_director() then raise exception 'Directors only'; end if;
  select * into s from sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  if p_status not in ('shipped', 'delivered', 'cancelled') then
    raise exception 'Use submit/decide/record_order for that transition';
  end if;
  if p_status in ('shipped', 'delivered') and s.status not in ('ordered', 'shipped', 'delivered') then
    raise exception 'Cannot mark % before an order is recorded', p_status;
  end if;
  update sessions set status = p_status, decision_comment = coalesce(p_comment, decision_comment) where id = p_session_id;
  perform log_audit('session_status_set', 'session', p_session_id, jsonb_build_object('from', s.status, 'to', p_status, 'comment', p_comment));
end; $$;

-- 6.7 Close-out: record actual spend on an order
create or replace function public.set_actual_cost(p_order_id uuid, p_actual_cost_cents int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_director() then raise exception 'Directors only'; end if;
  update orders set actual_cost_cents = p_actual_cost_cents where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  perform log_audit('actual_cost_set', 'order', p_order_id, jsonb_build_object('actual_cost_cents', p_actual_cost_cents));
end; $$;

-- Spend report rows (CSV built client-side)
create or replace function public.spend_report()
returns table (session_id uuid, club text, title text, session_at timestamptz, status public.session_status,
               required_qty int, estimated_cost_cents int, actual_cost_cents bigint, order_refs text)
language sql stable security definer set search_path = public as $$
  select s.id, c.name, s.title, s.session_at, s.status, s.required_qty, s.estimated_cost_cents,
         sum(o.actual_cost_cents), string_agg(o.vendor || ':' || o.order_ref, '; ')
    from sessions s join clubs c on c.id = s.club_id
    left join orders o on o.session_id = s.id
   where is_director() and s.status <> 'draft'
   group by s.id, c.name order by s.session_at desc;
$$;

-- =====================================================================
--  Who am I? (used by the portal to route to the right view)
-- =====================================================================
create or replace function public.whoami()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'roles', coalesce((select jsonb_agg(role) from user_roles where user_id = auth.uid()), '[]'::jsonb),
    'family_id', my_family_id(),
    'student', (select jsonb_build_object('id', id, 'first_name', first_name, 'grade', grade, 'club_id', club_id)
                  from students where auth_user_id = auth.uid()),
    'profile', (select jsonb_build_object('full_name', full_name, 'email', email, 'phone', phone) from profiles where user_id = auth.uid()),
    'led_clubs', coalesce((select jsonb_agg(club_id) from club_leaders where user_id = auth.uid() and has_role('leader')), '[]'::jsonb));
$$;

-- =====================================================================
--  Director admin helpers
-- =====================================================================
create or replace function public.grant_role(p_email text, p_role public.app_role)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not is_director() then raise exception 'Directors only'; end if;
  select user_id into uid from profiles where lower(email) = lower(p_email);
  if uid is null then raise exception 'No account with that email yet. Ask them to create an account first.'; end if;
  insert into user_roles (user_id, role, granted_by) values (uid, p_role, auth.uid()) on conflict do nothing;
  perform log_audit('role_granted', 'profile', uid, jsonb_build_object('role', p_role));
end; $$;

create or replace function public.revoke_role(p_user_id uuid, p_role public.app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_director() then raise exception 'Directors only'; end if;
  if p_user_id = auth.uid() and p_role = 'director' then raise exception 'You cannot remove your own director role.'; end if;
  if p_role = 'parent' then raise exception 'The parent role cannot be removed; delete the account instead.'; end if;
  delete from user_roles where user_id = p_user_id and role = p_role;
  if p_role = 'leader' then delete from club_leaders where user_id = p_user_id; end if;
  perform log_audit('role_revoked', 'profile', p_user_id, jsonb_build_object('role', p_role));
end; $$;

-- Director: publish a new agreement version atomically (never leaves a kind with no current doc)
create or replace function public.publish_consent_doc(p_kind public.consent_kind, p_version text, p_title text, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_director() then raise exception 'Directors only'; end if;
  if coalesce(trim(p_version), '') = '' then raise exception 'Version label is required'; end if;
  insert into consent_docs (kind, version, title, url, is_current) values (p_kind, p_version, p_title, p_url, true);
  update consent_docs set is_current = false where kind = p_kind and version <> p_version;
  perform log_audit('consent_doc_published', 'consent_doc', null, jsonb_build_object('kind', p_kind, 'version', p_version));
end; $$;

-- Director: put a student in a club (parents cannot self-assign)
create or replace function public.assign_student_club(p_student_id uuid, p_club_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_director() then raise exception 'Directors only'; end if;
  update students set club_id = p_club_id where id = p_student_id;
  if not found then raise exception 'Student not found'; end if;
  perform log_audit('student_club_assigned', 'student', p_student_id, jsonb_build_object('club_id', p_club_id));
end; $$;

-- Director: assign / remove a leader for a club
create or replace function public.set_club_leader(p_club_id uuid, p_email text, p_add boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not is_director() then raise exception 'Directors only'; end if;
  select user_id into uid from profiles where lower(email) = lower(p_email);
  if uid is null then raise exception 'No account with that email yet.'; end if;
  if p_add then
    insert into user_roles (user_id, role, granted_by) values (uid, 'leader', auth.uid()) on conflict do nothing;
    insert into club_leaders (club_id, user_id) values (p_club_id, uid) on conflict do nothing;
  else
    delete from club_leaders where club_id = p_club_id and user_id = uid;
  end if;
  perform log_audit(case when p_add then 'leader_assigned' else 'leader_removed' end, 'club', p_club_id, jsonb_build_object('user_id', uid));
end; $$;

-- Parent: get a fresh calendar link (old link stops working)
create or replace function public.rotate_calendar_token()
returns text language plpgsql security definer set search_path = public as $$
declare t text;
begin
  update families set calendar_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') where id = my_family_id() returning calendar_token into t;
  if t is null then raise exception 'No family record'; end if;
  perform log_audit('calendar_token_rotated', 'family', my_family_id());
  return t;
end; $$;

-- Parent: withdraw / re-enroll a child
create or replace function public.set_enrollment(p_student_id uuid, p_enrolled boolean)
returns void language plpgsql security definer set search_path = public as $$
declare st students%rowtype;
begin
  select * into st from students where id = p_student_id;
  if not found then raise exception 'Student not found'; end if;
  if not coalesce(st.family_id = my_family_id() or is_director(), false) then raise exception 'Not allowed'; end if;
  update students set enrolled = p_enrolled, withdrawn_at = case when p_enrolled then null else now() end where id = p_student_id;
  perform log_audit(case when p_enrolled then 'student_enrolled' else 'student_withdrawn' end, 'student', p_student_id);
end; $$;

-- Parent: request export of everything we hold on the family (Section 8)
create or replace function public.export_my_family()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile',  (select to_jsonb(p) from profiles p where p.user_id = auth.uid()),
    'family',   (select to_jsonb(f) - 'calendar_token' from families f where f.id = my_family_id()),
    'students', (select coalesce(jsonb_agg(to_jsonb(s) - 'auth_user_id'), '[]'::jsonb) from students s where s.family_id = my_family_id()),
    'consents', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from consents c where c.family_id = my_family_id()),
    'feedback', (select coalesce(jsonb_agg(to_jsonb(fb)), '[]'::jsonb) from feedback fb join students s on s.id = fb.student_id where s.family_id = my_family_id()),
    'exported_at', now());
$$;

create or replace function public.request_deletion()
returns void language plpgsql security definer set search_path = public as $$
begin
  if my_family_id() is null then raise exception 'No family record for this account'; end if;
  update families set deletion_requested_at = now() where id = my_family_id();
  perform log_audit('deletion_requested', 'family', my_family_id());
end; $$;

-- Student + parent view: the club's upcoming/current session with its book
create or replace function public.club_schedule(p_club_id uuid)
returns table (id uuid, title text, session_at timestamptz, duration_min int, intro text, book_pages int,
               status public.session_status, book_title text, book_author text, book_image_url text, meeting_url text)
language sql stable security definer set search_path = public as $$
  select s.id, s.title, s.session_at, s.duration_min, s.intro, s.book_pages, s.status,
         b.title, b.author, b.image_url, c.meeting_url
    from sessions s
    join clubs c on c.id = s.club_id
    left join lateral (select title, author, image_url from session_items where session_id = s.id and kind = 'book' order by created_at limit 1) b on true
   where s.club_id = p_club_id
     and (is_director() or leads_club(p_club_id)
          or (family_visible_status(s.status) and p_club_id in (select family_club_ids())))
   order by s.session_at;
$$;

-- Leader: feedback digest for a session (per student + aggregate)
create or replace function public.feedback_digest(p_session_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from sessions s where s.id = p_session_id and (leads_club(s.club_id) or is_director()))
    then jsonb_build_object(
      'count', (select count(*) from feedback where session_id = p_session_id),
      'avg_rating', (select round(avg(rating)::numeric, 2) from feedback where session_id = p_session_id),
      'rows', (select coalesce(jsonb_agg(jsonb_build_object('first_name', st.first_name, 'grade', st.grade, 'rating', f.rating,
                     'book_thoughts', f.book_thoughts, 'note_to_leader', f.note_to_leader, 'created_at', f.created_at) order by f.created_at desc), '[]'::jsonb)
                 from feedback f join students st on st.id = f.student_id where f.session_id = p_session_id))
    else null end;
$$;

-- =====================================================================
--  Grants
-- =====================================================================
grant usage on schema public to anon, authenticated, service_role;
-- Postgres grants EXECUTE to PUBLIC by default, so revoke from PUBLIC too (not just anon).
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.log_audit(text, text, uuid, jsonb) from public, authenticated, anon;
revoke execute on function public.rollup_session_status(uuid) from public, authenticated, anon;

-- Seed: current consent documents (SPARKS supplies final text — Section 3.1)
insert into public.consent_docs (kind, version, title, url, is_current) values
  ('terms',   '2026-10', 'Terms of Service',  '/members/legal/terms.html',   true),
  ('privacy', '2026-10', 'Privacy Policy',    '/members/legal/privacy.html', true),
  ('program', '2026-10', 'Program Participation Consent', '/members/legal/program.html', true);
