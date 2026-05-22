const supabase = require("../config/supabase");
const AppError = require("../utils/appError");

const SECTION_COLUMNS = "id, code, name, sort_order, created_at";

const ensureSupabaseReady = () => {
  if (!supabase) {
    throw new AppError("Supabase is not configured", 500);
  }
};

const listSections = async () => {
  ensureSupabaseReady();

  const { data, error } = await supabase
    .from("sections")
    .select(SECTION_COLUMNS)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new AppError("Failed to fetch sections", 500, error);
  }

  return data || [];
};

module.exports = {
  listSections,
};
