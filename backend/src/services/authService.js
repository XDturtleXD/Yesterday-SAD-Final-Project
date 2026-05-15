const bcrypt = require("bcrypt");
const { OAuth2Client } = require("google-auth-library");
const supabase = require("../config/supabase");
const env = require("../config/env");
const AppError = require("../utils/appError");
const { signAccessToken } = require("../utils/jwt");

const USER_COLUMNS = "id, email, name, system_role, created_at, google_sub";
const USER_COLUMNS_WITH_PASSWORD =
  "id, email, name, system_role, created_at, password_hash, google_sub";
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

  const { data: createdUser, error: insertError } = await supabase
    .from("users")
    .insert({
      email: normalizedEmail,
      password_hash: passwordHash,
      name: normalizedName,
      system_role: "user",
    })
    .select(USER_COLUMNS)
    .single();

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

  const { data: user, error: fetchError } = await supabase
    .from("users")
    .select(USER_COLUMNS_WITH_PASSWORD)
    .eq("email", normalizedEmail)
    .maybeSingle();

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

  const { data: user, error } = await supabase
    .from("users")
    .select(USER_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new AppError("Failed to fetch current user", 500, error);
  }

  return user;
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

  const { data: existingByGoogleSub, error: byGoogleSubError } = await supabase
    .from("users")
    .select(USER_COLUMNS)
    .eq("google_sub", googleSub)
    .maybeSingle();

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
    const { data: existingByEmail, error: byEmailError } = await supabase
      .from("users")
      .select(USER_COLUMNS)
      .eq("email", email)
      .maybeSingle();

    if (byEmailError) {
      throw new AppError("Failed to fetch user by email", 500, byEmailError);
    }

    if (existingByEmail) {
      const { data: linkedUser, error: linkError } = await supabase
        .from("users")
        .update({
          google_sub: googleSub,
        })
        .eq("id", existingByEmail.id)
        .select(USER_COLUMNS)
        .single();

      if (linkError) {
        throw new AppError("Failed to link Google account", 500, linkError);
      }

      user = linkedUser;
    } else {
      const generatedPasswordHash = await bcrypt.hash(`${googleSub}:${email}`, 10);

      const { data: createdUser, error: createError } = await supabase
        .from("users")
        .insert({
          email,
          password_hash: generatedPasswordHash,
          name,
          system_role: "user",
          google_sub: googleSub,
        })
        .select(USER_COLUMNS)
        .single();

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
};
