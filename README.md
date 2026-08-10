# Nomad

A national veterinary ER wait-time map with a client-advocacy layer. Helps a pet owner
in an emergency find where their pet will be seen fastest — including driving further to
a faster ER — and arms them to advocate for themselves once they arrive.

**Read [`CLAUDE.md`](./CLAUDE.md) first.** It is the architecture document and the standing
instructions: product invariants, schema, the predictive wait model, seeding pipeline, and
the explicit do-not-build list.

## Status

**M0 — scaffold complete.** Next.js app, full database schema as migrations, empty map shell.
No facility data seeded. Next milestone is M1 (the honest-baseline gate).

## Setup

```bash
npm install
cp .env.example .env.local        # then fill it in
npm run dev
```

### Database

Migrations live in `supabase/migrations/` and are the source of truth for the schema.

```bash
npx supabase link --project-ref <ref>   # once
npm run db:push                          # apply migrations
```

Running the stack locally (`npx supabase start`) requires Docker Desktop, which is not
installed on the current dev machine — see CLAUDE.md §3.

## Checks

```bash
npm run typecheck    # must be clean before every push (CLAUDE.md §2)
npm run test
npm run lint
```
