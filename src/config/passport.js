import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import config from "./env.js";

// Register the Google strategy only when credentials exist. Stateless
// (session: false); the raw profile is passed to the controller/service.
export function initPassport() {
  if (!config.google.enabled) {
    console.warn("[auth] Google SSO disabled (missing credentials)");
    return passport;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientId,
        clientSecret: config.google.clientSecret,
        callbackURL: config.google.callbackUrl,
        scope: ["profile", "email"],
      },
      (_accessToken, _refreshToken, profile, done) => done(null, profile),
    ),
  );

  return passport;
}

export default passport;
