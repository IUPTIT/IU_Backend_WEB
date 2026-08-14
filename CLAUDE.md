# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # start with nodemon (auto-reload)
npm start              # start once
npm test               # vitest run (all tests, once)
npm run test:watch     # vitest watch mode
npm run lint           # ESLint (also runs on pre-commit)
npm run lint:fix       # ESLint autofix
npm run format         # Prettier write
npm run format:check   # Prettier check (must pass before PR)
npm run seed:admin     # seed first admin from ADMIN_EMAIL/ADMIN_PASSWORD in .env
```

Run a single test file / test: `npx vitest run src/services/__tests__/auth.service.test.js`
or filter by name with `npx vitest run -t "part of test name"`.

Requires Node >= 18 and a running MongoDB (`MONGODB_URI`). Copy `.env.example`
to `.env` first — see it for the full config surface. Only `MONGODB_URI`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` are required; email, Google SSO, and
Cloudinary activate only when their vars are set (otherwise OTP/reset codes print
to the console).

## Architecture

ES Modules + Express 4 + Mongoose 8. `server.js` connects the DB, starts Agenda
(`initJobs()`), then listens. `src/app.js` wires middleware and mounts all routes
under `/api/v1` (`src/routes/index.js`).

**Layering — strict, one direction:** `route → validation → controller → service → model`.

- Controllers do HTTP orchestration only (read `req`, call a service, send a
  response). They contain **no business logic**.
- Services hold all business logic and **never touch `req`/`res`**.
- Every async controller is wrapped in `catchAsync` (`src/utils/catchAsync.js`)
  so thrown errors reach the central error middleware (`src/middlewares/error.js`).

**Errors & responses — always use the helpers:**

- Throw `ApiError` (`src/utils/ApiError.js`), e.g. `ApiError.badRequest(msg)`,
  `.notFound()`, `.forbidden()`, `.conflict()`. The error middleware turns these
  into the response; don't hand-roll error JSON.
- Send success via `sendSuccess(res, { statusCode, message, data })`
  (`src/utils/apiResponse.js`). The envelope is always `{ success, message, data }`.

**Validation:** request schemas live in `src/validations/` using `celebrate`
(Joi). Attach them as route middleware, not inside controllers. Shared param
validators (`idParam`, `tokenParam`, `codeParam`) are in `common.validation.js`.

### Application state machine — do not bypass

`src/services/applicationStateMachine.js` is the **only** place allowed to change
an Application's `status`. Never set status via `findByIdAndUpdate`/`save()`
anywhere else. Call `transition(applicationId, nextStatus, { session })`; it
validates the move against `TRANSITION_MAP` and enqueues side-effects (account
creation, account disable, promote-to-member, notifications, email) as Agenda
jobs — it does **not** send email inline. Status flow:
`draft → pending_review → passed_cv/failed_cv → passed_interview/failed_interview → admitted/rejected`.

### Background jobs (Agenda)

Jobs are defined in `src/jobs/*.job.js` and registered/scheduled in
`src/jobs/index.js` (`initJobs()`). Side-effects of state changes are enqueued
(`agenda.now(...)`), not run synchronously. Recurring: interview reminders (15m),
unbooked-slot reminders (1h), draft expiry (1h), slot-hold release (1m),
task-deadline reminders (30m). When adding a job: define it, export its name
constant, register it in `initJobs()`, and enqueue via the exported constant.

### Roles & authorization

Canonical roles (`ROLES` in `src/models/user.model.js`):
`bcn`, `leader`, `member`, `candidate`. Users carry an **additive `roles[]`**
array plus a primary `role`; a member can also be a leader. Training access is a
separate boolean `isMentor` flag, not a role.

- **Always** check roles with the helpers in `src/utils/roles.js`
  (`hasRole`, `effectiveRoles`, `applyRoles`, `addRole`, `removeRole`) — they
  reconcile primary `role` with `roles[]` (e.g. member+leader → primary leader,
  any `bcn` → primary bcn).
- For Mongo queries filtering by role, use `mongoHasRole` / `mongoRoleIn` — they
  handle legacy docs that only have `role` and no `roles[]`.
- Route protection: `authenticate` (JWT) then `authorize(...)`;
  `requirePasswordChanged` forces a reset on seeded accounts.

**Tokens:** access token is a short-lived JWT in the JSON body
(`Authorization: Bearer`); refresh token is a long-lived JWT in an **httpOnly
cookie**, rotated on every `/refresh`.

### Route groups & the guest surface

Mounted under `/api/v1`: `/auth`, `/candidate`, `/recruitment` (BCN),
`/training` (BCN/Mentor), `/admin` (BCN), `/leader/department`,
`/notifications`, and `/public`.

`src/routes/public/**` is the **unauthenticated guest surface** — it must
**never** import or use `authenticate`. It is rate-limited via
`publicReadLimiter` / `publicWriteLimiter` (`src/middlewares/rateLimiter.js`).

### Human-readable sequential codes

Generate sequential codes (e.g. application codes) atomically via
`Counter.nextSeq(key)` (`src/models/counter.model.js`) — never a `count()`+1,
which races.

## Conventions

- **Branch naming** (enforced by pre-commit): `<type>/<short-kebab>`, e.g.
  `feat/recruitment-form`. Direct commits to `main`/`development` are rejected.
- **Commits** (enforced by commit-msg / commitlint): Conventional Commits,
  `<type>(<scope>): <subject>`, imperative, no trailing period.
- `npm run lint` and `npm run format:check` must pass before a PR.
- Existing domain code and comments are frequently written in Vietnamese; match
  the surrounding language when editing a file.
