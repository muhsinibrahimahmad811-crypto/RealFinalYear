alter table public.profiles add column email text;

update public.profiles p
set email = (select email from auth.users u where u.id = p.id)
where p.email is null;
