import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import config from "./env.js";

// Register the Google OAuth strategy only when credentials are present, so the
// app boots fine in environments without SSO configured. We use passport in
// stateless mode (session: false) and hand the raw profile to the controller,
// which delegates to auth.service for user lookup/creation + JWT issuance.
export function initPassport() {
  if (!config.google.enabled) {
    console.warn(
      "[auth] Google SSO disabled (missing GOOGLE_CLIENT_ID/SECRET)",
    );
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
      (_accessToken, _refreshToken, profile, done) => {
        // Defer all business logic to the controller/service layer.
        done(null, profile);
      },
    ),
  );

  return passport;
}

export default passport;
