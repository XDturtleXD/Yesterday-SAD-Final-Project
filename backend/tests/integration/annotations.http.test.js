require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFakeSupabase } = require("../helpers/fakeSupabase");
const { injectFakeSupabase, startHarness } = require("../helpers/httpHarness");
const {
  seedSections,
  seedUserWithToken,
  SECTION_FIRST_VIOLIN,
  SECTION_SECOND_VIOLIN,
} = require("../helpers/fixtures");

const fake = createFakeSupabase();
injectFakeSupabase(fake);
const app = require("../../src/app");
const harness = startHarness(app);

test.after(async () => {
  await harness.stop();
});

const now = () => new Date().toISOString();

const seedMember = (projectId, user, sectionId, role = "member") => {
  fake.seedRows("project_members", [
    {
      id: `pm-${user.user.id}-${role}`,
      project_id: projectId,
      user_id: user.user.id,
      section_id: sectionId,
      role,
      created_at: now(),
      updated_at: now(),
    },
  ]);
};

const setupScenario = async () => {
  fake.reset({});
  seedSections(fake);

  const owner = seedUserWithToken(fake, { email: "owner@example.test", name: "Owner" });
  const member = seedUserWithToken(fake, { email: "member@example.test", name: "Member" });
  const otherMember = seedUserWithToken(fake, {
    email: "other-member@example.test",
    name: "Other Member",
  });
  const secondViolinMember = seedUserWithToken(fake, {
    email: "second-violin-member@example.test",
    name: "Second Violin Member",
  });
  const principalA = seedUserWithToken(fake, {
    email: "principal-a@example.test",
    name: "First Violin Principal",
  });
  const principal = seedUserWithToken(fake, {
    email: "principal@example.test",
    name: "Principal",
  });
  const platformAdmin = seedUserWithToken(fake, {
    email: "admin@example.test",
    name: "Platform Admin",
    systemRole: "platform_admin",
  });

  const created = await harness.request("POST", "/api/projects", {
    token: owner.token,
    body: { name: "Concert", sectionId: SECTION_FIRST_VIOLIN },
  });
  const projectId = created.body.data.id;

  seedMember(projectId, member, SECTION_FIRST_VIOLIN, "member");
  seedMember(projectId, otherMember, SECTION_FIRST_VIOLIN, "member");
  seedMember(projectId, secondViolinMember, SECTION_SECOND_VIOLIN, "member");
  seedMember(projectId, principalA, SECTION_FIRST_VIOLIN, "principal");
  seedMember(projectId, principal, SECTION_SECOND_VIOLIN, "principal");

  const scoreA = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "First violin",
      piece: { title: "Piece A" },
      xmlContent: "<score-partwise/>",
    },
  });

  const scoreB = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_SECOND_VIOLIN,
      title: "Second violin",
      piece: { title: "Piece A" },
      xmlContent: "<score-partwise/>",
    },
  });

  return {
    owner,
    member,
    otherMember,
    secondViolinMember,
    principalA,
    principal,
    platformAdmin,
    projectId,
    scoreAId: scoreA.body.data.id,
    scoreBId: scoreB.body.data.id,
  };
};

const annotationBody = (overrides = {}) => ({
  scope: "private",
  annotationType: "dynamic",
  targetRef: {
    partId: "P1",
    measureNumber: 1,
    noteIndex: 0,
  },
  payload: {
    mark: "mf",
  },
  ...overrides,
});

test("member creates private annotation successfully", async () => {
  const { member, scoreAId } = await setupScenario();

  const response = await harness.request("POST", `/api/scores/${scoreAId}/annotations`, {
    token: member.token,
    body: annotationBody(),
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.data.scoreId, scoreAId);
  assert.equal(response.body.data.ownerUserId, member.user.id);
  assert.equal(response.body.data.scope, "private");
  assert.deepEqual(response.body.data.payload, { mark: "mf" });
});

test("member creates private bowing annotation without mutating score XML", async () => {
  const { member, otherMember, projectId, scoreAId } = await setupScenario();
  const beforeScore = fake.rows("scores").find((score) => score.id === scoreAId);
  const targetRef = {
    scoreId: scoreAId,
    partId: "P1",
    measureNumber: 8,
    measureArrayIndex: 7,
    noteIndex: 2,
    staff: "1",
    voice: "1",
    pitchStep: "D",
    pitchOctave: "4",
    duration: "1",
  };

  const created = await harness.request("POST", `/api/scores/${scoreAId}/annotations`, {
    token: member.token,
    body: annotationBody({
      scope: "private",
      annotationType: "bowing",
      targetRef,
      payload: { bowingType: "up-bow" },
    }),
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.data.projectId, projectId);
  assert.equal(created.body.data.scoreId, scoreAId);
  assert.equal(created.body.data.ownerUserId, member.user.id);
  assert.equal(created.body.data.sectionId, SECTION_FIRST_VIOLIN);
  assert.equal(created.body.data.scope, "private");
  assert.equal(created.body.data.annotationType, "bowing");
  assert.deepEqual(created.body.data.targetRef, targetRef);
  assert.deepEqual(created.body.data.payload, { bowingType: "up-bow" });
  assert.equal(fake.rows("scores").find((score) => score.id === scoreAId).xml_content, beforeScore.xml_content);

  const visibleToOwner = await harness.request("GET", `/api/scores/${scoreAId}/annotations`, {
    token: member.token,
  });
  assert.equal(visibleToOwner.status, 200);
  assert.equal(
    visibleToOwner.body.data.some((annotation) => annotation.id === created.body.data.id),
    true,
  );

  const hiddenFromOtherMember = await harness.request("GET", `/api/scores/${scoreAId}/annotations`, {
    token: otherMember.token,
  });
  assert.equal(hiddenFromOtherMember.status, 200);
  assert.equal(
    hiddenFromOtherMember.body.data.some((annotation) => annotation.id === created.body.data.id),
    false,
  );
});

test("member cannot create shared annotation", async () => {
  const { member, scoreAId } = await setupScenario();

  const response = await harness.request("POST", `/api/scores/${scoreAId}/annotations`, {
    token: member.token,
    body: annotationBody({ scope: "shared" }),
  });

  assert.equal(response.status, 403);
});

test("principal creates shared annotation for own section", async () => {
  const { principal, scoreBId } = await setupScenario();

  const response = await harness.request("POST", `/api/scores/${scoreBId}/annotations`, {
    token: principal.token,
    body: annotationBody({
      scope: "shared",
      sectionId: SECTION_SECOND_VIOLIN,
      annotationType: "bowing",
      payload: { mark: "down-bow" },
    }),
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.data.scope, "shared");
  assert.equal(response.body.data.sectionId, SECTION_SECOND_VIOLIN);
  assert.equal(response.body.data.annotationType, "bowing");
});

test("principal cannot create shared annotation for another section id", async () => {
  const { principalA, scoreAId } = await setupScenario();

  const response = await harness.request("POST", `/api/scores/${scoreAId}/annotations`, {
    token: principalA.token,
    body: annotationBody({
      scope: "shared",
      sectionId: SECTION_SECOND_VIOLIN,
    }),
  });

  assert.equal(response.status, 403);
});

test("concertmaster cannot create section-shared annotation by default", async () => {
  const { owner, scoreAId } = await setupScenario();

  const response = await harness.request("POST", `/api/scores/${scoreAId}/annotations`, {
    token: owner.token,
    body: annotationBody({
      scope: "shared",
      sectionId: SECTION_FIRST_VIOLIN,
    }),
  });

  assert.equal(response.status, 403);
});

test("platform admin cannot create section-shared annotation by default", async () => {
  const { platformAdmin, scoreAId } = await setupScenario();

  const response = await harness.request("POST", `/api/scores/${scoreAId}/annotations`, {
    token: platformAdmin.token,
    body: annotationBody({
      scope: "shared",
      sectionId: SECTION_FIRST_VIOLIN,
    }),
  });

  assert.equal(response.status, 403);
});

test("GET returns shared and own private annotations", async () => {
  const { principalA, member, otherMember, scoreAId } = await setupScenario();

  const ownPrivate = await harness.request("POST", `/api/scores/${scoreAId}/annotations`, {
    token: member.token,
    body: annotationBody({ payload: { mark: "p" } }),
  });
  const shared = await harness.request("POST", `/api/scores/${scoreAId}/annotations`, {
    token: principalA.token,
    body: annotationBody({
      scope: "shared",
      sectionId: SECTION_FIRST_VIOLIN,
      payload: { mark: "ff" },
    }),
  });
  await harness.request("POST", `/api/scores/${scoreAId}/annotations`, {
    token: otherMember.token,
    body: annotationBody({ payload: { mark: "mp" } }),
  });

  const response = await harness.request("GET", `/api/scores/${scoreAId}/annotations`, {
    token: member.token,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(
    response.body.data.map((annotation) => annotation.id).sort(),
    [ownPrivate.body.data.id, shared.body.data.id].sort(),
  );
});

test("different-section member cannot read section-shared annotation", async () => {
  const { principalA, secondViolinMember, scoreAId } = await setupScenario();

  await harness.request("POST", `/api/scores/${scoreAId}/annotations`, {
    token: principalA.token,
    body: annotationBody({
      scope: "shared",
      sectionId: SECTION_FIRST_VIOLIN,
      payload: { mark: "ff" },
    }),
  });

  const response = await harness.request("GET", `/api/scores/${scoreAId}/annotations`, {
    token: secondViolinMember.token,
  });

  assert.equal(response.status, 403);
});

test("section-shared annotation is not globally visible to concertmaster", async () => {
  const { owner, principal, scoreBId } = await setupScenario();

  const shared = await harness.request("POST", `/api/scores/${scoreBId}/annotations`, {
    token: principal.token,
    body: annotationBody({
      scope: "shared",
      sectionId: SECTION_SECOND_VIOLIN,
      payload: { mark: "ff" },
    }),
  });

  const response = await harness.request("GET", `/api/scores/${scoreBId}/annotations`, {
    token: owner.token,
  });

  assert.equal(response.status, 200);
  assert.equal(
    response.body.data.some((annotation) => annotation.id === shared.body.data.id),
    false,
  );
});

test("GET does not return another user's private annotations", async () => {
  const { member, otherMember, scoreAId } = await setupScenario();

  const otherPrivate = await harness.request("POST", `/api/scores/${scoreAId}/annotations`, {
    token: otherMember.token,
    body: annotationBody({ payload: { mark: "mp" } }),
  });

  const response = await harness.request("GET", `/api/scores/${scoreAId}/annotations`, {
    token: member.token,
  });

  assert.equal(response.status, 200);
  assert.equal(
    response.body.data.some((annotation) => annotation.id === otherPrivate.body.data.id),
    false,
  );
});

test("user cannot PATCH another user's private annotation", async () => {
  const { member, otherMember, scoreAId } = await setupScenario();

  const created = await harness.request("POST", `/api/scores/${scoreAId}/annotations`, {
    token: member.token,
    body: annotationBody(),
  });

  const response = await harness.request("PATCH", `/api/annotations/${created.body.data.id}`, {
    token: otherMember.token,
    body: { payload: { mark: "ff" } },
  });

  assert.equal(response.status, 403);
});

test("user cannot DELETE another user's private annotation", async () => {
  const { member, otherMember, scoreAId } = await setupScenario();

  const created = await harness.request("POST", `/api/scores/${scoreAId}/annotations`, {
    token: member.token,
    body: annotationBody(),
  });

  const response = await harness.request("DELETE", `/api/annotations/${created.body.data.id}`, {
    token: otherMember.token,
  });

  assert.equal(response.status, 403);
  assert.equal(fake.rows("score_annotations").length, 1);
});

test("PATCH can update payload and targetRef for allowed user", async () => {
  const { member, scoreAId } = await setupScenario();

  const created = await harness.request("POST", `/api/scores/${scoreAId}/annotations`, {
    token: member.token,
    body: annotationBody(),
  });

  const nextTargetRef = { partId: "P1", measureNumber: 2, noteIndex: 3 };
  const nextPayload = { mark: "ff" };
  const response = await harness.request("PATCH", `/api/annotations/${created.body.data.id}`, {
    token: member.token,
    body: {
      targetRef: nextTargetRef,
      payload: nextPayload,
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data.targetRef, nextTargetRef);
  assert.deepEqual(response.body.data.payload, nextPayload);
});

test("DELETE removes allowed annotation", async () => {
  const { member, scoreAId } = await setupScenario();

  const created = await harness.request("POST", `/api/scores/${scoreAId}/annotations`, {
    token: member.token,
    body: annotationBody(),
  });

  const response = await harness.request("DELETE", `/api/annotations/${created.body.data.id}`, {
    token: member.token,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.id, created.body.data.id);
  assert.equal(fake.rows("score_annotations").length, 0);
});
