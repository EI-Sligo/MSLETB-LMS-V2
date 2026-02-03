import { courseManager } from './courseManager.js';
import { schedulerManager } from './scheduler.js';
import { dashboard } from './dashboard.js';

export const app = {
    showLogin: () => { document.getElementById('login-view').classList.remove('hidden'); document.getElementById('app-view').classList.add('hidden'); },
    showApp: () => { document.getElementById('login-view').classList.add('hidden'); document.getElementById('app-view').classList.remove('hidden'); dashboard.loadCourses(); },
    goHome: () => { document.getElementById('dashboard-content').classList.remove('hidden'); document.getElementById('course-content').classList.add('hidden'); dashboard.loadCourses(); }
};

export const ui = {
    toast: (msg, type = 'info') => {
        let bg = type === 'error' ? "#ef4444" : (type === 'success' ? "#10b981" : "#3b82f6");
        if(typeof Toastify !== 'undefined') Toastify({ text: msg, duration: 3000, style: { background: bg, borderRadius: "8px" } }).showToast();
        else alert(msg);
    },
    switchTab: (t) => {
        ['content', 'team', 'reports', 'schedule'].forEach(x => {
            document.getElementById(`tab-${x}`).classList.add('hidden');
            document.getElementById(`tab-btn-${x}`).classList.replace('text-teal-700', 'text-gray-600');
            document.getElementById(`tab-btn-${x}`).classList.remove('bg-white', 'shadow');
        });
        document.getElementById(`tab-${t}`).classList.remove('hidden');
        document.getElementById(`tab-btn-${t}`).classList.add('bg-white', 'shadow', 'text-teal-700');
        
        if(t === 'team') courseManager.loadTeam();
        if(t === 'reports') courseManager.loadReports();
        if(t === 'schedule') schedulerManager.init();
    },
    toggleAccordion: (id) => {
        const c = document.getElementById(`acc-content-${id}`);
        const i = document.getElementById(`acc-icon-${id}`);
        if(c) c.classList.toggle('hidden');
        if(i) i.classList.toggle('rotate-180');
    }
};