const { createClient } = require("@supabase/supabase-js");
const env = require("./env");

let supabase = null;

if (env.supabaseUrl && env.supabaseAnonKey) {
  supabase = createClient(env.supabaseUrl, env.supabaseAnonKey);
}

module.exports = supabase;
