const supabase = require("../config/supabase");
const AppError = require("../utils/appError");
const { signInviteToken, verifyInviteToken } = require("../utils/inviteToken");

const PROJECT_COLUMNS = "id, name, description, created_by, created_at, updated_at";

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

const createProjectInviteCode = async (projectId, requestUser) => {
  ensureSupabaseReady();

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

  if (!isPlatformAdmin(requestUser)) {
    const membership = await checkProjectMembership(projectId, requestUser.id);
    if (!membership) {
      throw new AppError("Forbidden: you are not a member of this project", 403);
    }

    const allowedRoles = ["concertmaster", "principal"];
    if (!allowedRoles.includes(membership.role)) {
      throw new AppError("Forbidden: only concertmaster or principal can create invite code", 403);
    }
  }

  const inviteCode = signInviteToken({
    type: "project_invite",
    projectId,
    createdBy: requestUser.id,
  });

  return {
    inviteCode,
  };
};

const joinProjectByInviteCode = async ({ inviteCode, sectionId }, requestUser) => {
  ensureSupabaseReady();

  if (!inviteCode || typeof inviteCode !== "string") {
    throw new AppError("inviteCode is required", 400);
  }
  if (!sectionId) {
    throw new AppError("sectionId is required", 400);
  }

  const payload = verifyInviteToken(inviteCode);
  if (!payload || payload.type !== "project_invite" || !payload.projectId) {
    throw new AppError("Invalid invite code", 400);
  }

  const { data: section, error: sectionError } = await supabase
    .from("sections")
    .select("id")
    .eq("id", sectionId)
    .maybeSingle();

  if (sectionError) {
    throw new AppError("Failed to validate sectionId", 500, sectionError);
  }
  if (!section) {
    throw new AppError("Invalid sectionId: section does not exist", 400);
  }

  const projectId = payload.projectId;
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
      section_id: sectionId,
      role: "member",
    })
    .select("id, project_id, user_id, section_id, role, created_at, updated_at")
    .single();

  if (insertError) {
    throw new AppError("Failed to join project", 500, insertError);
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

  return data || [];
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
