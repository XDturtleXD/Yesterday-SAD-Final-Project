// Fixtures + small builders shared across HTTP integration / E2E tests.
//
// `testEnv` must already have been required so that JWT_SECRET is set before
// we sign tokens.
require("./testEnv");

const { signAccessToken } = require("../../src/utils/jwt");

// bcrypt hash of the literal string "password123" produced with cost 10.
// Reused from supabase/seed.sql so the bcrypt.compare() in authService.login
// succeeds without us paying bcrypt.hash() at test time.
const BCRYPT_PASSWORD123 =
  "$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22";

const SECTIONS = [
  {
    id: "11111111-1111-1111-1111-111111111101",
    code: "first_violin",
    name: "小提琴第一部",
    sort_order: 1,
  },
  {
    id: "11111111-1111-1111-1111-111111111102",
    code: "second_violin",
    name: "小提琴第二部",
    sort_order: 2,
  },
  {
    id: "11111111-1111-1111-1111-111111111103",
    code: "viola",
    name: "中提琴",
    sort_order: 3,
  },
  {
    id: "11111111-1111-1111-1111-111111111104",
    code: "cello",
    name: "大提琴",
    sort_order: 4,
  },
  {
    id: "11111111-1111-1111-1111-111111111105",
    code: "double_bass",
    name: "低音提琴",
    sort_order: 5,
  },
];

const SECTION_FIRST_VIOLIN = SECTIONS[0].id;
const SECTION_SECOND_VIOLIN = SECTIONS[1].id;
const SECTION_VIOLA = SECTIONS[2].id;
const SECTION_CELLO = SECTIONS[3].id;
const SECTION_DOUBLE_BASS = SECTIONS[4].id;

const seedSections = (fake) => {
  fake.seedRows("sections", SECTIONS);
};

let userCounter = 0;
const nextUserId = () => {
  userCounter += 1;
  return `00000000-0000-0000-0000-${String(userCounter).padStart(12, "0")}`;
};

// Seed a user row directly (skips POST /auth/register), and return both the
// row and a JWT signed for that user. Use this when the test is about
// something OTHER than the auth path itself.
const seedUserWithToken = (
  fake,
  {
    id,
    email,
    name = "Test User",
    systemRole = "user",
    googleSub = null,
    avatarUrl = null,
  } = {},
) => {
  const userId = id || nextUserId();
  const row = {
    id: userId,
    email: email || `user-${userId}@example.test`,
    name,
    password_hash: BCRYPT_PASSWORD123,
    google_sub: googleSub,
    system_role: systemRole,
    avatar_url: avatarUrl,
    intro: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  fake.seedRows("users", [row]);
  const token = signAccessToken({ sub: userId, role: systemRole });
  return { user: row, token };
};

module.exports = {
  BCRYPT_PASSWORD123,
  SECTIONS,
  SECTION_FIRST_VIOLIN,
  SECTION_SECOND_VIOLIN,
  SECTION_VIOLA,
  SECTION_CELLO,
  SECTION_DOUBLE_BASS,
  seedSections,
  seedUserWithToken,
  nextUserId,
};
