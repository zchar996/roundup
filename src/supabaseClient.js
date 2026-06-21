import { createClient } from "@supabase/supabase-js";

// Set these in a .env file (see .env.example) before deploying.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ---------- Group data access ----------
// Table: groups
//   code        text primary key
//   name        text
//   friends     jsonb   (array of strings)
//   availability jsonb  (object: { "2026-07-18": ["Jamie","Marcus"] })
//   updated_at  timestamptz default now()

export async function fetchGroup(code) {
  const { data, error } = await supabase
    .from("groups")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    name: data.name,
    friends: data.friends || [],
    availability: data.availability || {},
  };
}

export async function createGroupRow(code, groupData) {
  const { error } = await supabase.from("groups").insert({
    code,
    name: groupData.name,
    friends: groupData.friends,
    availability: groupData.availability,
  });
  if (error) throw error;
}

export async function updateGroupRow(code, groupData) {
  const { error } = await supabase
    .from("groups")
    .update({
      name: groupData.name,
      friends: groupData.friends,
      availability: groupData.availability,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);
  if (error) throw error;
}

export function subscribeToGroup(code, onChange) {
  const channel = supabase
    .channel(`group-${code}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "groups", filter: `code=eq.${code}` },
      (payload) => {
        const row = payload.new;
        onChange({
          name: row.name,
          friends: row.friends || [],
          availability: row.availability || {},
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
