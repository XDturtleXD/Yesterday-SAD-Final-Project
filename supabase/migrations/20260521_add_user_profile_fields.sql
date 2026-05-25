-- Add profile fields for avatar and self-introduction.
alter table public.users add column if not exists avatar_url text;
alter table public.users add column if not exists intro text;
