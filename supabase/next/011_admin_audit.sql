-- HOVIYAT NEXT 011: admin audit view, not exposed to normal users.
create or replace view public.admin_security_summary with (security_invoker=true) as
select date_trunc('hour',created_at) as hour, action, success, count(*) as events
from public.security_audit_log
group by 1,2,3;
revoke all on public.admin_security_summary from anon,authenticated;
