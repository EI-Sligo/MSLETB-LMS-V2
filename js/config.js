const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

export const state = {
    user: null, profile: null,
    courses: [], activeCourse: null, activeSection: null, activeModule: null,
    structure: [] 
};
