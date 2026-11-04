create policy "Administrators can view all profiles"
  on public.profiles
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'administrator'));
