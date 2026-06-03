require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  canCreateAnnotation,
  canReadAnnotation,
  canUpdateAnnotation,
  canDeleteAnnotation,
} = require("../../src/services/annotationPermissionService");

const SECTION_A = "00000000-0000-0000-0000-0000000000aa";
const SECTION_B = "00000000-0000-0000-0000-0000000000bb";

const ownerUser = { id: "user-owner" };
const otherUser = { id: "user-other" };

const scoreInA = {
  id: "score-a",
  project_id: "project-1",
  section_id: SECTION_A,
};

const scoreInB = {
  id: "score-b",
  project_id: "project-1",
  section_id: SECTION_B,
};

const memberInA = {
  role: "member",
  section_id: SECTION_A,
};

const principalInA = {
  role: "principal",
  section_id: SECTION_A,
};

const concertmaster = {
  role: "concertmaster",
  section_id: SECTION_A,
};

const privateAnnotation = {
  id: "annotation-private",
  scope: "private",
  owner_user_id: ownerUser.id,
  section_id: SECTION_A,
};

const sharedAnnotation = {
  id: "annotation-shared",
  scope: "shared",
  owner_user_id: ownerUser.id,
  section_id: SECTION_A,
};

test("member can create private annotation for own visible score", () => {
  assert.equal(
    canCreateAnnotation(scoreInA, memberInA, ownerUser, {
      scope: "private",
      owner_user_id: ownerUser.id,
      section_id: SECTION_A,
    }),
    true,
  );
});

test("member cannot create shared annotation", () => {
  assert.equal(
    canCreateAnnotation(scoreInA, memberInA, ownerUser, {
      scope: "shared",
      owner_user_id: ownerUser.id,
      section_id: SECTION_A,
    }),
    false,
  );
});

test("principal can create shared annotation for own section", () => {
  assert.equal(
    canCreateAnnotation(scoreInA, principalInA, ownerUser, {
      scope: "shared",
      owner_user_id: ownerUser.id,
      section_id: SECTION_A,
    }),
    true,
  );
});

test("principal cannot create shared annotation for another section", () => {
  assert.equal(
    canCreateAnnotation(scoreInB, principalInA, ownerUser, {
      scope: "shared",
      owner_user_id: ownerUser.id,
      section_id: SECTION_B,
    }),
    false,
  );
});

test("concertmaster can create shared annotation", () => {
  assert.equal(
    canCreateAnnotation(scoreInB, concertmaster, ownerUser, {
      scope: "shared",
      owner_user_id: ownerUser.id,
      section_id: SECTION_B,
    }),
    true,
  );
});

test("private annotation readable only by owner", () => {
  assert.equal(canReadAnnotation(scoreInA, memberInA, ownerUser, privateAnnotation), true);
  assert.equal(canReadAnnotation(scoreInA, memberInA, otherUser, privateAnnotation), false);
});

test("shared annotation readable by score-visible members", () => {
  assert.equal(canReadAnnotation(scoreInA, memberInA, otherUser, sharedAnnotation), true);
  assert.equal(canReadAnnotation(scoreInB, memberInA, otherUser, sharedAnnotation), false);
});

test("users cannot update/delete another user's private annotation", () => {
  assert.equal(canUpdateAnnotation(scoreInA, memberInA, otherUser, privateAnnotation), false);
  assert.equal(canDeleteAnnotation(scoreInA, memberInA, otherUser, privateAnnotation), false);
});
