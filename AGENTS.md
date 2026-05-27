# Agent Notes

- Load the git guardrails before any git operation. Stage files explicitly; do not use `git add .` or `git add -A`.
- After finishing requested changes, commit and push them unless the user explicitly says not to.
- Next.js commands can rewrite `next-env.d.ts` between `.next/types/routes.d.ts` and `.next/dev/types/routes.d.ts`. Treat that file as generated and verify/revert unrelated churn before committing.
