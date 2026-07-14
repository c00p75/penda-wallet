-- Profile Modes (roadmap bet 3): Individual / Family / Business as a context
-- layer over the same engine — it changes defaults, terminology, and how the
-- AI frames things, not the underlying data model.
alter table profiles
  add column if not exists mode text not null default 'individual'
  check (mode in ('individual', 'family', 'business'));
