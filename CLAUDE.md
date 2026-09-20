# Medbot

AI Healthcare Front Desk / Patient Intake Agent. Full plan, domains,
data models, and phased build order live in
`agentic_healthcare_front_desk_poc_plan.md` — read that for the "what
and why" of the product. This file is for AI-tool conventions.

## Tech stack (see plan §4, §50)

- Web: React 19 (latest 19.3 — no "React 20" exists, don't invent one)
  + Vite 8 (Rolldown-based) + Tailwind + LiveKit React SDK
- Agent: Node.js + LiveKit Agents + Gemini Live **via Vertex AI**
  (not the public Gemini Developer API — see plan §54, compliance)
- Backend: NestJS (this file's backend conventions apply here)
- Database: MongoDB (Atlas; HIPAA-eligible tier once real PHI is in
  scope — plan §54)

## Repo status

**Phase 0 (foundation) is complete** — see the phased build plan for
what each phase covers. `frontend` and `backend` both pass
`npm run verify` (lint + typecheck + unit + e2e + build), and the
built server has been smoke-tested as a real process in both
development and production modes. `agent` comes later (see plan
§28 for the target structure, §55 for why it's flat top-level folders
instead of an `apps/*` monorepo). No root `package.json`/workspace —
each folder is an independent project with its own lockfile,
scaffolded by its own CLI. Give each its own nested
`CLAUDE.md`/`AGENTS.md` for conventions specific to that folder — run
`/audit` on it — as a follow-up; this root file should shrink to just
cross-cutting stuff at that point, but for now still carries the
frontend, agent, and backend conventions below.

Known minor item, not yet addressed: `npm audit` on `backend` flags
vulnerabilities in `tmp`/`undici`, both transitive dependencies of
`@nestjs/mau` (the `nest deploy` dev-tool, part of the default Nest
CLI scaffold) via `inquirer`. `npm audit fix --force` would downgrade
`@nestjs/mau` as a breaking change to fix a deploy helper we're not
using yet — left alone for now, worth revisiting before actually using
`nest deploy` or before a security review.

## Scaffolding — CLI only, never hand-authored

Strict rule: every app, and every structural piece inside it (new
module, service, controller, component, route), gets created through
the framework's own CLI — never by hand-writing `package.json`,
config files, or folder skeletons yourself. The CLI bakes in whatever
config that framework's *current* version actually expects; hand-authoring
drifts from that silently and breaks things the CLI would have gotten
right for free.

- **frontend** — `npm create vite@latest frontend -- --template
  react-ts` (Vite 8, Rolldown bundler built in — no separate
  `rolldown-vite` package needed), then Tailwind via its own init
  command, then `npm install @livekit/components-react livekit-client`
  etc. New components/routes: however the chosen router's
  CLI/convention scaffolds them, not hand-created blank files as a
  default habit.
- **backend** — `nest new backend` (Nest CLI) to create the project.
  Everything after that goes through `nest g module|service|controller
  <name>` — never a hand-written module/service/controller file. This
  is not a style preference, it's the rule.
- **agent** — LiveKit's own CLI: `lk agent init agent
  --template agent-starter-node` (the officially maintained Node.js
  agent starter — uses pnpm). Don't hand-roll the agent skeleton.
- **packages/** (shared code, no framework) — not created yet, and
  deliberately deferred (§55): no shared piece of code exists across
  frontend/backend/agent to justify it. When one actually does, no
  framework CLI applies to a plain internal package, so `npm init -y`
  + explicit deps is fine there — the one exception to this rule, not
  a loophole for the folders above.

Once scaffolded, edit/extend the generated files normally — this rule
governs *creation*, not every subsequent line of code.

## TypeScript conventions (all apps)

### Version — pin to 6.x, not `latest`, as of this writing (Sept 2026)

TypeScript 7.0 (the Go-native rewrite — full port of the compiler to
Go, 8-12x faster full builds) went GA July 2026. It's a real
achievement, but it shipped with **no public programmatic compiler
API** (`ts.createProgram`, `ts.transform`, etc.). That API is what
type-aware ESLint (`typescript-eslint`), `ts-jest`, and `ts-morph`
all depend on to work — none of them can run on bare TS 7.0 yet. The
API is coming back in TypeScript 7.1, but 7.1's own roadmap only
targets a **beta in October 2026** — it is not out yet as of today.

Installing plain `typescript@latest` right now would silently pull in
7.0 and break `typescript-eslint`/`ts-jest` the moment they're used —
exactly the kind of breakage that's confusing to debug after the fact.

**Decision: pin `typescript@6` (the "final JS-based release," full
compiler API, fully compatible with our stack) across every app and
package — frontend, backend, agent, packages/*.** Don't let any
scaffolder install a bare `latest`/`^7` range. Revisit this pin once
TypeScript 7.1 actually ships stable *and* `typescript-eslint`/
`ts-jest` confirm support for it — not automatically the moment 7.1
tags, and not just because a newer major exists.

### tsconfig — strict everywhere, resolution matched per app

Non-negotiable on every `tsconfig.json` in the repo:

- `strict: true` (pulls in `noImplicitAny`, `strictNullChecks`,
  `strictFunctionTypes`, `strictBindCallApply`,
  `strictPropertyInitialization`, `useUnknownInCatchVariables`,
  `alwaysStrict`, `noImplicitThis` — don't enable these piecemeal
  instead of the umbrella flag)
- `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`,
  `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`,
  `skipLibCheck`

Module resolution is **not** the same across apps — don't force one
setting everywhere just for consistency:

- **backend** (NestJS) — `module`/`moduleResolution: "nodenext"`
  (ESM — see Backend conventions below for why this replaced an
  earlier CommonJS assumption). Don't hand-override it without a
  reason.
- **frontend** (Vite) — `moduleResolution: "bundler"`,
  `verbatimModuleSyntax: true`, `allowImportingTsExtensions: true`,
  `noEmit: true` (Vite/Oxc does the actual transpile — `tsc` here is
  type-checking only, never the build step). This is what the Vite
  `react-ts` template scaffolds; don't rewrite it into a Node-style
  config. `verbatimModuleSyntax` means type-only imports must say so
  explicitly — `import type { Foo } from './foo'`, not a plain
  `import` that happens to only be used as a type. Note: the template
  didn't include `strict: true` (or `noImplicitReturns`/
  `forceConsistentCasingInFileNames`) by default — added on top per
  the non-negotiable list above, confirmed not to break the build.
- **agent** (LiveKit CLI scaffold) — whatever
  `agent-starter-node` ships with, once it's scaffolded. Check what the
  template actually uses first rather than assuming it matches
  backend or frontend.

Same rule as "Scaffolding — CLI only" above: don't hand-edit a
`tsconfig.json` away from what its CLI generated without a documented
reason — the CLI's defaults are correct for that tool's current
version more often than a remembered "best practice" is.

### General code style

- No `any`. Use `unknown` + narrowing, or an actual type. An `any` is
  a silent hole in everything `strict: true` is there to catch.
- Interfaces/types for plain data shapes; classes only where something
  needs runtime representation (DI in NestJS, anything checked with
  `instanceof`) — interfaces are erased at compile time and don't
  exist for the framework to use (see the NestJS Providers section
  above — this is the same rule stated once).

## Frontend conventions (`frontend/`)

React 19.3 (latest — no "React 20"; that's a recurring false rumor,
19.x ships new stable features in minor releases, not majors) + Vite 8
+ TypeScript.

### Vite 8 specifics to know

- Rolldown is the default bundler built into Vite 8 itself — no
  separate `rolldown-vite` package to install or opt into.
- Use `@vitejs/plugin-react` v6, not `@vitejs/plugin-react-swc`. v6
  switched from Babel to Oxc for its own transform, which is the
  speed problem the SWC variant used to exist to solve — v6 already
  solves it, so there's no reason to reach for the SWC plugin.
- **Gotcha**: because v6 dropped Babel, the old
  `react({ babel: { plugins: [...] } })` config pattern no longer
  works. This matters directly for React Compiler (below) — it's a
  Babel-based tool, so enabling it on Vite 8 needs
  `@rolldown/plugin-babel` added explicitly, not just a plugin option
  on `@vitejs/plugin-react`.
- Env vars: only `VITE_`-prefixed variables reach client code
  (`import.meta.env.VITE_...`), and anything with that prefix gets
  bundled into shipped JS in plain text. Never prefix a secret with
  `VITE_` — this matters here specifically: the LiveKit **token**
  (short-lived, scoped to one room) is fine as `VITE_LIVEKIT_URL` /
  fetched per-session, but nothing Vertex AI/Gemini-credential-shaped
  ever belongs in web env vars, full stop — that only lives in
  agent and backend.
- `.env` loading order (lowest to highest precedence): `.env` →
  `.env.local` → `.env.[mode]` → `.env.[mode].local` → real shell env
  vars (highest). `.env.local` and `.env.*.local` are gitignored by
  Vite's default scaffold — keep them that way.

### React 19 patterns — use the current ones, not the old workarounds

- **Ref as a prop** — `function MyInput({ ref }) { ... }` directly.
  `forwardRef` is not needed for new components; don't reach for it
  out of habit.
- **Context as provider** — render `<ThemeContext value={...}>`
  directly, not `<ThemeContext.Provider value={...}>`. The `.Provider`
  form still works but is on a deprecation path.
- **Forms/mutations** — `useActionState` for form-submission state
  (pending/error/result) instead of hand-rolled `useState` +
  try/catch; `useFormStatus` for a submit button to read its parent
  form's pending state without prop drilling; `useOptimistic` for
  optimistic UI (e.g. showing a slot as "booking…" before
  `bookAppointment()` confirms — fits the plan's confirmation-flow UX
  directly, §17).
- **`use()`** — for reading a promise or context value during render,
  including conditionally/after an early return, where the old Hook
  rules forbade that.

### Effects — the default answer is "don't"

Straight from React's own guidance: an Effect is for synchronizing
with something **outside** React (a non-React widget, a subscription,
a fetch with cleanup for race conditions) — not a general-purpose
"run this when something changes" tool. Before writing `useEffect`,
check whether it's actually one of these, and use the listed
alternative instead:

- Deriving/transforming data from props or state → compute it inline
  during render, not in an Effect writing to more state.
- An expensive derived computation → `useMemo`, not an Effect.
- Something that happens because of a user action (submit, click) →
  put it directly in that event handler, not an Effect watching for
  the resulting state change.
- Resetting a component's state when a prop changes (e.g. the intake
  form resetting per patient session) → pass the changing value as
  `key` on the component, don't reset via an Effect.
- One Effect's state update triggering another Effect → collapse into
  a single calculation in the event handler; chained Effects mean
  multiple wasted render passes.
- Notifying a parent when child state changes → call the parent's
  callback directly in the event handler that changed the state, not
  from an Effect watching for the change.

### React Compiler

Stable (1.0) since Oct 2025 — legitimately production-ready, not
experimental. Use it: it removes the need to hand-place `useMemo` /
`useCallback` / `React.memo` for the common cases. Given the Vite 8 +
plugin-react v6 gotcha above, enabling it needs `@rolldown/plugin-babel`
wired in explicitly — this is an `/architect` decision to make once
frontend is actually being scaffolded, not to hand-wave now.

### State management vs. data fetching — two different problems

This app genuinely has both, and they don't get the same answer.

**Client/session state** (the live three-panel UI, §21 — conversation
transcript, live intake form, agent activity feed) is populated by
LiveKit room events and tool-call results arriving in realtime, not
fetched from a REST endpoint. That's component state + Context, per
the existing rule below — a data-fetching library doesn't apply to it
at all, no matter which one gets picked for the other half.

**Server state** (doctor/patient/appointment lists, the doctor/
receptionist review dashboard, §21's `DoctorReview.jsx`) is genuine
REST CRUD against backend, and caching/invalidation/loading-state
here is a real, concretely-needed problem once frontend starts calling
backend — not a preemptive addition. For this: **TanStack Query, not
RTK Query.**

Why: RTK Query is the right call specifically when an app already
uses Redux Toolkit for its broader client state, so server-state
caching collocates with the same store. We have no other reason to
adopt Redux (see client/session state above — Context covers it), so
pulling in RTK Query would mean adopting the entire Redux store
apparatus just to get its query-caching feature. TanStack Query gets
the same caching/background-refetch/mutation behavior standalone, is
the more idiomatic 2026 default outside Redux codebases, and has
equivalent typed-codegen tooling for our stack (`openapi-react-query-
codegen` or similar generates hooks straight from backend's OpenAPI
spec) — which fits the repo's existing "generate, don't hand-author"
posture (Scaffolding section above) even better than writing `fetch`
calls or Redux slices by hand. This makes `@nestjs/swagger` a
load-bearing piece of backend, not optional API docs — see the
Backend conventions' Global setup below.

Don't add either library before frontend actually needs to call
backend for a CRUD screen — this decision is about *which* one to
reach for when that happens, not a signal to wire it up now.

### State management (client/session state)

Default to component state + lifting state up + Context for anything
genuinely cross-cutting (e.g. the live patient-intake state the plan
describes in §10). Don't add a state management library preemptively
— if the live three-panel UI (§21) turns out to need one beyond
Context, that's an `/architect` decision made against the real
requirement, not a day-one default.

## Agent conventions (`agent/`, once scaffolded)

Node.js + `@livekit/agents` + `@livekit/agents-plugin-google` (Gemini
Live via Vertex AI — plan §54). Scaffolded from `agent-starter-node`
(Scaffolding section above), whose own `AGENTS.md` is the source for
most of this — read it directly once the app exists, this is a
summary, not a replacement.

### Package manager: pnpm, deliberately different from the rest of the repo

The starter template uses `pnpm` exclusively (install, run, test) —
that's upstream LiveKit convention, not our choice to fight. frontend
and backend stay on `npm` per the Scaffolding rule ("don't hand-edit
what the CLI generated"); agent is the one deliberate exception. Since
there's no shared workspace across the three folders (§55), this
doesn't even cause the friction it would in a real monorepo — don't
introduce one just to force a single package manager.

### Structure

- `src/main.ts` — required entrypoint name (referenced by the
  Dockerfile for deployment). Wires `defineAgent({ entry: async (ctx)
  => {...} })` and calls `cli.runApp(new ServerOptions({ agent:
  fileURLToPath(import.meta.url), agentName: '...' }))`.
- `src/agent.ts` — exports a `createAgent()` factory returning
  `voice.Agent.create({ instructions, tools })`. Keep instructions and
  tool definitions here, not inline in `main.ts`.
- Additional files as needed, but `main.ts` stays the entrypoint.

### Wiring a realtime model (Gemini Live) — different from a pipeline agent

Gemini Live is a **realtime multimodal model** (speech in, speech out
directly), not a cascaded STT→LLM→TTS pipeline. That changes where it
goes:

```typescript
import voice from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';

const session = new voice.AgentSession({
  llm: new google.realtime.RealtimeModel({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: process.env.GOOGLE_CLOUD_LOCATION, // defaults us-central1
  }),
});
```

- The `RealtimeModel` goes on `AgentSession`'s `llm` field — **omit**
  separate `stt`/`tts` plugins entirely when using it; it handles both
  internally. Don't copy a cascaded-pipeline example (e.g. AssemblyAI
  STT + some TTS plugin) and bolt Gemini Live on top of it.
- `entry` flow: `ctx.connect()` → `session.start({ agent:
  createAgent(), room: ctx.room, /* noise cancellation, etc. */ })` →
  `session.generateReply()` for the initial greeting.
- Auth for Vertex AI mode: `GOOGLE_APPLICATION_CREDENTIALS` pointing
  at a service account key file — same env vars already decided in
  the Tech stack / §54, not new ones to invent here.
- Version note: `@livekit/agents-plugin-google@1.x`; if the Gemini
  model picked is a 3.1-series model, that needs `@livekit/agents-
  plugin-google@1.9.0+`, and 3.1 currently drops affective dialog,
  proactive audio, and async function calling (the model blocks on
  tool responses instead) — check this against whichever specific
  Gemini Live model gets picked, don't assume feature parity across
  model versions.

### Function tools — this is where the plan's tool tiers become code

```typescript
import { llm } from '@livekit/agents';
import { z } from 'zod';

const findAvailableSlots = llm.tool({
  name: 'findAvailableSlots',
  description: 'Find available appointment slots for a department.',
  parameters: z.object({
    department: z.string().describe('e.g. DENTAL'),
    date: z.string().describe('ISO date'),
    after: z.string().optional().describe('HH:mm, earliest time'),
  }),
  execute: async (params, { ctx }) => {
    // calls the NestJS API — never touches Mongo directly (plan §5)
    return await apiClient.findAvailableSlots(params);
  },
});

const agent = voice.Agent.create({
  instructions: '...',
  tools: [findAvailableSlots /* ... */],
});
```

- `execute` receives `(parsedParams, { ctx })` and returns data that's
  auto-stringified for the model — never return something requiring
  the LLM to parse a nested/ambiguous shape.
- Errors surface to the model via `throw new llm.ToolError('message')`
  — not a thrown generic `Error`, and never a silently-swallowed
  failure the LLM can't react to.
- Every tool's `execute` is a thin client call into NestJS (per the
  harness design decided earlier — `runTool()` wrapper, READ/WRITE/
  COMMIT tiers, plan §13). The tool function itself does no validation
  or business-rule enforcement — that's NestJS's job; the tool is
  just the LLM-facing shape of the call.

### Multi-agent handoff — this is the real mechanism for the personas idea

The SDK has a native **handoff** primitive (structured agent-to-agent
control transfer within a session) for exactly the future scenario
discussed earlier — swapping from a receptionist persona to an
intake-nurse or assistant persona mid-call. LiveKit's own guidance:
design complex agents as handoffs between focused agents rather than
one long instruction prompt trying to cover every persona at once —
this is latency-sensitive (shorter, focused context per turn beats one
giant prompt). When personas actually get built, this is the primitive
to implement the state machine from plan §11 on top of, not something
to hand-roll from scratch — revisit this note when that work starts.

### Testing

- `scenarios.yaml` + `lk agent simulate --scenarios scenarios.yaml` —
  scenario-based end-to-end testing, run on every merge to main. This
  maps directly onto the plan's own Patient Simulator idea (§38) —
  the same scenarios (dental tooth pain, doctor unavailable, slot
  taken, patient rejects, reschedule, …) belong here as `lk agent
  simulate` scenarios, not a separate bespoke test harness.
- Unit tests (`src/agent.test.ts`, run via `pnpm test`) — in-process,
  turn-level checks without a live session.
- TDD is called out as required specifically for core behavior
  changes: instructions, tool descriptions, workflows — not optional
  for those, unlike general unit-test coverage elsewhere.

### Node vs Python SDK parity

The Node.js SDK doesn't always have 1:1 feature parity with the Python
SDK — LiveKit's own docs say to verify a feature actually exists in
the Node SDK before assuming it from Python examples/docs. Check this
each time a new capability is reached for, don't assume parity.

## Architecture — modular monolith, extraction-ready

One deployable backend. What makes it scalable is boundary discipline,
not process count. These rules are load-bearing; breaking one is what
makes a future service split impossible:

1. **Each module exclusively owns its collections.** No module imports
   another module's Mongoose models, ever.
2. **Cross-module reads go through the owning module's exported
   service**, injected via normal NestJS module imports/exports.
3. **Cross-module notifications go through the in-process event bus**
   (`@nestjs/event-emitter`, wired in `app.module.ts`) — deliberately
   the same shape a broker message would take.
4. **Nothing crosses a boundary as a Mongoose document.** Plain
   DTOs/contracts only (see `infra/audit/audit.types.ts` for the
   pattern) — leaking documents is what prevents extraction later.
5. **`common/` holds framework cross-cutting only** — guards, filters,
   interceptors, middleware, decorators. Never business logic.

Layout: `src/common/`, `src/infra/` (database, audit — `@Global`),
`src/module/<name>/` (feature modules, the unit of parallel ownership).

## Backend conventions (`backend/`)

NestJS 12 project (v12.0.3, scaffolded via `nest new`). Express
adapter, **ESM** (`"type": "module"`, `module`/`moduleResolution:
"nodenext"`) — this corrects an earlier assumption written here before
scaffolding: the migration guide frames ESM as optional for *upgrading
an existing v11 CommonJS project*, but `nest new` as of 12.0.3 has no
flag or prompt for a CommonJS scaffold at all — ESM/nodenext, Vitest,
and oxlint are simply what a fresh project gets. Confirmed by actually
running `nest new backend --package-manager npm`, not assumed. Per the
"CLI defaults win" rule (Scaffolding section), we're not fighting
this — relative imports need explicit `.js` extensions even from
`.ts` source (nodenext requirement), e.g. `import { AppModule } from
'./app.module.js'`.

### Role

You are a senior NestJS developer. Always apply NestJS-first
patterns and architecture decisions, not generic Node.js approaches.

### NestJS v12 specifics to know

- Express adapter now drains in-flight requests on shutdown by default
  (graceful shutdown) — no extra config needed.
- `@Optional()` is no longer inherited by subclasses — if a base class
  constructor param is `@Optional()`, any subclass extending it must
  redeclare `@Optional()` on that param itself or DI will throw
  `UnknownDependenciesException`.
- Route decorators can validate against Standard Schema libraries (Zod,
  Valibot) via a `schema` option + `StandardSchemaValidationPipe`, as an
  alternative to `class-validator` DTOs — pick one approach per module,
  don't mix within the same DTO.
- `routeResolutionStrategy: 'specificity'` (new in v12) auto-sorts routes
  so a literal path never gets shadowed by an earlier parametric one
  (e.g. `/patients/me` vs `/patients/:id`) — turn it on; don't rely on
  manually ordering route declarations to avoid shadowing.
- ESM, Vitest, and oxlint are what `nest new` actually scaffolds now
  (see intro above) — Rspack doesn't apply to us (that's for monorepo
  builds, we're not one, §55). `typescript@^6.0.2` was pinned by the
  CLI by default too, matching the TypeScript conventions decision
  above without needing an override.
- The generated `tsconfig.json` sets `strictPropertyInitialization:
  false` even under `strict: true` — that's deliberate on NestJS's
  part (DI-injected/decorator-driven properties don't get initialized
  in the constructor body the way `strictPropertyInitialization`
  expects), not a gap to "fix." The other non-negotiable flags from
  TypeScript conventions above (`noUnusedLocals`, `noImplicitReturns`,
  etc.) weren't in the generated config and were added on top —
  additive, not fighting anything the framework needs.

### Request lifecycle (know this cold — it decides where new logic goes)

Exact order, straight from the NestJS docs, for every incoming request:

```
Middleware → Guards → Interceptors (pre-handler) → Pipes
  → Controller handler → Service
  → Interceptors (post-handler, response transform)
  → Exception Filters (only if something threw)
  → client
```

Each stage resolves global → controller → route scope, except
interceptors, which unwind on the way out in reverse (last-in,
first-out — like a stack), and exception filters, which never run at
all on the happy path (they only fire on an uncaught exception). When
deciding where a piece of cross-cutting logic belongs, this order *is*
the decision: auth check → guard; request/response shaping around the
whole handler → interceptor; argument validation/coercion → pipe;
error response formatting → filter.

### Building blocks — what each one is actually for

- **Controllers** — routing only, no business logic. Bind `@Body()` /
  `@Query()` / `@Param()` to a validated DTO **class**, never a bare
  interface (interfaces don't exist at runtime — pipes and DI both
  need a real class to work against). Return plain values, don't reach
  for `@Res()` — it hands you the raw Express response and silently
  disables Nest's response pipeline (interceptors, `@HttpCode()`,
  etc.) unless you pass `{ passthrough: true }`.
- **Providers/Services** — business logic lives here, not in
  controllers. Constructor injection always; property injection
  (`@Inject()` on a field) only when a subclass hierarchy's `super()`
  chain forces it. Never inject by interface or type alias — DI
  resolves by class reference or an explicit token, and an interface
  is erased at compile time (this is the #1 cause of "Nest can't
  resolve dependencies" at boot). Default (singleton) scope unless
  there's a specific reason for `REQUEST` or `TRANSIENT` — both have a
  real per-request cost.
- **Modules** — one feature module per domain, matching
  `src/module/<name>/` below (patients, doctors, appointments, intake,
  …). Export only what other modules actually consume. Don't reach for
  `@Global()` as a shortcut to avoid an import — the docs call this out
  directly as bad practice; our infra modules (database, mail) are the
  deliberate, narrow exception already called out below.
- **Guards** — authorization only: "what can this user/persona do,"
  never "who are they" (that's an auth flow/middleware feeding
  `request.user`, not a guard's job). Pair with `Reflector` +
  a custom `@Roles()`-style decorator to read route metadata, instead
  of hardcoding role checks per guard. This is where the tool
  permission tiers from the product plan (READ/WRITE/COMMIT, §13) get
  enforced server-side — a guard reading a `@ToolTier()` decorator is
  the natural fit.
- **Interceptors** — the only piece that wraps the *entire*
  pipes→handler→service chain (runs before **and** after), which is
  why logging duration, transforming what the handler returned (e.g.
  a response envelope), caching, timeouts, and exception-to-response
  mapping all belong here, not in a guard or pipe.
- **Pipes** — validation and transformation of individual arguments,
  nothing else. All real DTO validation goes through the global
  `ValidationPipe` (below) — never hand-roll validation logic inside a
  controller or service method.
- **Exception filters** — shape the error response format only, never
  business logic. A filter is dead code on every successful request by
  definition — don't put anything load-bearing in one.
- **Custom parameter decorators** (`createParamDecorator`) — for
  repeated extraction patterns (e.g. a `@CurrentPatient()` decorator
  pulling the intake session off the request) instead of repeating
  `@Req()` + manual property access in every controller.

### Global setup (do this from the start of backend, not as an afterthought)

- `app.useGlobalPipes(new ValidationPipe({ whitelist: true,
  forbidNonWhitelisted: true, transform: true }))` in `main.ts` — not
  optional. `whitelist` + `forbidNonWhitelisted` means an unexpected
  field in a request body is a hard 400, not a silently-dropped field
  — this is "never trust extracted information blindly" (plan §42)
  enforced by the framework itself, not left to application code
  discipline.
- Every DTO is a class with `class-validator` decorators — no bare
  interfaces, no untyped `any` bodies.
- `@nestjs/config` via `ConfigModule.forRoot({ isGlobal: true,
  validationSchema: ... })` with a Joi (or Standard Schema/Zod) schema
  — a missing or malformed `MONGODB_URI` / `GOOGLE_CLOUD_PROJECT` fails
  at boot, not on the first request that happens to need it.
- Anything needing runtime construction (the Mongo client, the Vertex
  AI client) is a custom provider (`useFactory`) registered in its own
  module — never `new`'d inline in a service. This is the same rule as
  the Code standards bullet below, stated once, not duplicated.
- `@nestjs/swagger` (`DocumentBuilder` + `SwaggerModule.setup()`) is
  not optional API documentation here — frontend's data-fetching layer
  (TanStack Query, see Frontend conventions above) generates its typed
  hooks directly from this OpenAPI spec. Every controller/DTO needs
  real decorators (`@ApiProperty()`, etc.), not just `class-validator`
  ones, or the generated frontend client silently loses type fidelity.

### Code standards

- Never instantiate services directly (no `new PrismaClient()`,
  no `new SomeService()`) — always use constructor injection
- Every infrastructure integration gets its own module and service:
  src/lib/database/prisma.module.ts + prisma.service.ts
  src/lib/mail/mail.module.ts + mail.service.ts
- Mark infrastructure modules @Global() and import once in AppModule
  — this is the narrow, deliberate exception to "don't use @Global()
  as a shortcut" above, not a precedent to extend to feature modules
- Feature modules go in src/module/<name>/
- Shared guards, interceptors, decorators go in src/common/
- Nest CLI is mandatory for scaffolding, not optional — see
  "Scaffolding — CLI only" above

### Testing

- Unit tests: `Test.createTestingModule({...}).compile()`, then
  `.overrideProvider(X).useValue(mock)` for dependencies — a unit test
  never touches a real Mongo connection or the Gemini/Vertex client.
- e2e tests: `Test.createTestingModule` + `createNestApplication()` +
  Supertest against `app.getHttpServer()`; `app.init()` before, always
  `app.close()` after.
- We're on Vitest, matching what `nest new` actually scaffolds
  (corrected above) — `Test.createTestingModule()`/`.overrideProvider()`
  are Nest's own testing utilities, not Jest-specific, so the pattern
  above is unaffected; only Jest-specific APIs (`jest.fn()`, etc.)
  would need to become their Vitest equivalents (`vi.fn()`). Frontend
  is on Vitest too (jsdom + React Testing Library, configured in
  `vite.config.ts`), so both apps share one runner.


### Testing patterns established in Phase 0 (follow these)

- **e2e suites must import `AppModule` dynamically**, after starting the
  Mongo harness:
  ```ts
  await mongo.start();
  const { AppModule } = await import('../src/app.module.js');
  ```
  `ConfigModule.forRoot()` runs env validation at *module-definition*
  time, so a static import validates before the harness can point
  `MONGODB_URI` at the in-memory server, and the suite fails to boot.
- **e2e apps must call `configureApp()`** from `src/bootstrap.ts`, the
  same function `main.ts` uses. Building a bare test app skips the
  global `ValidationPipe`, so its mandatory guarantees would go untested
  and e2e would silently diverge from production behaviour.
- **Tear down with `try/finally`** (`app.close()` in `try`,
  `mongo.stop()` in `finally`) — a rejecting close otherwise orphans
  mongod and leaves `process.env` mutated for later suites.
- `test/support/mongo-test-harness.ts` owns the in-memory MongoDB and
  the env vars; each suite gets its own server so suites stay
  parallel-safe.

### Lifecycle choices worth not re-litigating

- **Request ids are middleware (`common/middleware/`), not an
  interceptor.** Interceptors only run once a route has matched, so 404s
  reached the error filter with an empty `requestId` and couldn't be
  correlated to their logs. Middleware runs for every request.
  Caller-supplied ids are validated (`/^[A-Za-z0-9._-]{1,128}$/`) before
  being echoed, because they land in the audit trail — a compliance
  artifact, not a free-text field.
- **The global exception filter checks `response.headersSent`** before
  writing, matching Nest's own `BaseExceptionFilter`; without it an
  error mid-stream throws `ERR_HTTP_HEADERS_SENT` and masks the original.
- **Swagger is not mounted in production** (`main.ts` gates on
  `NODE_ENV`). It's load-bearing for frontend codegen in dev/CI, but
  publishing a full API map from a PHI-handling service is gratuitous
  exposure.

## Skills

Do not load any skill by default. Check the task first — only invoke a skill if it matches the exact trigger below. Never invoke a skill just because it exists.

- `/scope` — turn an idea into a living plan (docs/scope/), plan the next
  slice, or reconcile after shipping
- `/architect` — a load-bearing technical decision is unmade (tech
  stack, approach for a feature) — writes a build spec to docs/specs/
- `/develop` — build a feature/API/service from an approved spec
- `/check verify` — after `/develop`, prove behavior against the spec
- `/check review` — before a PR, senior code review from a fresh model
- `/test` — write the test suite after implementing or changing code
- `/debug` — a bug's root cause is unclear (failing test, `/check
  verify` failure, wrong behavior)
- `/document` — write the PR description / changelog / release note /
  postmortem from the real diff
- `/audit` — bootstrap or refresh AGENTS.md context files (greenfield,
  or an area with missing docs)
- `/sync` — last step after a change is complete, around merge — keeps
  AGENTS.md, scope, and spec status current

## Context continuity

There's no "restore context" skill in this set — `AGENTS.md` (written by
`/audit`, kept current by `/sync`) is the durable context every skill
and AI tool reads instead. Read it at the start of a session if
present; run `/audit` once the codebase exists and has none yet.
