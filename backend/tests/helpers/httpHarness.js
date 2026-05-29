// Minimal HTTP harness for HTTP-level integration / E2E tests.
//
// Usage (do this *before* requiring src/app or any service):
//
//   require("../helpers/testEnv");
//   const { createFakeSupabase } = require("../helpers/fakeSupabase");
//   const { injectFakeSupabase, startHarness } = require("../helpers/httpHarness");
//
//   const fake = createFakeSupabase();
//   injectFakeSupabase(fake);
//   const app = require("../../src/app");
//   const harness = startHarness(app);  // returns { baseURL, request, stop }
//
// The harness binds the Express app to an ephemeral port using Node's built-in
// http.createServer + the global fetch.

const http = require("node:http");

const injectFakeSupabase = (fake) => {
  const path = require.resolve("../../src/config/supabase");
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports: fake,
  };
};

const startHarness = (app) => {
  const server = http.createServer(app);

  const ready = new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const baseURLPromise = ready.then(() => {
    const { port } = server.address();
    return `http://127.0.0.1:${port}`;
  });

  const request = async (method, path, { body, token, headers: extraHeaders } = {}) => {
    const baseURL = await baseURLPromise;
    const headers = { "Content-Type": "application/json", ...(extraHeaders || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${baseURL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let parsed = null;
    const text = await res.text();
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    return { status: res.status, body: parsed };
  };

  const stop = () =>
    new Promise((resolve) => {
      server.close(() => resolve());
    });

  return { baseURLPromise, request, stop };
};

module.exports = { injectFakeSupabase, startHarness };
