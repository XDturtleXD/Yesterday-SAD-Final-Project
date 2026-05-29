// E2E: a concertmaster uploads scores, then exercises the git-like history
// API end-to-end through HTTP — create branch, create commits on it, list
// commits, compare two commits, then merge a feature branch back into main.

require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFakeSupabase } = require("../helpers/fakeSupabase");
const { injectFakeSupabase, startHarness } = require("../helpers/httpHarness");
const {
  seedSections,
  seedUserWithToken,
  SECTION_FIRST_VIOLIN,
} = require("../helpers/fixtures");

const fake = createFakeSupabase();
injectFakeSupabase(fake);
const app = require("../../src/app");
const harness = startHarness(app);

test.after(async () => {
  await harness.stop();
});

test("E2E: branches → commits → list → compare → merge", async () => {
  fake.reset({});
  seedSections(fake);
  const { token } = seedUserWithToken(fake, { email: "cm@example.test" });

  // 1. Create project + upload one score to seed a score row.
  const projectRes = await harness.request("POST", "/api/projects", {
    token,
    body: { name: "P", sectionId: SECTION_FIRST_VIOLIN },
  });
  const projectId = projectRes.body.data.id;
  const uploadRes = await harness.request(
    "POST",
    `/api/projects/${projectId}/scores`,
    {
      token,
      body: {
        sectionId: SECTION_FIRST_VIOLIN,
        title: "Vln 1",
        piece: { title: "Piece A" },
        xmlContent: '<?xml version="1.0"?><score-partwise/>',
      },
    },
  );
  const scoreId = uploadRes.body.data.id;

  // 2. Create the default branch ("main"). Initial branch in a project
  // becomes the default automatically.
  const mainBranchRes = await harness.request(
    "POST",
    `/api/projects/${projectId}/branches`,
    { token, body: { name: "main" } },
  );
  assert.equal(mainBranchRes.status, 201);
  assert.equal(mainBranchRes.body.data.is_default, true);
  const mainBranchId = mainBranchRes.body.data.id;

  // 3. Create a commit on main with one score snapshot.
  const commit1 = await harness.request(
    "POST",
    `/api/projects/${projectId}/branches/${mainBranchId}/commits`,
    {
      token,
      body: {
        message: "Initial bowing pass",
        scoreSnapshots: [
          {
            scoreId,
            storagePath: "snapshots/vln1-v1.musicxml",
            fileType: "musicxml",
          },
        ],
      },
    },
  );
  assert.equal(commit1.status, 201);
  assert.equal(commit1.body.data.message, "Initial bowing pass");
  assert.equal(commit1.body.data.parent_commit_id, null);
  const commit1Id = commit1.body.data.id;

  // 4. Create a second commit on main with a different storage_path.
  const commit2 = await harness.request(
    "POST",
    `/api/projects/${projectId}/branches/${mainBranchId}/commits`,
    {
      token,
      body: {
        message: "Tighten m. 10-15",
        scoreSnapshots: [
          {
            scoreId,
            storagePath: "snapshots/vln1-v2.musicxml",
            fileType: "musicxml",
          },
        ],
      },
    },
  );
  assert.equal(commit2.status, 201);
  assert.equal(commit2.body.data.parent_commit_id, commit1Id);
  const commit2Id = commit2.body.data.id;

  // 5. List commits on main — newest first.
  const listRes = await harness.request(
    "GET",
    `/api/projects/${projectId}/branches/${mainBranchId}/commits`,
    { token },
  );
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.data.length, 2);
  assert.equal(listRes.body.data[0].id, commit2Id);

  // 6. Compare the two commits — should be `modified` (storage_path differs).
  const compareRes = await harness.request(
    "GET",
    `/api/projects/${projectId}/commits/compare?from=${commit1Id}&to=${commit2Id}`,
    { token },
  );
  assert.equal(compareRes.status, 200);
  assert.equal(compareRes.body.data.added.length, 0);
  assert.equal(compareRes.body.data.removed.length, 0);
  assert.equal(compareRes.body.data.modified.length, 1);
  assert.equal(compareRes.body.data.modified[0].scoreId, scoreId);

  // 7. Branch off main → "feature/dynamics".
  const featureRes = await harness.request(
    "POST",
    `/api/projects/${projectId}/branches`,
    {
      token,
      body: { name: "feature/dynamics", fromCommitId: commit2Id },
    },
  );
  assert.equal(featureRes.status, 201);
  assert.equal(featureRes.body.data.is_default, false);
  const featureBranchId = featureRes.body.data.id;

  // 8. Commit on feature branch.
  const featureCommit = await harness.request(
    "POST",
    `/api/projects/${projectId}/branches/${featureBranchId}/commits`,
    {
      token,
      body: {
        message: "Add forte at m. 12",
        scoreSnapshots: [
          {
            scoreId,
            storagePath: "snapshots/vln1-v3-feature.musicxml",
            fileType: "musicxml",
          },
        ],
      },
    },
  );
  assert.equal(featureCommit.status, 201);

  // 9. Merge feature → main (concertmaster only; we're the CM).
  const mergeRes = await harness.request("POST", `/api/projects/${projectId}/merges`, {
    token,
    body: {
      fromBranchId: featureBranchId,
      intoBranchId: mainBranchId,
    },
  });
  assert.equal(mergeRes.status, 201);
  assert.equal(mergeRes.body.data.merge_parent_commit_id, featureCommit.body.data.id);

  // 10. After merge, main's head should point at the merge commit and the
  // feature branch's version should now be on main.
  const mainNow = await harness.request(
    "GET",
    `/api/projects/${projectId}/branches/${mainBranchId}`,
    { token },
  );
  assert.equal(mainNow.body.data.head_commit_id, mergeRes.body.data.id);

  const mainHeadCommit = await harness.request(
    "GET",
    `/api/projects/${projectId}/commits/${mergeRes.body.data.id}`,
    { token },
  );
  assert.equal(mainHeadCommit.status, 200);
  const sv = mainHeadCommit.body.data.score_versions;
  assert.equal(sv.length, 1);
  assert.equal(sv[0].storage_path, "snapshots/vln1-v3-feature.musicxml");
});
