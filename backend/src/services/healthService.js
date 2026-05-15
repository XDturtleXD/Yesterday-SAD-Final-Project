const supabase = require("../config/supabase");

const getHealthStatus = async () => {
  return {
    api: "ok",
    timestamp: new Date().toISOString(),
    supabase: supabase ? "configured" : "not_configured",
  };
};

module.exports = {
  getHealthStatus,
};
