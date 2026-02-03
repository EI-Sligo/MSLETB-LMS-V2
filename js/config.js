const SUPABASE_URL = 'https://hixtfftzccagwrulciwo.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpeHRmZnR6Y2NhZ3dydWxjaXdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MTMzNzEsImV4cCI6MjA4NDE4OTM3MX0.laAWQnCrRmS4S8cbrcYG1440OFFJaRr1aLY0Qv_2klA';
//const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
//const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

export const state = {
    user: null, profile: null,
    courses: [], activeCourse: null, activeSection: null, activeModule: null,
    structure: [] 
};