# Medbot — Progress Log

**Last updated:** 21 September 2026 (appointments agent reported; caveat resolved)
**Status:** Phase 1 (domain core) built but **not yet through its exit gate**.

This is the living status document: what is actually built, what is not, and what is
blocked. Everything below was verified by running it, not assumed — where something is
unverified, it says so explicitly.

- Product spec: `agentic_healthcare_front_desk_poc_plan.md`
- Conventions for AI tools: `CLAUDE.md`
- Phase plan: `~/.claude/plans/look-i-want-you-groovy-sky.md`

---

## Verified state (run on 21 Sep 2026)

| Check | Result |
|---|---|
| Backend unit tests | **155 passing** (15 files) |
| Backend e2e tests | **90 passing** (8 files) |
| Frontend tests | **21 passing** (3 files) |
| **Total** | **266 passing** |
| Backend typecheck | clean |
| Backend lint | 1 warning (`no-base-to-string` in `appointments.service.spec.ts`) |
| Frontend build | passing |

---

## Done

### Phase 0 — Foundation (complete, one gate item open)

**Backend** (`backend/`) — NestJS 12, ESM, Vitest, oxlint, TypeScript 6
- `infra/database/` — global Mongoose module, fail-fast connection (5s server selection).
- `infra/audit/` — audit trail schema + service shaped to plan §41. Deliberately never
  throws: a failed audit write must not cost a patient their booking.
- `common/filters/` — global exception filter, single error shape, `headersSent` guard,
  never leaks internal error details to the client.
- `common/middleware/` — request-id correlation. **Middleware, not an interceptor**: a 404
  never matches a route, so an interceptor would leave unmatched requests with no id.
  Caller-supplied ids are validated before being echoed (they land in the audit trail).
- `common/decorators/` — `@BooleanQuery()`; see "Gotchas" below.
- `module/health/` — `/health` with a real Mongo ping via Terminus.
- `bootstrap.ts` — `configureApp()` shared by `main.ts` and every e2e suite, so tests
  exercise the same global `ValidationPipe` production runs.
- Swagger mounted in dev/CI only, never production (PHI service; don't publish the API map).
- CORS configured for the Vite origin.

**Frontend** (`frontend/`) — React 19, Vite 8, Tailwind 4
- Vitest + React Testing Library + jsdom added (the scaffold shipped with no test runner).
- Design tokens, responsive app shell, three-panel console collapsing to an ARIA tab set
  below `lg`, with full keyboard support (arrows, Home/End, roving tabindex).

### Phase 1 — Domain core (built, gate NOT run)

Six modules, built by four parallel agents against contracts fixed up front:

| Module | What it does | Tests |
|---|---|---|
| `departments` | Four clinical domains, read-only | 48 (shared with patients) |
| `patients` | CRUD, sequential `PAT001` ids | ↑ |
| `doctors` | Filtered search incl. `bookableOnly` | 62 (shared with schedules) |
| `schedules` | Weekly working windows per doctor | ↑ |
| `intake` | Per-session conversation state, merge semantics | 47 |
| `appointments` | **Availability + booking** — the hard one | 67 (45 unit + 22 e2e) |

- `seed/` — 4 departments, 12 doctors (one `ON_LEAVE`, one `BUSY`, one `OFFLINE`), 66
  schedules incl. evening clinics, 24 patients, ~60 appointments leaving deliberate gaps.
  Re-runnable. **Written and typechecks, but never executed** (blocked on Atlas).

---

## Not done

### Nothing exists yet for:
- **The voice agent** (`agent/`) — no LiveKit, no Gemini Live. This is Phase 2 and is the
  single biggest gap: it is the point of the product.
- **Authentication / roles / admin account** — Phase 3. No login exists.
- **Receptionist console, doctor dashboard, SOAP notes** — Phases 4–5. The frontend is
  still only an empty shell with placeholder text.
- Recovery scenarios, patient simulator, hardening — Phase 6.

### Phase 1 exit gate — 4 of 5 steps not run
1. ~~`npm run verify` both apps~~ — tests/typecheck pass, but full chain not run end to end.
2. **Full regression** — not run.
3. **Smoke test against a real database** — blocked on Atlas (below).
4. **`/check review`** — not run. Still the most valuable outstanding step.
5. **`/sync` docs** — `CLAUDE.md` not yet updated with Phase 1 conventions.

### Appointments module — reported and spot-checked (caveat resolved)
Initially flagged as unreviewed because its agent was stopped before reporting. It has since
reported, and three claims were verified directly in the code rather than taken on trust:
- **The concurrency test genuinely exercises the index.** The e2e asserts the live index's
  shape (`unique`, `partialFilterExpression`) and runs `syncIndexes()` first. The agent also
  ran a negative control — dropped the index, both bookings then succeeded (2 rows) — so the
  test demonstrably fails without the guard. Verified: assertions present at
  `test/appointments.e2e-spec.ts:129-138`.
- **`after` is inclusive, `before` exclusive**, both against the slot's start time.
  Documented on the service, the controller and the DTOs. Verified.
- **The `confirmed` transform is present and correct** (`dto/book-appointment.dto.ts:40-44`).
  Verified.

45 unit + 22 e2e tests. Two real bugs it found and fixed are recorded under Gotchas below.
Still worth a fresh-eyes `/check review` as part of the phase gate — spot-checking three
claims is not the same as reviewing the module.

---

## Blocked on you

1. **Atlas IP allowlist** — Network Access → "Add Current IP Address". Until then nothing
   can touch the real database: no seeding, no live smoke test. (Tests are unaffected —
   they use in-memory MongoDB.)
2. **Database name missing from `MONGODB_URI`** — it currently ends `mongodb.net/?...` and
   needs `mongodb.net/medbot?...`, or everything lands in a DB called `test`.
3. **Phase 2 credentials** (start early, provisioning is slow):
   - LiveKit Cloud: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
   - Google Cloud: project with Vertex AI enabled + service account JSON.
     Deliberately **not** the free AI Studio key — only Vertex AI is BAA-covered (plan §54).

---

## Decisions worth not re-litigating

| Decision | Why |
|---|---|
| **Modular monolith**, not microservices | Zero users; microservices would make booking a distributed saga and add network hops to a latency-sensitive voice path. Boundary discipline now, deployment topology later. |
| **Mongoose** over Prisma | Availability queries need real aggregation; Prisma's Mongo connector is weaker there. |
| **TypeScript pinned to 6.x** | TS 7.0 shipped with no programmatic compiler API; `typescript-eslint`/`ts-jest` cannot run on it. Revisit when 7.1 ships *and* tooling confirms support. |
| **ESM + Vitest + oxlint** on backend | Not a preference — `nest new` 12.0.3 has no CommonJS/Jest option at all. Corrected an earlier wrong assumption in `CLAUDE.md`. |
| **Vertex AI**, never the public Gemini API | Only Vertex is covered by Google's BAA. Building against the free key would mean rewriting before real patients. |
| **TanStack Query**, not RTK Query | No other reason to adopt Redux; TanStack gets the same caching standalone. |
| Plan **v1 → v2 rewrite** | v1 scheduled voice nearly last (contradicting plan §52), planned no per-role pages, and contained no design pass at all. All three were wrong. |

---

## Gotchas already paid for (don't rediscover these)

- **Every client-supplied boolean is suspect under `enableImplicitConversion`.** It runs
  *before* `@Transform`, and class-transformer's conversion is a bare `Boolean(value)`, so
  the string `"false"` becomes `true`. This bit twice, and the second one was serious:
  - `?bookableOnly=false` inverted into "offer doctors who are on leave." Fixed by
    `@BooleanQuery()` in `common/decorators/`.
  - **`confirmed: "false"` booked the appointment** — i.e. an explicit refusal turned into a
    confirmed booking, defeating the COMMIT-tier guarantee from plan §13 that nothing is
    booked without real patient confirmation. Fixed in `dto/book-appointment.dto.ts` by
    reading the raw body in the transform; e2e now asserts both `false` and `"false"` give
    403 with zero rows written.
  - *Follow-up:* the body fix is hand-rolled while query params use the shared decorator.
    Worth unifying so the next boolean field can't miss it.
- **Idempotency retries can collide with two unique indexes at once** and MongoDB reports
  only one, so recovering based on *which* index collided makes legitimate retries fail.
  Recover by looking up the `idempotencyKey` first, then treat it as "slot taken".
- **Mongoose 9 renamed `FilterQuery` → `QueryFilter`**, and `new: true` is deprecated in
  favour of `returnDocument: 'after'`.
- **e2e suites must import `AppModule` dynamically**, after starting the Mongo harness —
  `ConfigModule.forRoot()` validates env at module-definition time.
- **Types in decorated signatures need `import type`** (isolatedModules +
  emitDecoratorMetadata).
- **Patient id generation must be numeric, not lexicographic** — `PAT999` sorts above
  `PAT1000` and would reissue taken ids.
- **`missingRequiredFields()` returns `[]` both when complete and when no department is
  set** — a barely-started session reads as "done". Still unfixed in the helper; the intake
  module compensates with an explicit `complete` flag. **Fix the helper before Phase 2's
  booking gate depends on it.**

---

## Next steps, in order

1. Unblock Atlas (IP + db name), run `npm run seed`, confirm seeded data over REST.
2. Fix `missingRequiredFields()` — Phase 2's booking gate will depend on it.
3. Unify the boolean-transform fix so body fields use a shared decorator too, not just
   query params (see Gotchas — this one already caused a bookable-without-confirmation bug).
4. Close the Phase 1 gate: full verify, regression, `/check review`, update `CLAUDE.md`.
5. **Phase 2 — the voice agent.** The thing the product is actually for.

## Housekeeping

- **Nothing is committed.** All work is in the working tree, untracked.
- `backend/.env` holds a real Atlas credential; it is gitignored and has never been tracked.
- Known low-priority: `npm audit` flags `tmp`/`undici` via `@nestjs/mau` (the unused
  `nest deploy` tool). Fixing needs a breaking downgrade; revisit before a security review.
