const bcrypt = require("bcrypt");
const { OAuth2Client } = require("google-auth-library");
const supabase = require("../config/supabase");
const env = require("../config/env");
const AppError = require("../utils/appError");
const { signAccessToken } = require("../utils/jwt");

const USER_BASE_COLUMNS =
  "id, email, name, system_role, created_at, google_sub";
const USER_PROFILE_COLUMNS = "avatar_url, intro";
const USER_COLUMNS = `${USER_BASE_COLUMNS}, ${USER_PROFILE_COLUMNS}`;
const USER_COLUMNS_WITH_PASSWORD = `${USER_COLUMNS}, password_hash`;

const isMissingColumnError = (error) => {
  const message = String(error?.message || "");
  return error?.code === "42703" || message.includes("does not exist");
};

const selectUserColumns = async (buildQuery, { withPassword = false } = {}) => {
  const fullColumns = withPassword ? USER_COLUMNS_WITH_PASSWORD : USER_COLUMNS;
  const result = await buildQuery(fullColumns);
  if (!result.error || !isMissingColumnError(result.error)) {
    return result;
  }

  const baseColumns = withPassword
    ? `${USER_BASE_COLUMNS}, password_hash`
    : USER_BASE_COLUMNS;
  return buildQuery(baseColumns);
};

const googleClient = new OAuth2Client();

const ensureSupabaseReady = () => {
  if (!supabase) {
    throw new AppError("Supabase is not configured", 500);
  }
};

const sanitizeUser = (user) => {
  if (!user) {
    return null;
  }

  const { password_hash, ...safeUser } = user;
  if (!safeUser.role) {
    safeUser.role = safeUser.system_role || "user";
  }
  return safeUser;
};

const getUserRole = (user) => {
  return user.system_role || user.role || "user";
};

const register = async ({ email, password, name }) => {
  ensureSupabaseReady();

  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedName = String(name || "").trim();

  if (!normalizedEmail || !password || !normalizedName) {
    throw new AppError("email, password, and name are required", 400);
  }

  const { data: existingUser, error: checkError } = await supabase
    .from("users")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (checkError) {
    throw new AppError("Failed to validate existing user", 500, checkError);
  }

  if (existingUser) {
    throw new AppError("Email already registered", 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const { data: createdUser, error: insertError } = await selectUserColumns((columns) =>
    supabase
      .from("users")
      .insert({
        email: normalizedEmail,
        password_hash: passwordHash,
        name: normalizedName,
        system_role: "user",
      })
      .select(columns)
      .single(),
  );

  if (insertError) {
    throw new AppError("Failed to register user", 500, insertError);
  }

  return createdUser;
};

const login = async ({ email, password }) => {
  ensureSupabaseReady();

  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !password) {
    throw new AppError("email and password are required", 400);
  }

  const { data: user, error: fetchError } = await selectUserColumns(
    (columns) =>
      supabase.from("users").select(columns).eq("email", normalizedEmail).maybeSingle(),
    { withPassword: true },
  );

  if (fetchError) {
    throw new AppError("Failed to fetch user", 500, fetchError);
  }

  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    throw new AppError("Invalid email or password", 401);
  }

  const token = signAccessToken({ sub: user.id, role: getUserRole(user) });

  return {
    token,
    user: sanitizeUser(user),
  };
};

const findUserById = async (userId) => {
  ensureSupabaseReady();

  const { data: user, error } = await selectUserColumns((columns) =>
    supabase.from("users").select(columns).eq("id", userId).maybeSingle(),
  );

  if (error) {
    throw new AppError("Failed to fetch current user", 500, error);
  }

  return sanitizeUser(user);
};

const MAX_INTRO_LENGTH = 1000;
const MAX_AVATAR_URL_LENGTH = 500_000;

const normalizeAvatarUrl = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const url = String(value).trim();
  if (!url) {
    return null;
  }

  if (url.length > MAX_AVATAR_URL_LENGTH) {
    throw new AppError("avatar_url is too large", 400);
  }

  if (url.startsWith("data:image/")) {
    if (!/^data:image\/(jpeg|jpg|png|webp|gif);base64,/.test(url)) {
      throw new AppError("avatar_url must be a JPEG, PNG, WebP, or GIF image", 400);
    }
    return url;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  throw new AppError("avatar_url must be an http(s) URL or uploaded image", 400);
};

const updateProfile = async (userId, { name, intro, avatar_url: avatarUrl }) => {
  ensureSupabaseReady();

  const updates = {};

  if (name !== undefined) {
    const normalizedName = String(name).trim();
    if (!normalizedName) {
      throw new AppError("name cannot be empty", 400);
    }
    updates.name = normalizedName;
  }

  if (intro !== undefined) {
    updates.intro = String(intro).trim().slice(0, MAX_INTRO_LENGTH) || null;
  }

  if (avatarUrl !== undefined) {
    updates.avatar_url = normalizeAvatarUrl(avatarUrl);
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError("At least one profile field is required", 400);
  }

  const { data: updatedUser, error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", userId)
    .select(USER_COLUMNS)
    .single();

  if (error) {
    if (isMissingColumnError(error)) {
      throw new AppError(
        "Profile fields are not available yet. Run supabase/migrations/20260521_add_user_profile_fields.sql",
        500,
      );
    }
    throw new AppError("Failed to update profile", 500, error);
  }

  return sanitizeUser(updatedUser);
};

const googleLogin = async ({ idToken }) => {
  ensureSupabaseReady();

  if (!env.googleClientId) {
    throw new AppError("GOOGLE_CLIENT_ID is not configured", 500);
  }

  if (!idToken || typeof idToken !== "string") {
    throw new AppError("idToken is required", 400);
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.googleClientId,
    });
    payload = ticket.getPayload();
  } catch (error) {
    throw new AppError("Invalid Google token", 401);
  }

  if (!payload || !payload.sub || !payload.email) {
    throw new AppError("Google token payload is incomplete", 401);
  }

  const googleSub = payload.sub;
  const email = String(payload.email).trim().toLowerCase();
  const name = payload.name ? String(payload.name).trim() : email.split("@")[0];

  const { data: existingByGoogleSub, error: byGoogleSubError } = await selectUserColumns(
    (columns) => supabase.from("users").select(columns).eq("google_sub", googleSub).maybeSingle(),
  );

  if (byGoogleSubError) {
    if (String(byGoogleSubError.message || "").includes("google_sub")) {
      throw new AppError(
        "Database is missing users.google_sub. Please run SQL migration for Google auth.",
        500
      );
    }
    throw new AppError("Failed to fetch user by Google account", 500, byGoogleSubError);
  }

  let user = existingByGoogleSub;

  if (!user) {
    const { data: existingByEmail, error: byEmailError } = await selectUserColumns((columns) =>
      supabase.from("users").select(columns).eq("email", email).maybeSingle(),
    );

    if (byEmailError) {
      throw new AppError("Failed to fetch user by email", 500, byEmailError);
    }

    if (existingByEmail) {
      const { data: linkedUser, error: linkError } = await selectUserColumns((columns) =>
        supabase
          .from("users")
          .update({
            google_sub: googleSub,
          })
          .eq("id", existingByEmail.id)
          .select(columns)
          .single(),
      );

      if (linkError) {
        throw new AppError("Failed to link Google account", 500, linkError);
      }

      user = linkedUser;
    } else {
      const generatedPasswordHash = await bcrypt.hash(`${googleSub}:${email}`, 10);

      const { data: createdUser, error: createError } = await selectUserColumns((columns) =>
        supabase
          .from("users")
          .insert({
            email,
            password_hash: generatedPasswordHash,
            name,
            system_role: "user",
            google_sub: googleSub,
          })
          .select(columns)
          .single(),
      );

      if (createError) {
        throw new AppError("Failed to create user from Google login", 500, createError);
      }

      user = createdUser;
    }
  }

  const token = signAccessToken({ sub: user.id, role: getUserRole(user) });
  return {
    token,
    user: sanitizeUser(user),
  };
};

module.exports = {
  register,
  login,
  findUserById,
  googleLogin,
  updateProfile,
};
