const supabase = require("../config/supabase");
const AppError = require("../utils/appError");
const { signInviteToken, verifyInviteToken } = require("../utils/inviteToken");
const crypto = require("node:crypto");

const PROJECT_COLUMNS = "id, name, description, created_by, created_at, updated_at";
const INVITE_COLUMNS =
  "id, project_id, target_section_id, target_role, token_id, created_by, expires_at, used_by, used_at, revoked_at, created_at, updated_at";
const VALID_INVITE_ROLES = ["principal", "member"];
const DEFAULT_INVITE_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000;

const isPlatformAdmin = (user) => {
  return user && (user.system_role === "platform_admin" || user.role === "platform_admin");
};

const ensureSupabaseReady = () => {
  if (!supabase) {
    throw new AppError("Supabase is not configured", 500);
  }
};

const checkProjectMembership = async (projectId, userId) => {
  ensureSupabaseReady();

  const { data: membership, error } = await supabase
    .from("project_members")
    .select("id, role, section_id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new AppError("Failed to validate project access", 500, error);
  }

  return membership;
};

const createProject = async ({ name, description, sectionId }, userId) => {
  ensureSupabaseReady();

  const normalizedName = String(name || "").trim();
  const normalizedDescription = description == null ? null : String(description).trim();

  if (!normalizedName) {
    throw new AppError("name is required", 400);
  }
  if (!sectionId) {
    throw new AppError("sectionId is required", 400);
  }

  const { data: existingSection, error: sectionError } = await supabase
    .from("sections")
    .select("id")
    .eq("id", sectionId)
    .maybeSingle();

  if (sectionError) {
    throw new AppError("Failed to validate sectionId", 500, sectionError);
  }

  if (!existingSection) {
    throw new AppError("Invalid sectionId: section does not exist", 400);
  }

  const { data: createdProject, error: projectInsertError } = await supabase
    .from("projects")
    .insert({
      name: normalizedName,
      description: normalizedDescription,
      created_by: userId,
    })
    .select(PROJECT_COLUMNS)
    .single();

  if (projectInsertError) {
    throw new AppError("Failed to create project", 500, projectInsertError);
  }

  const { error: memberInsertError } = await supabase.from("project_members").insert({
    project_id: createdProject.id,
    user_id: userId,
    section_id: sectionId,
    role: "concertmaster",
  });

  if (memberInsertError) {
    // Best-effort cleanup if member creation fails to keep data consistent.
    await supabase.from("projects").delete().eq("id", createdProject.id);

    if (
      memberInsertError.code === "23503" &&
      String(memberInsertError.message || "").includes("section_id")
    ) {
      throw new AppError("Invalid sectionId: section does not exist", 400, memberInsertError);
    }

    throw new AppError("Failed to create project creator membership", 500, memberInsertError);
  }

  return createdProject;
};

const listUserProjects = async (requestUser) => {
  ensureSupabaseReady();

  if (isPlatformAdmin(requestUser)) {
    const { data: projects, error: projectError } = await supabase
      .from("projects")
      .select(PROJECT_COLUMNS)
      .order("created_at", { ascending: false });

    if (projectError) {
      throw new AppError("Failed to fetch projects", 500, projectError);
    }

    return projects || [];
  }

  const { data: memberships, error: memberError } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("user_id", requestUser.id);

  if (memberError) {
    throw new AppError("Failed to fetch user projects", 500, memberError);
  }

  if (!memberships || memberships.length === 0) {
    return [];
  }

  const projectIds = memberships.map((membership) => membership.project_id);

  const { data: projects, error: projectError } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .in("id", projectIds)
    .order("created_at", { ascending: false });

  if (projectError) {
    throw new AppError("Failed to fetch user projects", 500, projectError);
  }

  return projects || [];
};

const getProjectByIdForMember = async (projectId, requestUser) => {
  ensureSupabaseReady();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw new AppError("Failed to fetch project", 500, projectError);
  }

  if (!project) {
    throw new AppError("Project not found", 404);
  }

  if (!isPlatformAdmin(requestUser)) {
    const membership = await checkProjectMembership(projectId, requestUser.id);
    if (!membership) {
      throw new AppError("Forbidden: you are not a member of this project", 403);
    }
  }

  return project;
};

const normalizeInvitePayload = (body = {}) => {
  const targetRole = body.targetRole;
  const sectionId = body.sectionId;

  if (!VALID_INVITE_ROLES.includes(targetRole)) {
    throw new AppError("targetRole must be one of principal, member", 400);
  }
  if (!sectionId || typeof sectionId !== "string") {
    throw new AppError("sectionId is required", 400);
  }

  return { targetRole, sectionId };
};

const assertInviteCreatorCanTarget = (membership, { targetRole, sectionId }) => {
  if (!membership) {
    throw new AppError("Forbidden: you are not a member of this project", 403);
  }

  if (membership.role === "concertmaster" || membership.role === "platform_admin") {
    return;
  }

  if (membership.role === "principal") {
    if (targetRole !== "member") {
      throw new AppError("Forbidden: principals can only invite members", 403);
    }
    if (membership.section_id !== sectionId) {
      throw new AppError("Forbidden: principals can only invite their own section", 403);
    }
    return;
  }

  throw new AppError("Forbidden: only concertmaster or principal can create invite code", 403);
};

const createProjectInviteCode = async (projectId, requestUser, body = {}) => {
  ensureSupabaseReady();
  const inviteTarget = normalizeInvitePayload(body);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw new AppError("Failed to fetch project", 500, projectError);
  }
  if (!project) {
    throw new AppError("Project not found", 404);
  }

  const { data: section, error: sectionError } = await supabase
    .from("sections")
    .select("id")
    .eq("id", inviteTarget.sectionId)
    .maybeSingle();

  if (sectionError) {
    throw new AppError("Failed to validate sectionId", 500, sectionError);
  }
  if (!section) {
    throw new AppError("Invalid sectionId: section does not exist", 400);
  }

  const membership = isPlatformAdmin(requestUser)
    ? { role: "platform_admin", section_id: null }
    : await checkProjectMembership(projectId, requestUser.id);
  assertInviteCreatorCanTarget(membership, inviteTarget);

  const tokenId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + DEFAULT_INVITE_EXPIRES_MS).toISOString();
  const inviteCode = signInviteToken({
    type: "project_invite",
    projectId,
    tokenId,
    createdBy: requestUser.id,
  });

  const { data: invite, error: insertError } = await supabase
    .from("project_invites")
    .insert({
      project_id: projectId,
      target_section_id: inviteTarget.sectionId,
      target_role: inviteTarget.targetRole,
      token_id: tokenId,
      created_by: requestUser.id,
      expires_at: expiresAt,
    })
    .select(INVITE_COLUMNS)
    .single();

  if (insertError) {
    throw new AppError("Failed to create invite code", 500, insertError);
  }

  return {
    inviteCode,
    targetRole: invite.target_role,
    sectionId: invite.target_section_id,
    expiresAt: invite.expires_at,
  };
};

const joinProjectByInviteCode = async ({ inviteCode }, requestUser) => {
  ensureSupabaseReady();

  if (!inviteCode || typeof inviteCode !== "string") {
    throw new AppError("inviteCode is required", 400);
  }

  const payload = verifyInviteToken(inviteCode);
  if (!payload || payload.type !== "project_invite" || !payload.projectId || !payload.tokenId) {
    throw new AppError("Invalid invite code", 400);
  }

  const { data: invite, error: inviteError } = await supabase
    .from("project_invites")
    .select(INVITE_COLUMNS)
    .eq("token_id", payload.tokenId)
    .maybeSingle();

  if (inviteError) {
    throw new AppError("Failed to validate invite code", 500, inviteError);
  }
  if (!invite || invite.project_id !== payload.projectId) {
    throw new AppError("Invalid invite code", 400);
  }
  if (invite.used_at) {
    throw new AppError("Invite code has already been used", 409);
  }
  if (invite.revoked_at) {
    throw new AppError("Invite code has been revoked", 410);
  }
  if (Date.parse(invite.expires_at) <= Date.now()) {
    throw new AppError("Invite code has expired", 410);
  }

  const projectId = invite.project_id;
  const { data: existingMember, error: existingMemberError } = await supabase
    .from("project_members")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", requestUser.id)
    .maybeSingle();

  if (existingMemberError) {
    throw new AppError("Failed to validate project membership", 500, existingMemberError);
  }
  if (existingMember) {
    throw new AppError("You are already a member of this project", 409);
  }

  const { data: createdMember, error: insertError } = await supabase
    .from("project_members")
    .insert({
      project_id: projectId,
      user_id: requestUser.id,
      section_id: invite.target_section_id,
      role: invite.target_role,
    })
    .select("id, project_id, user_id, section_id, role, created_at, updated_at")
    .single();

  if (insertError) {
    throw new AppError("Failed to join project", 500, insertError);
  }

  const { error: updateInviteError } = await supabase
    .from("project_invites")
    .update({
      used_by: requestUser.id,
      used_at: new Date().toISOString(),
    })
    .eq("id", invite.id);

  if (updateInviteError) {
    throw new AppError("Failed to mark invite code as used", 500, updateInviteError);
  }

  return createdMember;
};

const listProjectMembers = async (projectId, requestUser) => {
  ensureSupabaseReady();

  await getProjectByIdForMember(projectId, requestUser);

  const { data, error } = await supabase
    .from("project_member_details")
    .select(
      "project_member_id, project_id, user_id, user_name, user_email, section_id, section_code, section_name, role, created_at, updated_at",
    )
    .eq("project_id", projectId)
    .order("section_code", { ascending: true })
    .order("role", { ascending: true });

  if (error) {
    throw new AppError("Failed to fetch project members", 500, error);
  }

  const members = data || [];
  const userIds = [...new Set(members.map((member) => member.user_id).filter(Boolean))];
  if (userIds.length === 0) {
    return members;
  }

  const { data: users, error: avatarError } = await supabase
    .from("users")
    .select("id, avatar_url")
    .in("id", userIds);

  if (avatarError) {
    throw new AppError("Failed to fetch member avatars", 500, avatarError);
  }

  const avatarByUserId = new Map((users || []).map((user) => [user.id, user.avatar_url]));
  return members.map((member) => ({
    ...member,
    user_avatar_url: avatarByUserId.get(member.user_id) || null,
  }));
};

module.exports = {
  createProject,
  listUserProjects,
  getProjectByIdForMember,
  listProjectMembers,
  checkProjectMembership,
  isPlatformAdmin,
  createProjectInviteCode,
  joinProjectByInviteCode,
};
