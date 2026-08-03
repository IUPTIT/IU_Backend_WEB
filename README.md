# IU_CLUB Backend

Backend API for the IU_CLUB student club management platform.
Built with **Node.js (ES Modules) + Express 4 + MongoDB (Mongoose)**.

> **Slice 1 — Foundation + Auth.** This is the project skeleton plus a complete
> authentication feature used as the reference implementation for every layer.
> Upcoming slices: Recruitment, Training, Public Content/CMS.

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

## Environment variables

See `.env.example`. Required: `MONGODB_URI`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`. Google SSO and email (OTP/reset) activate automatically
once their variables are filled in — without them, the app still runs and
verification/reset codes are printed to the console for local development.

## Project structure

```
src/
├── config/       env validation, DB connection, passport (Google) strategy
├── controllers/  HTTP orchestration only (req/res) — no business logic
├── middlewares/  authenticate (JWT), authorize (roles), error handler, rate limiter
├── models/       Mongoose schemas (User, Token)
├── routes/       API endpoint definitions
├── services/     business logic (auth, token, email)
├── utils/        ApiError, catchAsync, apiResponse
├── validators/   Joi/celebrate request schemas
└── app.js        Express app wiring
server.js         connects DB, then starts the HTTP server
```

**Request flow:** `route → validator → controller → service → model`.
Controllers never contain business logic; services never touch `req`/`res`.

## Auth API (`/api/v1/auth`)

| Method | Path               | Auth   | Purpose                                       |
| ------ | ------------------ | ------ | --------------------------------------------- |
| POST   | `/register`        | —      | Register (email/password), sends OTP          |
| POST   | `/verify-email`    | —      | Verify OTP → activate account                 |
| POST   | `/resend-otp`      | —      | Resend verification code                      |
| POST   | `/login`           | —      | Returns `accessToken` (body) + refresh cookie |
| POST   | `/refresh`         | cookie | Rotate refresh token, new access token        |
| POST   | `/logout`          | cookie | Revoke refresh token                          |
| POST   | `/forgot-password` | —      | Email a password-reset link                   |
| POST   | `/reset-password`  | —      | Set a new password                            |
| GET    | `/google`          | —      | Start Google SSO (if configured)              |
| GET    | `/google/callback` | —      | Finish Google SSO → issue JWT                 |
| GET    | `/me`              | Bearer | Current authenticated user                    |

**Tokens:** the access token is a short-lived JWT returned in the JSON body
(`Authorization: Bearer <token>`). The refresh token is a long-lived JWT stored
in an **httpOnly cookie** and rotated on every `/refresh`.

**Roles:** `bcn` (board/admin), `leader`, `member`. Protect routes with
`authenticate` then `authorize("bcn", ...)`.

## Conventions & tooling

Git conventions are documented in [CONTRIBUTING.md](./CONTRIBUTING.md) and
enforced by Husky hooks:

- **pre-commit** — runs ESLint and blocks direct commits to
  `main`/`development` or branches that break the `type/short-kebab` naming rule.
- **commit-msg** — validates the message against
  [Conventional Commits](https://www.conventionalcommits.org) via commitlint.

Code style is enforced by **Prettier** (`npm run format`).

## Scripts

| Command                | Description                    |
| ---------------------- | ------------------------------ |
| `npm start`            | Run the server                 |
| `npm run dev`          | Run with nodemon               |
| `npm run lint`         | ESLint check                   |
| `npm run lint:fix`     | ESLint autofix                 |
| `npm run format`       | Format the codebase (Prettier) |
| `npm run format:check` | Verify formatting              |
