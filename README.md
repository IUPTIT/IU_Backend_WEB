# IU_CLUB Backend

Backend API for the IU_CLUB student club management platform.
Built with **Node.js (ES Modules) + Express 4 + MongoDB (Mongoose 8)**.

Covers the full club lifecycle: guest application intake, recruitment &
interview scheduling, member training, and internal administration — backed by
scheduled background jobs (Agenda), transactional email, file uploads, and
Excel export.

## Requirements

- Node.js >= 18
- MongoDB (local or Atlas)

## Getting started

```bash
npm install
cp .env.example .env      # then fill in the values
npm run dev               # start with auto-reload (nodemon)
# or
npm start
```

Health check: `GET http://localhost:3456/api/v1/health` (port follows `PORT`).

Seed a first admin so you can log in:

```bash
npm run seed:admin        # uses ADMIN_EMAIL / ADMIN_PASSWORD from .env
```

## Environment variables

See `.env.example`. Required: `MONGODB_URI`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`. Optional integrations activate only when configured:

- **Email** — `SENDGRID_API_KEY` + `EMAIL_FROM` (a verified SendGrid sender) is
  preferred on deploy. `SMTP_*` is a local fallback (Gmail SMTP is often blocked
  on PaaS). With neither set, OTP/reset codes are printed to the console (dev).
- **Google SSO** — `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. The callback URL
  is derived from `BACKEND_URL` unless `GOOGLE_CALLBACK_URL` is set explicitly.
- **Cloudinary** — `CLOUDINARY_*` for avatar / applicant CV uploads.
- **`TRUST_PROXY`** — number of proxy hops to trust so rate limiting sees the
  real client IP (`0` local, `1` behind one reverse proxy / PaaS).

## Project structure

```
src/
├── config/       env validation, DB connection, passport (Google), agenda
├── controllers/  HTTP orchestration only (req/res) — no business logic
├── middlewares/  authenticate (JWT), authorize (roles), rate limiter,
│                 requirePasswordChanged, error handler
├── models/       Mongoose schemas (users, applications, campaigns, training…)
├── routes/       API endpoint definitions (routes/public = guest, unauthed)
├── services/     business logic; applicationStateMachine.js is the app FSM
├── jobs/         Agenda job definitions + scheduler (jobs/index.js)
├── validations/  celebrate (Joi) request schemas
├── utils/        ApiError, catchAsync, apiResponse
├── scripts/      seed / migration / smoke-test CLI scripts
└── app.js        Express app wiring
server.js         connects DB, starts Agenda, then starts the HTTP server
```

**Request flow:** `route → validation → controller → service → model`.
Controllers never contain business logic; services never touch `req`/`res`.

## API surface (`/api/v1`)

| Prefix               | Audience       | Purpose                                                       |
| -------------------- | -------------- | ------------------------------------------------------------- |
| `/public`            | Guest (unauth) | Browse active campaigns; save/submit/lookup/edit applications |
| `/auth`              | All            | Register, verify, login, refresh, password reset, Google SSO  |
| `/candidate`         | Candidate      | View offer, hold & confirm interview slots, change slot       |
| `/recruitment`       | BCN            | Campaigns, forms, application scoring & decisions, slots      |
| `/training`          | BCN / Mentor   | Programs, groups, tasks, trainee reviews, certificates        |
| `/admin`             | BCN            | Members, accounts, departments, dashboard, email templates    |
| `/leader/department` | Leader         | Leader's own department view                                  |
| `/notifications`     | Authenticated  | List notifications, mark read                                 |

> `routes/public/**` must **never** import `authenticate` — it is the
> unauthenticated guest surface (rate-limited via `publicRead/WriteLimiter`).

### Auth (`/api/v1/auth`)

`POST /register` · `/verify-email` · `/resend-otp` · `/login` · `/refresh` ·
`/logout` · `/forgot-password` · `/reset-password` · `/change-password` —
`GET /me`, `PATCH /me` — `GET /google`, `/google/callback` (when SSO configured).

**Tokens:** the access token is a short-lived JWT returned in the JSON body
(`Authorization: Bearer <token>`). The refresh token is a long-lived JWT stored
in an **httpOnly cookie** and rotated on every `/refresh`.

**Roles:** `bcn` (board/admin), `leader`, `member`, `candidate`. Users carry an
additive `roles` array (e.g. a member who is also a leader). Training access uses
a separate `isMentor` flag. Protect routes with `authenticate` then
`authorize(...)`; `requirePasswordChanged` forces a reset on seeded accounts.

## Background jobs (Agenda)

Jobs are defined in `src/jobs/` and started in `server.js` via `initJobs()`.
Recurring schedules: interview reminders (15m), unbooked-slot reminders (1h),
draft-application expiry (1h), slot-hold release (1m), task-deadline reminders
(30m). One-shot jobs (candidate account creation, account disable, promote to
member) are scheduled on demand by services.

## Testing

```bash
npm test          # vitest run (once)
npm run test:watch
```

Unit tests live next to code in `__tests__/` folders and `*.test.js` files.

## Conventions & tooling

Git conventions are documented in [CONTRIBUTING.md](./CONTRIBUTING.md) and
enforced by Husky hooks:

- **pre-commit** — runs ESLint and blocks direct commits to
  `main`/`development` or branches that break the `type/short-kebab` naming rule.
- **commit-msg** — validates the message against
  [Conventional Commits](https://www.conventionalcommits.org) via commitlint.

Code style is enforced by **Prettier** (`npm run format`).

## Scripts

| Command                       | Description                             |
| ----------------------------- | --------------------------------------- |
| `npm start`                   | Run the server                          |
| `npm run dev`                 | Run with nodemon                        |
| `npm test` / `test:watch`     | Run tests (Vitest)                      |
| `npm run lint` / `lint:fix`   | ESLint check / autofix                  |
| `npm run format` / `:check`   | Format / verify formatting (Prettier)   |
| `npm run seed:admin`          | Seed the first admin account            |
| `npm run seed:real`           | Clean DB and seed real members          |
| `npm run seed:demo`           | Seed demo users                         |
| `npm run reset:training-demo` | Reset the training demo data            |
| `npm run test:training-flow`  | Smoke-test the end-to-end training flow |
