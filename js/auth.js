import { sb, state } from './config.js';
import { app, ui } from './ui.js';
import { isAdmin } from './utils.js';

export const auth = {
    init: async () => {
        // 1. CHECK FOR RESET LINK ERRORS (Fixes "otp_expired" confusion)
        if (window.location.hash && window.location.hash.includes('error=')) {
            const params = new URLSearchParams(window.location.hash.substring(1));
            const errorDesc = params.get('error_description');
            if (errorDesc) {
                ui.toast(errorDesc.replace(/\+/g, ' '), 'error');
                // Clean the URL so the error doesn't persist
                window.history.replaceState(null, '', window.location.pathname);
            }
        }

        // 2. LISTEN FOR PASSWORD RECOVERY EVENT
        sb.auth.onAuthStateChange(async (event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                // This runs only when the user clicks the valid email link
                const newPass = prompt("Enter your new password:");
                if (newPass) {
                    const { error } = await sb.auth.updateUser({ password: newPass });
                    if (error) {
                        ui.toast(error.message, 'error');
                    } else {
                        alert("Password updated successfully!");
                        window.location.href = "/"; // Clear recovery hash
                    }
                }
            } else if (event === 'SIGNED_OUT') {
                app.showLogin();
            } else if (event === 'SIGNED_IN' && session) {
                state.user = session.user;
                await auth.loadProfile();
                app.showApp();
            }
        });

        // 3. CHECK EXISTING SESSION
        const { data: { session } } = await sb.auth.getSession();
        if (session) { 
            state.user = session.user; 
            await auth.loadProfile(); 
            app.showApp(); 
        } else { 
            app.showLogin(); 
        }
    },
    
    signIn: async (email, password) => {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) ui.toast(error.message, 'error');
        // onAuthStateChange handles success
    },

    // --- RESTORED FUNCTION ---
    resetPassword: async () => {
        let email = document.getElementById('email')?.value;
        if (!email) {
            email = prompt("Please enter your email address to reset your password:");
        }
        
        if (!email) return;

        ui.toast("Sending reset email...", "info");
        
        const { error } = await sb.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.href 
        });

        if (error) ui.toast(error.message, 'error');
        else ui.toast("Password reset email sent! Check your inbox.", "success");
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
