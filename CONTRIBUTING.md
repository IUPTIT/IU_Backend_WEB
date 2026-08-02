# Contributing Guide

This repository enforces a small set of Git conventions. Two of them are
checked automatically by Husky hooks; please follow them from the start.

## 1. Branch naming rule

Never commit directly to `main` (or `develop`). Create a branch named:

```
<type>/<short-kebab-description>
```

- `<type>` is one of the commit types below (`feat`, `fix`, `docs`, …) plus
  `release` and `hotfix`.
- `<short-kebab-description>` is lowercase, words separated by `-`.

**Examples**

```
feat/recruitment-application-form
fix/refresh-token-rotation
docs/api-readme
chore/eslint-config
```

The pre-commit hook rejects commits made on `main`/`develop` or on a branch
that does not match this pattern.

### Typical flow

```bash
git checkout main && git pull
git checkout -b feat/my-feature
# ... work, commit ...
git push -u origin feat/my-feature
# open a Pull Request into main
```

## 2. Commit message rule (Conventional Commits)

Every commit message must follow:

```
<type>(<optional-scope>): <subject>
```

Enforced by `commitlint` via the `commit-msg` hook.

**Allowed types**

| Type       | Use for                                         |
| ---------- | ----------------------------------------------- |
| `feat`     | a new feature                                   |
| `fix`      | a bug fix                                       |
| `docs`     | documentation only                              |
| `style`    | formatting, no code change                      |
| `refactor` | code change that is neither a fix nor a feature |
| `perf`     | performance improvement                         |
| `test`     | adding/updating tests                           |
| `build`    | build system or dependencies                    |
| `ci`       | CI configuration                                |
| `chore`    | other maintenance                               |
| `revert`   | revert a previous commit                        |

**Examples**

```
feat(auth): add Google SSO login
fix(auth): rotate refresh token on refresh
docs: document auth endpoints in README
chore(deps): bump mongoose to 8.5
```

Rules of thumb: subject in the imperative mood, no trailing period, keep the
header under ~100 characters.

## 3. Pull Requests

- Keep PRs focused on one slice/feature.
- Ensure `npm run lint` and `npm run format:check` pass before requesting review.
- Fill in the PR template.

## Local checks

| Command                | Purpose                          |
| ---------------------- | -------------------------------- |
| `npm run lint`         | ESLint (also runs on pre-commit) |
| `npm run format`       | Auto-format with Prettier        |
| `npm run format:check` | Verify formatting                |
