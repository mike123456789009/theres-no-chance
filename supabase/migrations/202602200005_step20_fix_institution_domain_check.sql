-- Step 20 follow-up: fix institution email domain check for valid subdomain .edu addresses.

alter table public.user_institution_emails
  drop constraint if exists user_institution_emails_domain_edu;

alter table public.user_institution_emails
  add constraint user_institution_emails_domain_edu
  check (domain ~ '^[a-z0-9.-]+[.]edu$');
