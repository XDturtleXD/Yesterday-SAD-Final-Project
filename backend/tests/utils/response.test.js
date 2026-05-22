require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const { sendSuccess, sendError } = require("../../src/utils/response");

const fakeRes = () => {
  const captured = { statusCode: null, body: null };
  return {
    captured,
    status(code) {
      captured.statusCode = code;
      return this;
    },
    json(body) {
      captured.body = body;
      return this;
    },
  };
};

test("sendSuccess defaults to 200 with success envelope", () => {
  const res = fakeRes();
  sendSuccess(res, { id: 1 });
  assert.equal(res.captured.statusCode, 200);
  assert.deepEqual(res.captured.body, {
    success: true,
    message: "Success",
    data: { id: 1 },
    error: null,
  });
});

test("sendSuccess accepts custom message and status", () => {
  const res = fakeRes();
  sendSuccess(res, { id: 1 }, "Created", 201);
  assert.equal(res.captured.statusCode, 201);
  assert.equal(res.captured.body.message, "Created");
});

test("sendSuccess defaults data to null", () => {
  const res = fakeRes();
  sendSuccess(res);
  assert.equal(res.captured.body.data, null);
});

test("sendError defaults to 500 with error envelope", () => {
  const res = fakeRes();
  sendError(res);
  assert.equal(res.captured.statusCode, 500);
  assert.deepEqual(res.captured.body, {
    success: false,
    message: "Internal Server Error",
    data: null,
    error: null,
  });
});

test("sendError forwards details on error field", () => {
  const res = fakeRes();
  sendError(res, "boom", 400, { reason: "x" });
  assert.equal(res.captured.statusCode, 400);
  assert.equal(res.captured.body.message, "boom");
  assert.deepEqual(res.captured.body.error, { reason: "x" });
});
