// Enforce Conventional Commits on every commit message via the husky
// commit-msg hook. Allowed types below map to our workflow.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat", // a new feature
        "fix", // a bug fix
        "docs", // documentation only
        "style", // formatting, no code change
        "refactor", // code change that neither fixes a bug nor adds a feature
        "perf", // performance improvement
        "test", // adding/updating tests
        "build", // build system or dependencies
        "ci", // CI configuration
        "chore", // other maintenance tasks
        "revert", // revert a previous commit
      ],
    ],
    "subject-case": [0], // allow any case in the subject
  },
};
