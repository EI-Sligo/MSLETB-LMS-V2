import { sb, state } from './config.js';
import { app, ui } from './ui.js';
import { isAdmin } from './utils.js';

export const auth = {
    init: async () => {
        const { data: { session } } = await sb.auth.getSession();
        sb.auth.onAuthStateChange((e) => { if (e === 'SIGNED_OUT') window.location.reload(); });
        if (session) { state.user = session.user; await auth.loadProfile(); app.showApp(); } 
        else { app.showLogin(); }
    },
    signIn: async (email, password) => {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) ui.toast(error.message, 'error');
        else { state.user = data.user; await auth.loadProfile(); app.showApp(); }
    },
    loadProfile: async () => {
        let { data } = await sb.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
        if (!data) { const { data: n } = await sb.from('profiles').insert([{ id: state.user.id, email: state.user.email, global_role: 'student' }]).select().single(); data = n; }
        state.profile = data;
        document.getElementById('user-name').innerText = state.user.email;
        document.getElementById('user-role').innerText = data.global_role.replace('_', ' ').toUpperCase();
        
        const isStaff = isAdmin();
        ['btn-add-section', 'btn-add-unit', 'tab-btn-schedule'].forEach(id => {
            const el = document.getElementById(id); if(el) el.classList.toggle('hidden', !isStaff);
        });
        document.getElementById('btn-new-course')?.classList.toggle('hidden', data.global_role !== 'super_admin');
        document.getElementById('tab-btn-reports').classList.remove('hidden');
    },
    signOut: async () => { await sb.auth.signOut(); }
};

export const authUI = {
    mode: 'login', 
    toggleMode: (mode) => {
        authUI.mode = mode;
        const btn = document.getElementById('btn-auth-submit');
        const h1 = document.querySelector('#login-view h1');
        
        if (mode === 'signup') {
            document.getElementById('msg-login').classList.add('hidden');
            document.getElementById('msg-signup').classList.remove('hidden');
            if(h1) h1.innerText = "Activate Account";
            btn.innerHTML = `<span>Activate & Login</span> <i class="ph ph-rocket-launch"></i>`;
            btn.classList.replace('bg-teal-600', 'bg-purple-600');
            btn.classList.replace('hover:bg-teal-700', 'hover:bg-purple-700');
        } else {
            document.getElementById('msg-login').classList.remove('hidden');
            document.getElementById('msg-signup').classList.add('hidden');
            if(h1) h1.innerText = "MSLETB Hub";
            btn.innerHTML = `<span>Sign In</span> <i class="ph ph-sign-in"></i>`;
            btn.classList.replace('bg-purple-600', 'bg-teal-600');
            btn.classList.replace('hover:bg-purple-700', 'hover:bg-teal-700');
        }
    }
};