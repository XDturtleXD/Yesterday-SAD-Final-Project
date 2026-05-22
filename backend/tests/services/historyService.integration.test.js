require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFakeSupabase } = require("../helpers/fakeSupabase");

// Inject the fake supabase into require.cache BEFORE historyService is required.
const supabaseModulePath = require.resolve("../../src/config/supabase");
const fake = createFakeSupabase();
require.cache[supabaseModulePath] = {
  id: supabaseModulePath,
  filename: supabaseModulePath,
  loaded: true,
  exports: fake,
};

const historyService = require("../../src/services/historyService");

// ---------------------------------------------------------------------------
// Test fixture builders
// ---------------------------------------------------------------------------

const PROJECT = "11111111-1111-1111-1111-111111111111";
const SECTION_A = "00000000-0000-0000-0000-0000000000aa";
const SECTION_B = "00000000-0000-0000-0000-0000000000bb";
const USER_CM = "22222222-2222-2222-2222-222222222001"; // concertmaster
const USER_PRINCIPAL_A = "22222222-2222-2222-2222-222222222002";
const USER_MEMBER = "22222222-2222-2222-2222-222222222003";
const SCORE_A1 = "ssss-aaaa-0001";
const SCORE_A2 = "ssss-aaaa-0002";
const SCORE_B1 = "ssss-bbbb-0001";

const baseFixture = () => ({
  scores: [
    { id: SCORE_A1, project_id: PROJECT, section_id: SECTION_A },
    { id: SCORE_A2, project_id: PROJECT, section_id: SECTION_A },
    { id: SCORE_B1, project_id: PROJECT, section_id: SECTION_B },
  ],
  branches: [],
  commits: [],
  score_versions: [],
});

const membershipCM = { role: "concertmaster", section_id: SECTION_A };
const membershipPrincipalA = { role: "principal", section_id: SECTION_A };
const membershipMember = { role: "member", section_id: SECTION_B };

// ---------------------------------------------------------------------------
// createBranch
// ---------------------------------------------------------------------------

test("createBranch: first branch in a project becomes the default", async () => {
  fake.reset(baseFixture());
  const branch = await historyService.createBranch(
    { name: "main" },
    PROJECT,
    { id: USER_CM },
  );
  assert.equal(branch.name, "main");
  assert.equal(branch.is_default, true);
  assert.equal(branch.head_commit_id, null);
});

test("createBranch: subsequent branch is NOT default", async () => {
  fake.reset({
    ...baseFixture(),
    branches: [
      {
        id: "br-main",
        project_id: PROJECT,
        name: "main",
        head_commit_id: null,
        is_default: true,
        created_by: USER_CM,
      },
    ],
  });
  const branch = await historyService.createBranch(
    { name: "feature/bow" },
    PROJECT,
    { id: USER_CM },
  );
  assert.equal(branch.is_default, false);
});

test("createBranch: duplicate name in the same project rejects with 409", async () => {
  fake.reset({
    ...baseFixture(),
    branches: [
      {
        id: "br-main",
        project_id: PROJECT,
        name: "main",
        head_commit_id: null,
        is_default: true,
        created_by: USER_CM,
      },
    ],
  });
  await assert.rejects(
    () => historyService.createBranch({ name: "main" }, PROJECT, { id: USER_CM }),
    (err) => {
      assert.equal(err.statusCode, 409);
      return true;
    },
  );
});

test("createBranch: missing name rejects with 400", async () => {
  fake.reset(baseFixture());
  await assert.rejects(
    () => historyService.createBranch({ name: "  " }, PROJECT, { id: USER_CM }),
    (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// createCommit — parent inheritance + branch head advancement
// ---------------------------------------------------------------------------

const prepareBranchWithCommit = () => {
  const fixture = baseFixture();
  fixture.branches.push({
    id: "br-main",
    project_id: PROJECT,
    name: "main",
    head_commit_id: "cmt-1",
    is_default: true,
    created_by: USER_CM,
  });
  fixture.commits.push({
    id: "cmt-1",
    project_id: PROJECT,
    branch_id: "br-main",
    parent_commit_id: null,
    merge_parent_commit_id: null,
    message: "initial",
    author_user_id: USER_CM,
  });
  fixture.score_versions.push({
    id: "sv-1",
    commit_id: "cmt-1",
    score_id: SCORE_A1,
    storage_bucket: "scores",
    storage_path: "p/a1-v1.musicxml",
    file_type: "musicxml",
    original_filename: null,
    mime_type: null,
    file_size_bytes: null,
  });
  fixture.score_versions.push({
    id: "sv-2",
    commit_id: "cmt-1",
    score_id: SCORE_A2,
    storage_bucket: "scores",
    storage_path: "p/a2-v1.musicxml",
    file_type: "musicxml",
    original_filename: null,
    mime_type: null,
    file_size_bytes: null,
  });
  fake.reset(fixture);
};

test("createCommit: inherits parent versions and applies overrides", async () => {
  prepareBranchWithCommit();
  const commit = await historyService.createCommit(
    {
      message: "update a1",
      scoreSnapshots: [
        {
          scoreId: SCORE_A1,
          storagePath: "p/a1-v2.musicxml",
          fileType: "musicxml",
        },
      ],
    },
    PROJECT,
    "br-main",
    { id: USER_CM },
    membershipCM,
  );

  assert.equal(commit.parent_commit_id, "cmt-1");
  // 2 score_versions: A1 (overridden) and A2 (inherited).
  assert.equal(commit.score_versions.length, 2);
  const a1 = commit.score_versions.find((v) => v.score_id === SCORE_A1);
  const a2 = commit.score_versions.find((v) => v.score_id === SCORE_A2);
  assert.equal(a1.storage_path, "p/a1-v2.musicxml");
  assert.equal(a2.storage_path, "p/a2-v1.musicxml");
});

test("createCommit: advances branch head_commit_id", async () => {
  prepareBranchWithCommit();
  const commit = await historyService.createCommit(
    {
      message: "noop",
      scoreSnapshots: [
        { scoreId: SCORE_A1, storagePath: "p/a1-v2.musicxml", fileType: "musicxml" },
      ],
    },
    PROJECT,
    "br-main",
    { id: USER_CM },
    membershipCM,
  );
  const branches = fake.rows("branches");
  assert.equal(branches[0].head_commit_id, commit.id);
});

test("createCommit: principal cannot commit to a score outside their section", async () => {
  prepareBranchWithCommit();
  await assert.rejects(
    () =>
      historyService.createCommit(
        {
          message: "cross-section commit attempt",
          scoreSnapshots: [
            { scoreId: SCORE_B1, storagePath: "p/b1-v2.musicxml", fileType: "musicxml" },
          ],
        },
        PROJECT,
        "br-main",
        { id: USER_PRINCIPAL_A },
        membershipPrincipalA,
      ),
    (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    },
  );
});

test("createCommit: principal CAN commit to their own section", async () => {
  prepareBranchWithCommit();
  const commit = await historyService.createCommit(
    {
      message: "principal A updates A1",
      scoreSnapshots: [
        { scoreId: SCORE_A1, storagePath: "p/a1-v2.musicxml", fileType: "musicxml" },
      ],
    },
    PROJECT,
    "br-main",
    { id: USER_PRINCIPAL_A },
    membershipPrincipalA,
  );
  assert.equal(commit.author_user_id, USER_PRINCIPAL_A);
});

test("createCommit: member is rejected with 403", async () => {
  prepareBranchWithCommit();
  await assert.rejects(
    () =>
      historyService.createCommit(
        {
          message: "should fail",
          scoreSnapshots: [
            { scoreId: SCORE_A1, storagePath: "p/a1-v2.musicxml", fileType: "musicxml" },
          ],
        },
        PROJECT,
        "br-main",
        { id: USER_MEMBER },
        membershipMember,
      ),
    (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    },
  );
});

test("createCommit: empty scoreSnapshots rejected with 400", async () => {
  prepareBranchWithCommit();
  await assert.rejects(
    () =>
      historyService.createCommit(
        { message: "x", scoreSnapshots: [] },
        PROJECT,
        "br-main",
        { id: USER_CM },
        membershipCM,
      ),
    (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// compareCommits
// ---------------------------------------------------------------------------

test("compareCommits: classifies added / removed / modified / unchanged", async () => {
  const fixture = baseFixture();
  fixture.branches.push({
    id: "br-main",
    project_id: PROJECT,
    name: "main",
    head_commit_id: "cmt-2",
    is_default: true,
    created_by: USER_CM,
  });
  fixture.commits.push(
    {
      id: "cmt-1",
      project_id: PROJECT,
      branch_id: "br-main",
      parent_commit_id: null,
      merge_parent_commit_id: null,
      message: "v1",
      author_user_id: USER_CM,
    },
    {
      id: "cmt-2",
      project_id: PROJECT,
      branch_id: "br-main",
      parent_commit_id: "cmt-1",
      merge_parent_commit_id: null,
      message: "v2",
      author_user_id: USER_CM,
    },
  );
  fixture.score_versions.push(
    // cmt-1 has A1 (path v1), A2 (path v1), B1 (path v1).
    { id: "sv-a1-1", commit_id: "cmt-1", score_id: SCORE_A1, storage_bucket: "scores", storage_path: "a1-v1", file_type: "musicxml" },
    { id: "sv-a2-1", commit_id: "cmt-1", score_id: SCORE_A2, storage_bucket: "scores", storage_path: "a2-v1", file_type: "musicxml" },
    { id: "sv-b1-1", commit_id: "cmt-1", score_id: SCORE_B1, storage_bucket: "scores", storage_path: "b1-v1", file_type: "musicxml" },
    // cmt-2 modifies A1, removes A2, keeps B1, adds nothing new.
    { id: "sv-a1-2", commit_id: "cmt-2", score_id: SCORE_A1, storage_bucket: "scores", storage_path: "a1-v2", file_type: "musicxml" },
    { id: "sv-b1-2", commit_id: "cmt-2", score_id: SCORE_B1, storage_bucket: "scores", storage_path: "b1-v1", file_type: "musicxml" },
  );
  fake.reset(fixture);

  const diff = await historyService.compareCommits(PROJECT, "cmt-1", "cmt-2", membershipCM);
  assert.deepEqual(diff.added, []);
  assert.equal(diff.removed.length, 1);
  assert.equal(diff.removed[0].scoreId, SCORE_A2);
  assert.equal(diff.modified.length, 1);
  assert.equal(diff.modified[0].scoreId, SCORE_A1);
  assert.equal(diff.unchanged.length, 1);
  assert.equal(diff.unchanged[0].scoreId, SCORE_B1);
});

test("compareCommits: principal sees only own section's diff", async () => {
  const fixture = baseFixture();
  fixture.branches.push({
    id: "br-main",
    project_id: PROJECT,
    name: "main",
    head_commit_id: "cmt-2",
    is_default: true,
    created_by: USER_CM,
  });
  fixture.commits.push(
    { id: "cmt-1", project_id: PROJECT, branch_id: "br-main", parent_commit_id: null, merge_parent_commit_id: null, message: "v1", author_user_id: USER_CM },
    { id: "cmt-2", project_id: PROJECT, branch_id: "br-main", parent_commit_id: "cmt-1", merge_parent_commit_id: null, message: "v2", author_user_id: USER_CM },
  );
  fixture.score_versions.push(
    { id: "sv-a1-1", commit_id: "cmt-1", score_id: SCORE_A1, storage_bucket: "scores", storage_path: "a1-v1", file_type: "musicxml" },
    { id: "sv-b1-1", commit_id: "cmt-1", score_id: SCORE_B1, storage_bucket: "scores", storage_path: "b1-v1", file_type: "musicxml" },
    { id: "sv-a1-2", commit_id: "cmt-2", score_id: SCORE_A1, storage_bucket: "scores", storage_path: "a1-v2", file_type: "musicxml" },
    { id: "sv-b1-2", commit_id: "cmt-2", score_id: SCORE_B1, storage_bucket: "scores", storage_path: "b1-v2", file_type: "musicxml" },
  );
  fake.reset(fixture);

  const diff = await historyService.compareCommits(
    PROJECT,
    "cmt-1",
    "cmt-2",
    membershipPrincipalA,
  );
  // Principal in section A should NOT see B1 in any bucket.
  const allScoreIds = [...diff.added, ...diff.removed, ...diff.modified, ...diff.unchanged].map(
    (e) => e.scoreId,
  );
  assert.ok(allScoreIds.every((id) => id !== SCORE_B1));
  assert.ok(allScoreIds.includes(SCORE_A1));
});

// ---------------------------------------------------------------------------
// mergeBranches
// ---------------------------------------------------------------------------

test("mergeBranches: rejected for non-concertmaster", async () => {
  fake.reset(baseFixture());
  await assert.rejects(
    () =>
      historyService.mergeBranches(
        { fromBranchId: "x", intoBranchId: "y" },
        PROJECT,
        { id: USER_PRINCIPAL_A },
        membershipPrincipalA,
      ),
    (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    },
  );
});

test("mergeBranches: from-branch versions win on conflict, branch head advances", async () => {
  const fixture = baseFixture();
  fixture.branches.push(
    {
      id: "br-main",
      project_id: PROJECT,
      name: "main",
      head_commit_id: "cmt-main",
      is_default: true,
      created_by: USER_CM,
    },
    {
      id: "br-feature",
      project_id: PROJECT,
      name: "feature",
      head_commit_id: "cmt-feature",
      is_default: false,
      created_by: USER_CM,
    },
  );
  fixture.commits.push(
    { id: "cmt-main",    project_id: PROJECT, branch_id: "br-main",    parent_commit_id: null, merge_parent_commit_id: null, message: "main v1", author_user_id: USER_CM },
    { id: "cmt-feature", project_id: PROJECT, branch_id: "br-feature", parent_commit_id: null, merge_parent_commit_id: null, message: "feat v1", author_user_id: USER_CM },
  );
  fixture.score_versions.push(
    // main has A1 (path: main), A2 (path: main-only).
    { id: "sv-m-a1", commit_id: "cmt-main", score_id: SCORE_A1, storage_bucket: "scores", storage_path: "main-a1", file_type: "musicxml" },
    { id: "sv-m-a2", commit_id: "cmt-main", score_id: SCORE_A2, storage_bucket: "scores", storage_path: "main-a2", file_type: "musicxml" },
    // feature has A1 (different path: feature) and B1 (only on feature).
    { id: "sv-f-a1", commit_id: "cmt-feature", score_id: SCORE_A1, storage_bucket: "scores", storage_path: "feat-a1", file_type: "musicxml" },
    { id: "sv-f-b1", commit_id: "cmt-feature", score_id: SCORE_B1, storage_bucket: "scores", storage_path: "feat-b1", file_type: "musicxml" },
  );
  fake.reset(fixture);

  const mergeCommit = await historyService.mergeBranches(
    { fromBranchId: "br-feature", intoBranchId: "br-main", message: "merge feature into main" },
    PROJECT,
    { id: USER_CM },
    membershipCM,
  );

  // Merge commit recorded on main, with both parents set.
  assert.equal(mergeCommit.branch_id, "br-main");
  assert.equal(mergeCommit.parent_commit_id, "cmt-main");
  assert.equal(mergeCommit.merge_parent_commit_id, "cmt-feature");

  // theirs-wins: A1 should come from feature; main-only A2 retained; B1 added.
  const byScore = Object.fromEntries(
    mergeCommit.score_versions.map((v) => [v.score_id, v]),
  );
  assert.equal(byScore[SCORE_A1].storage_path, "feat-a1");
  assert.equal(byScore[SCORE_A2].storage_path, "main-a2");
  assert.equal(byScore[SCORE_B1].storage_path, "feat-b1");

  // br-main now points at the merge commit.
  const mainBranch = fake.rows("branches").find((b) => b.id === "br-main");
  assert.equal(mainBranch.head_commit_id, mergeCommit.id);
});

test("mergeBranches: refuses to merge an empty source branch", async () => {
  const fixture = baseFixture();
  fixture.branches.push(
    {
      id: "br-main",
      project_id: PROJECT,
      name: "main",
      head_commit_id: "cmt-main",
      is_default: true,
      created_by: USER_CM,
    },
    {
      id: "br-empty",
      project_id: PROJECT,
      name: "empty",
      head_commit_id: null,
      is_default: false,
      created_by: USER_CM,
    },
  );
  fixture.commits.push({
    id: "cmt-main",
    project_id: PROJECT,
    branch_id: "br-main",
    parent_commit_id: null,
    merge_parent_commit_id: null,
    message: "main v1",
    author_user_id: USER_CM,
  });
  fake.reset(fixture);

  await assert.rejects(
    () =>
      historyService.mergeBranches(
        { fromBranchId: "br-empty", intoBranchId: "br-main" },
        PROJECT,
        { id: USER_CM },
        membershipCM,
      ),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /no commits/i);
      return true;
    },
  );
});

test("mergeBranches: same source and target rejected", async () => {
  fake.reset(baseFixture());
  await assert.rejects(
    () =>
      historyService.mergeBranches(
        { fromBranchId: "br-main", intoBranchId: "br-main" },
        PROJECT,
        { id: USER_CM },
        membershipCM,
      ),
    (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// updateBranch (PATCH = "版本切換")
// ---------------------------------------------------------------------------

test("updateBranch: concertmaster can move head to an older commit", async () => {
  const fixture = baseFixture();
  fixture.branches.push({
    id: "br-main",
    project_id: PROJECT,
    name: "main",
    head_commit_id: "cmt-2",
    is_default: true,
    created_by: USER_CM,
  });
  fixture.commits.push(
    { id: "cmt-1", project_id: PROJECT, branch_id: "br-main", parent_commit_id: null, merge_parent_commit_id: null, message: "v1", author_user_id: USER_CM },
    { id: "cmt-2", project_id: PROJECT, branch_id: "br-main", parent_commit_id: "cmt-1", merge_parent_commit_id: null, message: "v2", author_user_id: USER_CM },
  );
  fake.reset(fixture);

  const updated = await historyService.updateBranch(
    { headCommitId: "cmt-1" },
    PROJECT,
    "br-main",
    membershipCM,
  );
  assert.equal(updated.head_commit_id, "cmt-1");
});

test("updateBranch: principal cannot move branch head", async () => {
  fake.reset({
    ...baseFixture(),
    branches: [
      {
        id: "br-main",
        project_id: PROJECT,
        name: "main",
        head_commit_id: null,
        is_default: true,
        created_by: USER_CM,
      },
    ],
  });
  await assert.rejects(
    () =>
      historyService.updateBranch(
        { headCommitId: null },
        PROJECT,
        "br-main",
        membershipPrincipalA,
      ),
    (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// deleteBranch
// ---------------------------------------------------------------------------

test("deleteBranch: cannot delete the default branch", async () => {
  fake.reset({
    ...baseFixture(),
    branches: [
      {
        id: "br-main",
        project_id: PROJECT,
        name: "main",
        head_commit_id: null,
        is_default: true,
        created_by: USER_CM,
      },
    ],
  });
  await assert.rejects(
    () => historyService.deleteBranch(PROJECT, "br-main", membershipCM),
    (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    },
  );
});

test("deleteBranch: concertmaster can delete a non-default branch", async () => {
  fake.reset({
    ...baseFixture(),
    branches: [
      {
        id: "br-main",
        project_id: PROJECT,
        name: "main",
        head_commit_id: null,
        is_default: true,
        created_by: USER_CM,
      },
      {
        id: "br-feature",
        project_id: PROJECT,
        name: "feature",
        head_commit_id: null,
        is_default: false,
        created_by: USER_CM,
      },
    ],
  });
  const result = await historyService.deleteBranch(PROJECT, "br-feature", membershipCM);
  assert.equal(result.id, "br-feature");
  const remaining = fake.rows("branches").map((b) => b.id);
  assert.deepEqual(remaining, ["br-main"]);
});
