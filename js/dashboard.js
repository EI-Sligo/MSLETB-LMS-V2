import { sb, state } from './config.js';
import { entityModal } from './modals.js';
import { courseManager } from './courseManager.js';
import { ui } from './ui.js';

export const dashboard = {
    filter: 'all', 
    
    loadCourses: async () => {
        const grid = document.getElementById('course-grid');
        // Prevent crash
        if (!grid) { document.getElementById('dashboard-content').innerHTML = '<div id="course-grid"></div>'; } 
        else { grid.innerHTML = '<div class="col-span-full text-center p-8"><i class="ph ph-spinner animate-spin text-3xl text-teal-600"></i></div>'; }
        
        const { data: courses } = await sb.from('courses').select('*').order('created_at');
        const { data: enrolls } = await sb.from('enrollments').select('*').eq('user_id', state.user.id);
        const myMap = {}; enrolls?.forEach(e => myMap[e.course_id] = e.course_role);
        
        // Render Header
        const headerHtml = `
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-slate-800">Available Courses</h2>
                <div class="flex gap-2">
                    <button onclick="dashboard.setFilter('all')" class="px-3 py-1 text-xs rounded-full font-bold transition ${dashboard.filter==='all'?'bg-teal-600 text-white':'bg-gray-200 text-gray-600 hover:bg-gray-300'}">All Courses</button>
                    <button onclick="dashboard.setFilter('my')" class="px-3 py-1 text-xs rounded-full font-bold transition ${dashboard.filter==='my'?'bg-teal-600 text-white':'bg-gray-200 text-gray-600 hover:bg-gray-300'}">My Courses</button>
                    <button id="btn-new-course" class="${state.profile.global_role === 'super_admin' ? '' : 'hidden'} ml-2 bg-teal-600 text-white px-3 py-1 text-xs rounded shadow hover:bg-teal-700 transition" onclick="entityModal.open('course')">+ New</button>
                </div>
            </div>
            <div id="course-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"></div>
        `;
        
        document.getElementById('dashboard-content').innerHTML = headerHtml;
        const finalGrid = document.getElementById('course-grid');
        
        const filtered = (courses || []).filter(c => {
            const role = myMap[c.id];
            if(dashboard.filter === 'my') return !!role; 
            return true; 
        });

        if(filtered.length === 0) { 
            finalGrid.innerHTML = '<div class="col-span-full text-center py-10 text-gray-400"><p>No courses found in this view.</p></div>'; 
        } else {
            finalGrid.innerHTML = filtered.map(c => {
                const role = myMap[c.id];
                const imgStyle = c.image_url ? `background-image: url('${c.image_url}')` : '';
                const imgHtml = c.image_url ? `<div class="h-32 bg-cover bg-center" style="${imgStyle}"></div>` : `<div class="h-32 bg-teal-100 flex items-center justify-center text-teal-600"><i class="ph ph-book text-4xl"></i></div>`;
                
                return `
                <div class="bg-white rounded-lg shadow hover:shadow-lg transition cursor-pointer border border-transparent hover:border-teal-500 overflow-hidden flex flex-col h-full" onclick="dashboard.openCourse(${c.id}, '${role||''}')">
                    ${imgHtml}
                    <div class="p-5 flex-1 flex flex-col">
                        <h3 class="font-bold text-lg mb-1 text-slate-800">${c.title}</h3>
                        <p class="text-sm text-gray-500 line-clamp-2 flex-1">${c.description||''}</p>
                        ${role ? `<div class="mt-3"><span class="text-[10px] font-bold uppercase tracking-wide bg-blue-100 text-blue-700 px-2 py-1 rounded">${role}</span></div>` : ''}
                    </div>
                </div>`;
            }).join('');
        }
    },

    setFilter: (f) => { dashboard.filter = f; dashboard.loadCourses(); },

    openCourse: async (id, role) => {
        const { data } = await sb.from('courses').select('*').eq('id', id).single();
        if(!data) return;
        state.activeCourse = data;
        state.courseRole = state.profile.global_role === 'super_admin' ? 'super_admin' : role;
        document.getElementById('dashboard-content').classList.add('hidden');
        document.getElementById('course-content').classList.remove('hidden');
        document.getElementById('active-course-title').innerText = data.title;
        document.getElementById('active-course-desc').innerText = data.description || '';
        document.getElementById('breadcrumb-container').innerHTML = `<i class="ph ph-caret-right mx-2"></i> <span class="font-semibold text-slate-700">${data.title}</span>`;
        
        const isStaff = ['instructor', 'super_admin'].includes(state.courseRole);
        document.getElementById('tab-btn-team').classList.toggle('hidden', !isStaff);
        document.getElementById('tab-btn-schedule').classList.toggle('hidden', !isStaff);
        
        ui.switchTab('content');
        courseManager.loadSyllabus();
    }
};