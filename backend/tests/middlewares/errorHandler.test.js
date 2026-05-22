require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const errorHandler = require("../../src/middlewares/errorHandler");
const AppError = require("../../src/utils/appError");

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

test("errorHandler emits AppError status/message verbatim", () => {
  const res = fakeRes();
  errorHandler(new AppError("forbidden", 403), {}, res, () => {});
  assert.equal(res.captured.statusCode, 403);
  assert.equal(res.captured.body.success, false);
  assert.equal(res.captured.body.message, "forbidden");
});

test("errorHandler defaults plain Error to 500/Internal Server Error", () => {
  const res = fakeRes();
  errorHandler(new Error("boom"), {}, res, () => {});
  assert.equal(res.captured.statusCode, 500);
  assert.equal(res.captured.body.message, "boom");
});

test("errorHandler keeps default message when error has no message", () => {
  const res = fakeRes();
  errorHandler({}, {}, res, () => {});
  assert.equal(res.captured.statusCode, 500);
  assert.equal(res.captured.body.message, "Internal Server Error");
});

test("errorHandler includes stack details in non-production", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    const res = fakeRes();
    errorHandler(new Error("dev-boom"), {}, res, () => {});
    assert.ok(res.captured.body.error);
    assert.ok(res.captured.body.error.stack);
  } finally {
    process.env.NODE_ENV = previous;
  }
});

test("errorHandler hides stack in production", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const res = fakeRes();
    errorHandler(new Error("prod-boom"), {}, res, () => {});
    assert.equal(res.captured.body.error, null);
  } finally {
    process.env.NODE_ENV = previous;
  }
});
