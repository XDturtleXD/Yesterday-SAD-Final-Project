require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const { _helpers } = require("../../src/services/annotationService");

test("isMissingAnnotationStorageError detects missing score_annotations relation", () => {
  assert.equal(
    _helpers.isMissingAnnotationStorageError({
      code: "42P01",
      message: 'relation "public.score_annotations" does not exist',
    }),
    true,
  );
});

test("isMissingAnnotationStorageError detects PostgREST schema cache misses", () => {
  assert.equal(
    _helpers.isMissingAnnotationStorageError({
      code: "PGRST205",
      message: "Could not find the table 'public.score_annotations' in the schema cache",
    }),
    true,
  );
});

test("isMissingAnnotationStorageError ignores unrelated Supabase errors", () => {
  assert.equal(
    _helpers.isMissingAnnotationStorageError({
      code: "23503",
      message: "insert or update on table violates foreign key constraint",
    }),
    false,
  );
});
