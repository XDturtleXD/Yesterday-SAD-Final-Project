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

const memberInB = {
  role: "member",
  section_id: SECTION_B,
};

const principalInA = {
  role: "principal",
  section_id: SECTION_A,
};

const concertmaster = {
  role: "concertmaster",
  section_id: SECTION_A,
};

const platformAdmin = {
  role: "platform_admin",
  section_id: null,
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

test("member cannot create private annotation for another section score", () => {
  assert.equal(
    canCreateAnnotation(scoreInB, memberInA, ownerUser, {
      scope: "private",
      owner_user_id: ownerUser.id,
      section_id: SECTION_B,
    }),
    false,
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

test("principal cannot create private annotation for another section score", () => {
  assert.equal(
    canCreateAnnotation(scoreInB, principalInA, ownerUser, {
      scope: "private",
      owner_user_id: ownerUser.id,
      section_id: SECTION_B,
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

test("principal cannot create shared annotation with another section id", () => {
  assert.equal(
    canCreateAnnotation(scoreInA, principalInA, ownerUser, {
      scope: "shared",
      owner_user_id: ownerUser.id,
      section_id: SECTION_B,
    }),
    false,
  );
});

test("concertmaster cannot create section-shared annotation by default", () => {
  assert.equal(
    canCreateAnnotation(scoreInA, concertmaster, ownerUser, {
      scope: "shared",
      owner_user_id: ownerUser.id,
      section_id: SECTION_A,
    }),
    false,
  );
});

test("platform admin cannot create section-shared annotation by default", () => {
  assert.equal(
    canCreateAnnotation(scoreInA, platformAdmin, ownerUser, {
      scope: "shared",
      owner_user_id: ownerUser.id,
      section_id: SECTION_A,
    }),
    false,
  );
});

test("owner can read own private annotation", () => {
  assert.equal(canReadAnnotation(scoreInA, memberInA, ownerUser, privateAnnotation), true);
});

test("another user cannot read someone else's private annotation", () => {
  assert.equal(canReadAnnotation(scoreInA, memberInA, otherUser, privateAnnotation), false);
});

test("member can read shared annotation when they can view the score", () => {
  assert.equal(canReadAnnotation(scoreInA, memberInA, otherUser, sharedAnnotation), true);
});

test("member can view another section score but cannot read its shared annotation", () => {
  assert.equal(canReadAnnotation(scoreInA, memberInB, otherUser, sharedAnnotation), false);
});

test("project-level viewer can read shared annotation when they can view the score", () => {
  assert.equal(
    canReadAnnotation(scoreInB, concertmaster, otherUser, {
      ...sharedAnnotation,
      section_id: SECTION_B,
    }),
    true,
  );
});

test("platform admin can read section-shared annotations across sections", () => {
  assert.equal(
    canReadAnnotation(scoreInB, platformAdmin, otherUser, {
      ...sharedAnnotation,
      section_id: SECTION_B,
    }),
    true,
  );
});

test("users cannot update/delete another user's private annotation", () => {
  assert.equal(canUpdateAnnotation(scoreInA, memberInA, otherUser, privateAnnotation), false);
  assert.equal(canDeleteAnnotation(scoreInA, memberInA, otherUser, privateAnnotation), false);
});
