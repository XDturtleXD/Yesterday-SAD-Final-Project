// Sets predictable env vars for tests *before* any production module is required.
// Test files should `require("../helpers/testEnv")` as their very first line so
// that `src/config/env.js` picks these up.

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-please-do-not-use-in-production";
process.env.JWT_EXPIRES_IN = "1h";
process.env.SUPABASE_URL = "https://test.example.invalid";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
