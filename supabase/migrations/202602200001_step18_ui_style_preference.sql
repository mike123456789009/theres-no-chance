do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'ui_style'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.ui_style as enum ('retro', 'modern');
  end if;
end
$$;

alter table public.profiles
  add column if not exists ui_style public.ui_style;

update public.profiles
set ui_style = 'retro'
where ui_style is null;

alter table public.profiles
  alter column ui_style set default 'retro',
  alter column ui_style set not null;
