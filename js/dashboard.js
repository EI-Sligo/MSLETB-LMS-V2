import { sb, state } from './config.js';
import { entityModal } from './modals.js';
import { courseManager } from './courseManager.js';
import { ui } from './ui.js';

export const dashboard = {
    filter: 'all', 
    
    loadCourses: async () => {
        const contentArea = document.getElementById('dashboard-content');
        const gridId = 'course-grid';
        
        // 1. Render Structure (Preserves the "App Shell" feel)
        // We render the header dynamically to handle the Active Filter state visually
        const headerHtml = `
            <div class="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4 fade-in">
                <div>
                    <h2 class="text-3xl font-bold text-slate-900 tracking-tight">Library</h2>
                    <p class="text-slate-500 mt-1">Explore available modules and simulations.</p>
                </div>
                
                <div class="flex items-center gap-3">
                    <div class="bg-slate-100/80 p-1 rounded-xl flex items-center border border-slate-200">
                        <button onclick="dashboard.setFilter('all')" class="px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${dashboard.filter === 'all' ? 'bg-white text-slate-800 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}">
                            All
                        </button>
                        <button onclick="dashboard.setFilter('my')" class="px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${dashboard.filter === 'my' ? 'bg-white text-brand-600 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}">
                            My Courses
                        </button>
                    </div>

                    <button id="btn-new-course" class="${state.profile.global_role === 'super_admin' ? '' : 'hidden'} ml-2 bg-slate-900 text-white px-4 py-2 text-xs font-bold rounded-xl shadow-lg hover:bg-slate-800 hover:scale-105 transition-all flex items-center gap-2" onclick="entityModal.open('course')">
                        <i class="ph ph-plus-circle text-lg"></i> <span>New</span>
                    </button>
                </div>
            </div>
            
            <div id="${gridId}" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-10">
                <div class="col-span-full h-64 flex flex-col items-center justify-center text-slate-300">
                    <i class="ph ph-spinner-gap animate-spin text-4xl mb-4 text-brand-500"></i>
                    <span class="text-sm font-medium text-slate-400">Loading library...</span>
                </div>
            </div>
        `;
        
        contentArea.innerHTML = headerHtml;
        const finalGrid = document.getElementById(gridId);
        
        // 2. Fetch Data
        const { data: courses } = await sb.from('courses').select('*').order('created_at', { ascending: false });
        const { data: enrolls } = await sb.from('enrollments').select('*').eq('user_id', state.user.id);
        
        // Map roles for quick lookup
        const myMap = {}; 
        enrolls?.forEach(e => myMap[e.course_id] = e.course_role);
        
        // 3. Filter
        const filtered = (courses || []).filter(c => {
            if(dashboard.filter === 'my') return !!myMap[c.id]; 
            return true; 
        });

        // 4. Render Grid
        if(filtered.length === 0) { 
            finalGrid.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                    <div class="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-400">
                        <i class="ph ph-books text-3xl"></i>
                    </div>
                    <h3 class="text-slate-900 font-bold text-lg">No courses found</h3>
                    <p class="text-slate-500 text-sm mt-1 max-w-xs">Try adjusting your filters or check back later for new content.</p>
                    ${dashboard.filter === 'my' ? '<button onclick="dashboard.setFilter(\'all\')" class="mt-6 text-brand-600 font-bold text-sm hover:underline">Browse all courses</button>' : ''}
                </div>
            `; 
        } else {
            finalGrid.innerHTML = filtered.map((c, index) => {
                const role = myMap[c.id];
                const hasImage = !!c.image_url;
                const bgImage = hasImage ? c.image_url : 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=2070&auto=format&fit=crop'; // Modern fallback
                
                // Animation delay for staggered entry
                const delayStyle = `animation-delay: ${index * 50}ms`;

                return `
                <div class="group relative bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden cursor-pointer flex flex-col h-full fade-in" 
                     style="${delayStyle}"
                     onclick="dashboard.openCourse(${c.id}, '${role||''}')">
                    
                    <div class="relative h-48 overflow-hidden">
                        <div class="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110" 
                             style="background-image: url('${bgImage}')"></div>
                        <div class="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent opacity-60"></div>
                        
                        ${role ? `
                        <div class="absolute top-3 right-3 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide backdrop-blur-md border border-white/20 shadow-sm 
                            ${role === 'instructor' ? 'bg-purple-500/90 text-white' : 'bg-brand-500/90 text-white'}">
                            ${role}
                        </div>
                        ` : ''}
                    </div>

                    <div class="p-5 flex-1 flex flex-col">
                        <div class="mb-4 flex-1">
                            <h3 class="font-bold text-slate-900 text-lg leading-tight mb-2 group-hover:text-brand-600 transition-colors line-clamp-2">
                                ${c.title}
                            </h3>
                            <p class="text-sm text-slate-500 line-clamp-2 leading-relaxed">
                                ${c.description || 'No description provided.'}
                            </p>
                        </div>

                        <div class="pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-400">
                            <div class="flex items-center gap-3">
                                <span class="flex items-center gap-1"><i class="ph ph-book-open"></i> Modules</span>
                                <span class="flex items-center gap-1"><i class="ph ph-clock"></i> 2h 15m</span>
                            </div>
                            
                            <div class="h-8 w-8 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-brand-600 group-hover:text-white transition-colors">
                                <i class="ph ph-caret-right text-lg"></i>
                            </div>
                        </div>

                        ${role ? `
                        <div class="mt-4 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div class="h-full bg-brand-500 w-[${Math.floor(Math.random() * 60) + 10}%]"></div>
                        </div>
                        ` : ''}
                    </div>
                </div>`;
            }).join('');
        }
    },

    setFilter: (f) => { 
        dashboard.filter = f; 
        dashboard.loadCourses(); 
    },

    openCourse: async (id, role) => {
        // UI Transition
        const grid = document.getElementById('dashboard-content');
        const detail = document.getElementById('course-content');
        
        grid.classList.add('hidden');
        detail.classList.remove('hidden');
        
        // Fetch Data
        const { data } = await sb.from('courses').select('*').eq('id', id).single();
        if(!data) return;

        // Update State
        state.activeCourse = data;
        state.courseRole = state.profile.global_role === 'super_admin' ? 'super_admin' : role;
        
        // Populate Header
        document.getElementById('active-course-title').innerText = data.title;
        document.getElementById('active-course-desc').innerText = data.description || '';
        
        // Dynamic Breadcrumb
        document.getElementById('breadcrumb-container').innerHTML = `
            <i class="ph ph-caret-right mx-2 text-slate-300 text-xs"></i> 
            <span class="font-semibold text-slate-700 truncate max-w-[150px]">${data.title}</span>
        `;
        
        // Role-based Access Control for Tabs
        const isStaff = ['instructor', 'super_admin'].includes(state.courseRole);
        document.getElementById('tab-btn-team').classList.toggle('hidden', !isStaff);
        document.getElementById('tab-btn-schedule').classList.toggle('hidden', !isStaff);
        
        // Reset View
        ui.switchTab('content');
        courseManager.loadSyllabus();
    }
};