# Hoviyat 360-user QA

This release includes `tests/load-test-360.mjs` for a safe API read-path load test.

Run it from a networked machine with a publishable Supabase key:

```bash
SUPABASE_URL=https://ejftgzrrjttntbsapjgz.supabase.co SUPABASE_PUBLISHABLE_KEY="<your-publishable-key>" node tests/load-test-360.mjs
```

It sends 360 concurrent authenticated-independent public API reads and reports success count, wall time, p50/p95/p99 and max latency. It does not create users, messages, stories, or other production data.

Note: a local execution environment without outbound DNS/network access cannot produce a valid external latency result. Use the command above from a real networked device/CI runner for the final benchmark.
