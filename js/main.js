import { sb, state } from './config.js';
import { auth, authUI } from './auth.js';
import { app, ui } from './ui.js';
import { dashboard } from './dashboard.js';
import { courseManager } from './courseManager.js';
import { schedulerManager } from './scheduler.js';
import { entityModal, contentModal, assignmentManager, quizManager } from './modals.js';

// EXPOSE TO WINDOW (Critical for HTML onclicks)
window.sb = sb; // Optional
window.state = state; // Optional
window.auth = auth;
window.authUI = authUI;
window.app = app;
window.ui = ui;
window.dashboard = dashboard;
window.courseManager = courseManager;
window.entityModal = entityModal;
window.contentModal = contentModal;
window.assignmentManager = assignmentManager;
window.quizManager = quizManager;
window.schedulerManager = schedulerManager;

// DOM LISTENERS
document.addEventListener('DOMContentLoaded', () => {
    // Login Form Logic
    const authForm = document.getElementById('auth-form');
    if (authForm) {
        authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const pass = document.getElementById('password').value;
            
            if (window.authUI && window.authUI.mode === 'login') {
                window.auth.signIn(email, pass);
            } else {
                ui.toast("Activating...", "info");
                sb.auth.signUp({ email, password: pass }).then(({ error }) => {
                    ui.toast(error ? error.message : "Activated!", error ? "error" : "success");
                    if (!error) setTimeout(() => window.location.reload(), 1500);
                });
            }
        });
    }

    // Add Section Button
    const btnAddSec = document.getElementById('btn-add-section');
    if (btnAddSec) {
        btnAddSec.addEventListener('click', () => {
            if (window.entityModal) window.entityModal.open('section');
        });
    }

    // Start App
    if(window.auth) window.auth.init();
});