import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.js"],
    env: {
      NODE_ENV: "test",
      MONGODB_URI: "mongodb://127.0.0.1:27017/iu_club_test",
      JWT_ACCESS_SECRET: "test_access_secret",
      JWT_REFRESH_SECRET: "test_refresh_secret",
    },
  },
});
