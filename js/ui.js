import { courseManager } from './courseManager.js';
import { schedulerManager } from './scheduler.js';
import { dashboard } from './dashboard.js';

export const app = {
    // Toggles between the split-screen login and the main app shell
    showLogin: () => { 
        document.getElementById('login-view').classList.remove('hidden'); 
        document.getElementById('app-view').classList.add('hidden'); 
    },
    
    showApp: () => { 
        document.getElementById('login-view').classList.add('hidden'); 
        document.getElementById('app-view').classList.remove('hidden'); 
        // Trigger the staggered fade-in for the dashboard
        dashboard.loadCourses(); 
    },
    
    // Navigates back to the Dashboard view
    goHome: () => { 
        document.getElementById('dashboard-content').classList.remove('hidden'); 
        document.getElementById('course-content').classList.add('hidden'); 
        
        // Reset breadcrumbs
        const breadcrumb = document.getElementById('breadcrumb-container');
        if(breadcrumb) breadcrumb.innerHTML = '';
        
        dashboard.loadCourses(); 
    }
};

export const ui = {
    // Premium "Glass" Toast Notification (from Step 4)
    toast: (msg, type = 'info') => {
        // Map types to Phosphor Icons
        const icons = {
            success: '<i class="ph ph-check-circle text-lg"></i>',
            error: '<i class="ph ph-warning-circle text-lg"></i>',
            info: '<i class="ph ph-info text-lg"></i>'
        };

        // Fallback for standard alert if Toastify isn't loaded
        if(typeof Toastify === 'undefined') {
            alert(msg);
            return;
        }

        Toastify({
            text: `
                <div class="flex items-center gap-3">
                    <span class="text-xl">${icons[type] || icons.info}</span>
                    <span class="font-medium text-sm">${msg}</span>
                </div>
            `,
            duration: 3000,
            escapeMarkup: false, // Allows our HTML icons to render
            className: `toast-glass toast-${type}`, // Relies on the CSS added in Step 4
            gravity: "bottom", 
            position: "right", 
            stopOnFocus: true,
            style: { 
                background: "transparent", 
                boxShadow: "none" 
            },
            offset: { y: 20, x: 20 } // Add some breathing room from the edge
        }).showToast();
    },

    // Handles the Segmented Control switching in the Course View
    switchTab: (t) => {
        const tabs = ['content', 'team', 'reports', 'schedule'];
        
        tabs.forEach(x => {
            const btn = document.getElementById(`tab-btn-${x}`);
            const content = document.getElementById(`tab-${x}`);
            
            if (!btn || !content) return;

            // Hide content
            content.classList.add('hidden');
            
            // Reset Button State (Inactive)
            // Removes: bg-white, shadow-sm, text-brand-700
            // Adds: text-slate-500
            btn.classList.remove('bg-white', 'shadow-sm', 'text-brand-700', 'ring-1', 'ring-black/5');
            btn.classList.add('text-slate-500');
        });

        // Activate Selected Tab
        const activeBtn = document.getElementById(`tab-btn-${t}`);
        const activeContent = document.getElementById(`tab-${t}`);
        
        if (activeBtn && activeContent) {
            activeContent.classList.remove('hidden');
            
            // Set Button State (Active)
            activeBtn.classList.remove('text-slate-500');
            activeBtn.classList.add('bg-white', 'shadow-sm', 'text-brand-700', 'ring-1', 'ring-black/5');
            
            // Trigger specific load functions if needed
            if(t === 'team') courseManager.loadTeam();
            if(t === 'reports') courseManager.loadReports();
            if(t === 'schedule') schedulerManager.init();
        }
    },

    // Handles accordion logic for the Syllabus (if needed)
    toggleAccordion: (id) => {
        const c = document.getElementById(`acc-content-${id}`);
        const i = document.getElementById(`acc-icon-${id}`);
        
        if(c) {
            // Toggle visibility
            c.classList.toggle('hidden');
            // If hidden, remove padding to prevent "jumpiness"
            if (!c.classList.contains('hidden')) {
                c.classList.add('fade-in');
            }
        }
        
        if(i) {
            // Rotate the caret icon
            i.classList.toggle('rotate-180');
        }
    }
};