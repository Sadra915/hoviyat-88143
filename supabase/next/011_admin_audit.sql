-- HOVIYAT NEXT 011: admin audit view. Read-only and least-privilege.
create or replace view public.admin_security_summary as
select date_trunc('hour',created_at) as hour, action, success, count(*) as events
from public.security_audit_log
group by 1,2,3;
revoke all on public.admin_security_summary from anon,authenticated;
-- Grant this view only through an explicit admin policy/function in the
-- project's existing admin layer. Do not expose it directly to normal users.
