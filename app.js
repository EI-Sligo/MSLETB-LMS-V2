// ==========================================
// 1. CONFIGURATION & IMPORTS
// ==========================================
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const state = {
    user: null, profile: null,
    courses: [], activeCourse: null, activeSection: null, activeModule: null,
    structure: [] 
};

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================
function getIrishHolidays(year) {
    const holidays = [];
    const addObserved = (dateStr) => {
        const d = new Date(dateStr);
        const day = d.getDay(); // 0=Sun, 6=Sat
        if (day === 0) { d.setDate(d.getDate() + 1); holidays.push(d.toISOString().split('T')[0]); }
        else if (day === 6) { d.setDate(d.getDate() + 2); holidays.push(d.toISOString().split('T')[0]); }
        else { holidays.push(dateStr); }
    };

    addObserved(`${year}-01-01`); // New Year
    addObserved(`${year}-03-17`); // St Patrick
    addObserved(`${year}-12-25`); // Xmas
    addObserved(`${year}-12-26`); // Stephens

    // St Brigid's (First Mon in Feb, unless Feb 1st is Friday)
    let feb1 = new Date(year, 1, 1);
    if (feb1.getDay() === 5) holidays.push(`${year}-02-01`);
    else { while (feb1.getDay() !== 1) feb1.setDate(feb1.getDate() + 1); holidays.push(feb1.toISOString().split('T')[0]); }

    // Easter
    const f = Math.floor, y = year;
    const G = y % 19, C = f(y / 100), H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30;
    const I = H - f(H / 28) * (1 - f(29 / (H + 1)) * f((21 - G) / 11));
    const J = (y + f(y / 4) + I + 2 - C + f(C / 4)) % 7;
    const L = I - J;
    const month = 3 + f((L + 40) / 44);
    const day = L + 28 - 31 * f(month / 4);
    const easterSunday = new Date(year, month - 1, day);
    
    const goodFriday = new Date(easterSunday); goodFriday.setDate(easterSunday.getDate() - 2);
    const easterMon = new Date(easterSunday); easterMon.setDate(easterSunday.getDate() + 1);
    holidays.push(goodFriday.toISOString().split('T')[0]);
    holidays.push(easterMon.toISOString().split('T')[0]);

    // Bank Holidays
    [4, 5, 7].forEach(m => { 
        let d = new Date(year, m, 1);
        while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
        holidays.push(d.toISOString().split('T')[0]);
    });
    
    // Oct Bank Holiday
    let oct = new Date(year, 10, 0); 
    while (oct.getDay() !== 1) oct.setDate(oct.getDate() - 1);
    holidays.push(oct.toISOString().split('T')[0]);

    return holidays;
}

function getContentEmoji(type) {
    switch (type) {
        case 'audio': return '🎧'; case 'video': return '🎥'; case 'simulator': return '⚡';
        case 'assignment': return '📝'; case 'quiz': return '✅'; case 'url': return '🔗';
        default: return '📄';
    }
}

function isAdmin() { return state.profile && ['instructor', 'super_admin'].includes(state.profile.global_role); }

function getGradeInfo(score, total) {
    if (!total || total === 0) return { pct: 0, label: 'No Data', color: 'bg-gray-100 text-gray-500' };
    const pct = Math.round((score / total) * 100);
    let label = 'Fail', color = 'bg-red-100 text-red-700';
    if (pct >= 85) { label = 'Credit'; color = 'bg-purple-100 text-purple-700'; } 
    else if (pct >= 70) { label = 'Pass'; color = 'bg-green-100 text-green-700'; }
    return { pct, label, color };
}

// HELPER: RENDER CONTENT ITEM (Folder View)
function renderContentItem(file, unitId, myWork) {
    let emoji = getContentEmoji(file.type);
    let actionHtml = '';
    let descHtml = '';

    if (file.data) {
        if (file.data.description) descHtml = `<div class="text-xs text-gray-500 mt-1 ml-11 line-clamp-2">${file.data.description}</div>`;
        if (file.data.dueDate) descHtml += `<div class="ml-11 mt-1 text-[10px] font-bold text-red-500 flex items-center gap-1"><i class="ph ph-calendar-warning"></i> Due: ${new Date(file.data.dueDate).toLocaleDateString()}</div>`;
    }

    if(file.type === 'assignment') {
        if(file.file_url) descHtml += `<div class="ml-11 mt-1"><a href="${file.file_url}" target="_blank" class="text-[10px] text-blue-600 hover:underline flex items-center gap-1"><i class="ph ph-file-arrow-down"></i> Brief</a></div>`;
        if (isAdmin()) actionHtml = `<button onclick="event.stopPropagation(); assignmentManager.openGrading(${file.id})" class="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-100 hover:bg-indigo-100 font-bold">Grade</button>`;
        else {
            const status = myWork[file.id] || 'Upload';
            const btnColor = status === 'Submitted' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-sm';
            actionHtml = `<button onclick="event.stopPropagation(); assignmentManager.openSubmit(${file.id})" class="text-[10px] px-3 py-1 rounded border ${btnColor} font-medium">${status}</button>`;
        }
    } else if (file.type === 'quiz') {
        if (isAdmin()) actionHtml = `<span class="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded border">Quiz</span>`;
        else {
            const status = myWork[file.id] ? 'Retake' : 'Start';
            actionHtml = `<button onclick="event.stopPropagation(); quizManager.takeQuiz(${file.id})" class="text-[10px] px-3 py-1 rounded bg-purple-600 text-white hover:bg-purple-700 shadow-sm font-bold">${status}</button>`;
        }
    }
    
    return `
    <div class="bg-white p-2 rounded border border-gray-100 hover:border-teal-500 hover:shadow-sm transition group mb-1">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-3 cursor-pointer flex-1" onclick="courseManager.launchContent(${file.id}, '${file.type}', '${file.file_url}')">
                <div class="h-8 w-8 flex items-center justify-center text-xl grayscale group-hover:grayscale-0 transition-all bg-gray-50 rounded-full group-hover:bg-teal-50 text-teal-600">
                    ${emoji}
                </div>
                <span class="font-medium text-sm text-gray-700 group-hover:text-teal-700 transition">
                    ${file.title}
                    ${!file.is_visible ? '<i class="ph ph-eye-slash text-red-400 text-xs ml-1"></i>' : ''}
                </span>
            </div>
            <div class="flex items-center gap-2">
                ${actionHtml}
                ${isAdmin() ? `
                    <div class="hidden group-hover:flex gap-1">
                        <button onclick='contentModal.open(${unitId}, ${JSON.stringify(file).replace(/'/g, "&#39;").replace(/"/g, "&quot;")})' class="text-gray-400 hover:text-blue-500 p-1"><i class="ph ph-pencil-simple"></i></button>
                        <button onclick="courseManager.deleteItem('content', ${file.id})" class="text-gray-400 hover:text-red-500 p-1"><i class="ph ph-trash"></i></button>
                    </div>
                ` : ''}
            </div>
        </div>
        ${descHtml}
    </div>`;
}

// ==========================================
// 3. AUTH & UI
// ==========================================
const auth = {
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

const authUI = {
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

const app = {
    showLogin: () => { document.getElementById('login-view').classList.remove('hidden'); document.getElementById('app-view').classList.add('hidden'); },
    showApp: () => { document.getElementById('login-view').classList.add('hidden'); document.getElementById('app-view').classList.remove('hidden'); dashboard.loadCourses(); },
    goHome: () => { document.getElementById('dashboard-content').classList.remove('hidden'); document.getElementById('course-content').classList.add('hidden'); dashboard.loadCourses(); }
};

const ui = {
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

// ==========================================
// 4. CORE MANAGERS
// ==========================================
// ==========================================
// 4. CORE MANAGERS
// ==========================================
// ==========================================
// 4. CORE MANAGERS
// ==========================================
const dashboard = {
    filter: 'all', 
    
    loadCourses: async () => {
        // 1. Show Spinner (safely)
        const grid = document.getElementById('course-grid');
        if (grid) grid.innerHTML = '<div class="col-span-full text-center p-8"><i class="ph ph-spinner animate-spin text-3xl text-teal-600"></i></div>';
        
        // 2. Fetch Data
        const { data: courses } = await sb.from('courses').select('*').order('created_at');
        const { data: enrolls } = await sb.from('enrollments').select('*').eq('user_id', state.user.id);
        const myMap = {}; enrolls?.forEach(e => myMap[e.course_id] = e.course_role);
        
        // 3. Render Header
        const headerHtml = `
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-slate-800">Available Courses</h2>
                <div class="flex gap-2">
                    <button onclick="dashboard.setFilter('all')" class="px-3 py-1 text-xs rounded-full font-bold transition ${dashboard.filter==='all'?'bg-teal-600 text-white':'bg-gray-200 text-gray-600 hover:bg-gray-300'}">All Courses</button>
                    <button onclick="dashboard.setFilter('my')" class="px-3 py-1 text-xs rounded-full font-bold transition ${dashboard.filter==='my'?'bg-teal-600 text-white':'bg-gray-200 text-gray-600 hover:bg-gray-300'}">My Courses</button>
                    <button id="btn-new-course" class="${state.profile.global_role === 'super_admin' ? '' : 'hidden'} ml-2 bg-teal-600 text-white px-3 py-1 text-xs rounded shadow hover:bg-teal-700 transition" onclick="entityModal.open('course')">+ New</button>
                </div>
            </div>
        `;
        
        // 4. Filter & Render Grid
        let cardsHtml = '';
        if(!courses || courses.length === 0) { 
            cardsHtml = '<div id="course-grid" class="col-span-full text-center text-gray-400"><p>No courses available.</p></div>'; 
        } else {
            const filtered = courses.filter(c => {
                const role = myMap[c.id];
                if(dashboard.filter === 'my') return !!role; 
                return true; 
            });

            if(filtered.length === 0) {
                cardsHtml = `<div id="course-grid" class="col-span-full text-center py-10 text-gray-400"><p>No courses found in this view.</p></div>`;
            } else {
                // IMPORTANT: Added id="course-grid" here to prevent the "Cannot set properties of null" error
                cardsHtml = `<div id="course-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">` + 
                filtered.map(c => {
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
                }).join('') + `</div>`;
            }
        }

        // 5. Update DOM
        const dbContainer = document.getElementById('dashboard-content');
        dbContainer.innerHTML = headerHtml + cardsHtml;
    },

    setFilter: (f) => {
        dashboard.filter = f;
        dashboard.loadCourses();
    },

    openCourse: (courseId, role) => {
        sb.from('courses').select('*').eq('id', courseId).single().then(({data: course}) => {
            state.activeCourse = course;
            state.courseRole = state.profile.global_role === 'super_admin' ? 'super_admin' : role;
            document.getElementById('dashboard-content').classList.add('hidden');
            document.getElementById('course-content').classList.remove('hidden');
            document.getElementById('active-course-title').innerText = course.title;
            document.getElementById('active-course-desc').innerText = course.description || '';
            document.getElementById('breadcrumb-container').innerHTML = `<i class="ph ph-caret-right mx-2"></i> <span class="font-semibold text-slate-700">${course.title}</span>`;
            ui.switchTab('content');
            courseManager.loadSyllabus();
            
            const isStaff = ['instructor', 'super_admin'].includes(state.courseRole);
            ['btn-add-section', 'btn-add-unit', 'tab-btn-team', 'tab-btn-schedule'].forEach(id => {
                const el = document.getElementById(id);
                if(el) el.classList.toggle('hidden', !isStaff);
            });
        });
    }
};

const courseManager = {
    // 1. SYLLABUS
    loadSyllabus: async (silent = false) => {
        if(!silent) {
            const list = document.getElementById('syllabus-list');
            if(list) list.innerHTML = '<div class="p-4 text-center"><i class="ph ph-spinner animate-spin text-teal-600"></i></div>';
        }
        
        const palette = ['#dbeafe', '#d1fae5', '#fef9c3', '#fee2e2', '#f3e8ff', '#ffedd5'];
        
        let query = sb.from('sections').select('*, modules(*, units(*, content(*)))') 
            .eq('course_id', state.activeCourse.id).order('position', { ascending: true });
        
        if(!isAdmin()) query = query.eq('is_visible', true);

        const { data: sections } = await query;
        state.structure = sections || []; 

        if(silent) return; 

        const list = document.getElementById('syllabus-list');
        list.innerHTML = '';

        if (!sections || sections.length === 0) { 
            list.innerHTML = '<div class="text-center text-gray-400 p-4 text-sm">No sections yet.</div>'; 
            return; 
        }

        let modIdx = 0;
        sections.forEach(section => {
            let modules = (section.modules || []).sort((a,b) => a.position - b.position);
            modules.forEach(m => { m.color = palette[modIdx % palette.length]; modIdx++; });

            const sectionEl = document.createElement('div');
            sectionEl.className = "border-b border-gray-100 last:border-0";
            
            sectionEl.innerHTML = `
                <div class="flex justify-between items-center p-3 hover:bg-slate-50 group cursor-pointer" onclick="ui.toggleAccordion('${section.id}')">
                    <div class="flex items-center gap-2 font-bold text-xs text-gray-600 uppercase tracking-wide flex-1">
                        <i id="acc-icon-${section.id}" class="ph ph-caret-down transition-transform duration-200"></i>
                        <span class="truncate">${section.title}</span>
                    </div>
                    <div class="flex items-center gap-1" onclick="event.stopPropagation()">
                        ${isAdmin() ? `
                            <button onclick="courseManager.bulkCreate('module', ${section.id})" class="text-teal-600 hover:bg-teal-50 p-1 rounded" title="Add Module"><i class="ph ph-plus"></i></button>
                            <button onclick="entityModal.open('section', ${section.id}, '${section.title.replace(/'/g,"")}')" class="text-blue-500 hover:bg-blue-50 p-1 rounded"><i class="ph ph-pencil-simple"></i></button>
                            <button onclick="courseManager.deleteItem('sections', ${section.id})" class="text-red-400 hover:bg-red-50 p-1 rounded"><i class="ph ph-trash"></i></button>
                        ` : ''}
                    </div>
                </div>
                <div id="acc-content-${section.id}" class="pl-4 pb-2 space-y-1 hidden">
                    ${modules.map(m => `
                        <div class="p-2 rounded cursor-pointer text-sm text-gray-600 hover:bg-teal-50 hover:text-teal-700 flex justify-between items-center group transition" onclick="courseManager.openModule('${m.id}')">
                            <div class="flex items-center gap-2 flex-1">
                                <div class="w-2 h-2 rounded-full" style="background:${m.color}"></div>
                                <span class="truncate ${!m.is_visible ? 'opacity-50 italic' : ''}">${m.title}</span>
                            </div>
                            <div class="flex items-center gap-1" onclick="event.stopPropagation()">
                                ${isAdmin() ? `
                                    <input type="checkbox" class="accent-teal-600 mr-1" title="Visible?" 
                                        ${m.is_visible ? 'checked' : ''} 
                                        onclick="courseManager.toggleVisibility('modules', ${m.id}, this.checked)">
                                        
                                    <button onclick="courseManager.moveItem('modules', ${m.id}, 'up')" class="text-gray-400 hover:text-teal-600 hidden group-hover:block"><i class="ph ph-arrow-up"></i></button>
                                    <button onclick="courseManager.moveItem('modules', ${m.id}, 'down')" class="text-gray-400 hover:text-teal-600 hidden group-hover:block"><i class="ph ph-arrow-down"></i></button>
                                    
                                    <button onclick="entityModal.open('module', ${m.id}, '${m.title.replace(/'/g,"")}')" class="text-blue-400 hover:text-blue-600 hidden group-hover:block"><i class="ph ph-pencil-simple"></i></button>
                                    <button onclick="courseManager.deleteItem('modules', ${m.id})" class="text-red-400 hover:text-red-600 hidden group-hover:block"><i class="ph ph-trash"></i></button>
                                ` : ''}
                            </div>
                        </div>`).join('')}
                </div>
            `;
            list.appendChild(sectionEl);
        });
    },

    // 2. OPEN MODULE
    openModule: async (moduleId) => {
        const { data: module } = await sb.from('modules').select('*').eq('id', moduleId).single();
        state.activeModule = module;
        
        document.getElementById('current-module-title').innerHTML = `<span class="flex items-center gap-2 text-teal-900 font-bold"><i class="ph ph-folder-open"></i> ${module.title}</span>`;
        
        if(isAdmin()) {
            const btnAdd = document.getElementById('btn-add-unit');
            btnAdd.classList.remove('hidden');
            btnAdd.onclick = courseManager.addUnit; // FIX: Explicitly bind the click handler

            let bulkBtn = document.getElementById('btn-bulk-edit');
            if(!bulkBtn) {
                bulkBtn = document.createElement('button');
                bulkBtn.id = 'btn-bulk-edit';
                bulkBtn.className = "text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded border border-indigo-200 mr-2 hover:bg-indigo-100 font-bold flex items-center gap-1";
                bulkBtn.innerHTML = `<i class="ph ph-list-dashes"></i> Bulk Edit`;
                bulkBtn.onclick = () => courseManager.openBulkEdit(); 
                const container = btnAdd.parentElement;
                container.insertBefore(bulkBtn, btnAdd);
            }
        }
        const container = document.getElementById('unit-container');
        container.innerHTML = '<div class="text-gray-400 p-8 flex justify-center"><i class="ph ph-spinner animate-spin text-2xl"></i></div>';
        
        const { data: units } = await sb.from('units').select('*, content(*)').eq('module_id', moduleId).order('position', { ascending: true });
        
        let myWork = {};
        if(!isAdmin()) {
            const { data: subs } = await sb.from('assignments').select('content_id').eq('student_id', state.user.id);
            const { data: quizzes } = await sb.from('quiz_results').select('content_id').eq('user_id', state.user.id);
            subs?.forEach(s => myWork[s.content_id] = 'Submitted');
            quizzes?.forEach(q => myWork[q.content_id] = 'Completed');
        }

        container.innerHTML = '';
        if (!units || units.length === 0) { 
            container.innerHTML = '<div class="flex flex-col items-center justify-center h-64 text-gray-400"><i class="ph ph-tray text-4xl mb-2"></i><p>This module is empty.</p></div>'; 
            return; 
        }

        units.forEach((unit, index) => {
            const isOpen = index === 0;
            const unitEl = document.createElement('div');
            unitEl.className = "mb-4 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden";
            unitEl.innerHTML = `
                <div class="flex justify-between items-center p-4 bg-white cursor-pointer hover:bg-gray-50 border-b border-gray-100" onclick="ui.toggleAccordion('unit-${unit.id}')">
                    <div class="flex items-center gap-2 flex-1"><i id="acc-icon-unit-${unit.id}" class="ph ph-caret-down text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}"></i><h3 class="font-bold text-slate-700 text-lg">${unit.title}</h3></div>
                    <div class="flex items-center gap-3" onclick="event.stopPropagation()">
                        ${isAdmin() ? `
                            <div class="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded border border-gray-200" title="Total Hours Required">
                                <i class="ph ph-clock text-gray-400 text-xs"></i>
                                <input type="number" step="0.5" class="w-12 text-xs bg-transparent outline-none font-bold text-gray-600 text-right" value="${unit.total_hours_required || 0}" onchange="courseManager.updateHours(${unit.id}, this.value)">
                                <span class="text-[10px] text-gray-400">h</span>
                            </div>
                            <label class="relative inline-flex items-center cursor-pointer mr-2">
                                <input type="checkbox" class="sr-only peer" ${unit.is_visible ? 'checked' : ''} onchange="courseManager.toggleVisibility('units', ${unit.id}, this.checked)">
                                <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-teal-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                            </label>
                            <div class="flex gap-1 border-l pl-2 border-gray-200">
                                <button onclick="courseManager.moveItem('units', ${unit.id}, 'up')" class="text-gray-400 hover:text-teal-600 p-1"><i class="ph ph-arrow-up"></i></button>
                                <button onclick="courseManager.moveItem('units', ${unit.id}, 'down')" class="text-gray-400 hover:text-teal-600 p-1"><i class="ph ph-arrow-down"></i></button>
                                <button onclick="courseManager.addContent(${unit.id})" class="text-xs bg-teal-50 text-teal-700 px-3 py-1 rounded hover:bg-teal-100 border border-teal-200 font-medium">+ Content</button>
                                <button onclick="courseManager.editItem('units', ${unit.id}, '${unit.title}')" class="text-gray-400 hover:text-blue-500 p-1"><i class="ph ph-pencil-simple text-lg"></i></button>
                                <button onclick="courseManager.deleteItem('units', ${unit.id})" class="text-gray-400 hover:text-red-500 p-1"><i class="ph ph-trash text-lg"></i></button>
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div id="acc-content-unit-${unit.id}" class="${isOpen ? '' : 'hidden'} bg-slate-50 p-4 space-y-3"></div>
            `;
            
            const contentContainer = unitEl.querySelector(`#acc-content-unit-${unit.id}`);
            if(unit.content && !isAdmin()) unit.content = unit.content.filter(c => c.is_visible);

            // GROUPING LOGIC (Restored V1)
            if(unit.content && unit.content.length > 0) {
                unit.content.sort((a,b) => a.position - b.position);
                const groups = { video: [], file: [], audio: [], simulator: [], assignment: [], quiz: [], url: [] };
                unit.content.forEach(item => { if(groups[item.type]) groups[item.type].push(item); else groups['file'].push(item); });

                Object.keys(groups).forEach(type => {
                    if(groups[type].length === 0) return;
                    const groupTitle = type.charAt(0).toUpperCase() + type.slice(1);
                    const groupIcon = getContentEmoji(type); 

                    contentContainer.innerHTML += `
                        <details class="group/nested bg-white border border-gray-200 rounded-lg overflow-hidden mb-2" open>
                            <summary class="flex justify-between items-center p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 list-none text-xs font-bold text-gray-500 uppercase tracking-wider">
                                <span class="flex items-center gap-2">${groupIcon} ${groupTitle}s</span>
                                <i class="ph ph-caret-down text-gray-400 transition-transform group-open/nested:rotate-180"></i>
                            </summary>
                            <div class="p-2 space-y-1 border-t border-gray-100">
                                ${groups[type].map(file => renderContentItem(file, unit.id, myWork)).join('')}
                            </div>
                        </details>`;
                });
            } else { contentContainer.innerHTML = '<p class="text-sm text-gray-400 italic pl-2">No content yet.</p>'; }
            container.appendChild(unitEl);
        });
    },

    // 3. BULK EDIT
    openBulkEdit: async () => {
        const { data: sections } = await sb.from('sections')
            .select('id, title, position, modules(id, title, position, units(id, title, total_hours_required, position))')
            .eq('course_id', state.activeCourse.id).order('position', { ascending: true });

        let rows = [];
        sections?.forEach(sec => {
            rows.push({ type: 'section', id: sec.id, title: sec.title, indent: 0 });
            rows.push({ type: 'btn-module', parentId: sec.id, indent: 1 }); 

            sec.modules?.sort((a,b)=>a.position-b.position).forEach(mod => {
                rows.push({ type: 'module', id: mod.id, title: mod.title, indent: 1 });
                rows.push({ type: 'btn-unit', parentId: mod.id, indent: 2 }); 

                mod.units?.sort((a,b)=>a.position-b.position).forEach(unit => {
                    rows.push({ type: 'unit', id: unit.id, title: unit.title, hours: unit.total_hours_required, indent: 2 });
                });
            });
        });
        rows.push({ type: 'btn-section', indent: 0 });

        const modal = document.createElement('div');
        modal.className = "fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-8 fade-in";
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col">
                <div class="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h3 class="font-bold text-lg">Bulk Edit: ${state.activeCourse.title}</h3>
                    <button onclick="this.closest('.fixed').remove(); courseManager.loadSyllabus();" class="text-gray-500 hover:text-red-500"><i class="ph ph-x text-xl"></i></button>
                </div>
                <div class="flex-1 overflow-y-auto p-0">
                    <table class="w-full text-sm text-left">
                        <thead class="bg-gray-100 text-gray-600 sticky top-0 z-10 shadow-sm">
                            <tr><th class="p-3 w-24 pl-6">Type</th><th class="p-3">Title</th><th class="p-3 w-32">Hours</th></tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            ${rows.map(row => {
                                if(row.type.startsWith('btn-')) {
                                    const itemType = row.type.replace('btn-', '');
                                    return `<tr class="bg-slate-50 hover:bg-slate-100"><td></td><td class="p-2"><button onclick="courseManager.bulkCreate('${itemType}', ${row.parentId || 0})" style="margin-left: ${row.indent * 1.5}rem" class="text-xs text-teal-600 hover:text-teal-800 font-bold flex items-center gap-1 px-2 py-1 rounded hover:bg-teal-50 border border-transparent hover:border-teal-200 transition"><i class="ph ph-plus-circle"></i> Add ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}</button></td><td></td></tr>`;
                                }
                                const isUnit = row.type === 'unit';
                                const typeLabel = row.type.charAt(0).toUpperCase() + row.type.slice(1);
                                const typeColor = row.type === 'section' ? 'bg-gray-200 text-gray-800' : (row.type === 'module' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800');
                                const table = row.type + 's'; 
                                return `<tr class="${row.type === 'section' ? 'bg-gray-50' : 'bg-white'} hover:bg-slate-50 transition border-b border-gray-100">
                                    <td class="p-2 pl-4 align-middle"><span class="text-[10px] font-bold ${typeColor} px-2 py-1 rounded uppercase tracking-wider">${typeLabel}</span></td>
                                    <td class="p-2"><div style="padding-left: ${row.indent * 1.5}rem" class="relative flex items-center">${row.indent > 0 ? `<div class="absolute left-0 top-1/2 -translate-y-1/2 w-[${row.indent * 1.5}rem] h-px bg-gray-300"></div>` : ''}<input type="text" class="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-teal-500 focus:outline-none py-1 px-2 font-medium text-gray-700" value="${row.title}" onchange="courseManager.updateEntity('${table}', ${row.id}, 'title', this.value)"></div></td>
                                    <td class="p-2">${isUnit ? `<div class="flex items-center gap-1"><input type="number" step="0.5" class="border p-1 rounded w-20 text-center bg-white focus:ring-2 focus:ring-teal-500 outline-none" value="${row.hours || 0}" onchange="courseManager.updateEntity('units', ${row.id}, 'total_hours_required', this.value)"><span class="text-xs text-gray-400">h</span></div>` : ''}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="p-4 border-t bg-gray-50 flex justify-end">
                    <button onclick="this.closest('.fixed').remove(); courseManager.loadSyllabus();" class="bg-teal-600 text-white px-6 py-2 rounded shadow hover:bg-teal-700 font-bold">Done & Refresh</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    },

    bulkCreate: async (type, parentId) => {
        const title = prompt(`Enter ${type} title:`);
        if(!title) return;
        const payload = { title, is_visible: true };
        if(type === 'section') payload.course_id = state.activeCourse.id;
        else if(type === 'module') payload.section_id = parentId;
        else if(type === 'unit') { payload.module_id = parentId; payload.total_hours_required = 0; }
        
        await sb.from(type + 's').insert([payload]);
        const modal = document.querySelector('.fixed.z-\\[70\\]');
        if(modal) { modal.remove(); courseManager.openBulkEdit(); }
        else { courseManager.loadSyllabus(); }
    },

    updateEntity: async (table, id, field, value) => { await sb.from(table).update({ [field]: value }).eq('id', id); },

    // 4. TEAM MANAGEMENT
    loadTeam: async () => {
        const el = document.getElementById('tab-team');
        el.innerHTML = '<p class="p-4">Loading roster...</p>';
        const { data: roster } = await sb.from('enrollments').select('*, profiles(email)').eq('course_id', state.activeCourse.id);
        const { data: invites } = await sb.from('invitations').select('*').eq('course_id', state.activeCourse.id);
        
        let html = `<div class="flex justify-between mb-6 items-end"><h2 class="text-xl font-bold text-gray-800">Class Roster</h2>
            <div class="flex gap-2 items-center bg-gray-50 p-2 rounded border border-gray-200">
                <select id="role-in" class="border border-gray-300 p-1.5 rounded text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none"><option value="student">Student</option><option value="instructor">Instructor</option></select>
                <input id="email-in" placeholder="Email Address" class="border border-gray-300 p-1.5 rounded text-sm w-64 focus:ring-2 focus:ring-teal-500 outline-none">
                <button onclick="courseManager.enroll()" class="bg-teal-600 text-white px-4 py-1.5 rounded text-sm font-bold shadow-sm hover:bg-teal-700">+ Invite</button>
            </div>
        </div>`;
        
        html += `<div class="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm"><table class="w-full text-sm text-left"><thead class="bg-gray-50 text-gray-500 uppercase font-semibold border-b border-gray-200"><tr><th class="p-4">Email</th><th class="p-4">Role</th><th class="p-4">Status</th><th class="p-4"></th></tr></thead><tbody class="divide-y divide-gray-100">`;
        
        invites?.forEach(i => html += `<tr class="bg-yellow-50"><td class="p-4 font-medium text-gray-700">${i.email}</td><td class="p-4 uppercase text-xs font-bold">${i.role}</td><td class="p-4"><span class="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs font-bold">Pending</span></td><td class="p-4 text-right"><button onclick="courseManager.delInvite(${i.id})" class="text-red-400 hover:text-red-600 p-1"><i class="ph ph-x-circle text-xl"></i></button></td></tr>`);
        roster?.forEach(m => html += `<tr class="hover:bg-gray-50"><td class="p-4 font-medium text-gray-800">${m.profiles?.email || 'Unknown'}</td><td class="p-4"><span class="px-2 py-1 rounded text-xs font-bold ${m.course_role==='instructor'?'bg-purple-100 text-purple-700':'bg-blue-100 text-blue-700'}">${m.course_role.toUpperCase()}</span></td><td class="p-4"><span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">Active</span></td><td class="p-4 text-right">${isAdmin() && m.user_id !== state.user.id ? `<button onclick="courseManager.delUser('${m.user_id}')" class="text-gray-400 hover:text-red-600 p-1"><i class="ph ph-trash text-lg"></i></button>` : ''}</td></tr>`);
        html += `</tbody></table></div>`; el.innerHTML = html;
    },

    enroll: async () => {
        const email = document.getElementById('email-in').value; const role = document.getElementById('role-in').value;
        if(!email) return ui.toast("Enter email", "error");
        
        const { data: u } = await sb.from('profiles').select('id').eq('email', email).maybeSingle();
        if(u) { await sb.from('enrollments').insert([{course_id:state.activeCourse.id, user_id:u.id, course_role:role}]); ui.toast("User Enrolled!", "success"); }
        else { await sb.from('invitations').insert([{course_id:state.activeCourse.id, email, role, invited_by:state.user.id}]); ui.toast("Invite Sent!", "success"); }
        courseManager.loadTeam();
    },
    delInvite: async (id) => { if(confirm("Cancel invite?")) { await sb.from('invitations').delete().eq('id', id); courseManager.loadTeam(); }},
    delUser: async (uid) => { if(confirm("Remove user from course?")) { await sb.from('enrollments').delete().eq('course_id', state.activeCourse.id).eq('user_id', uid); courseManager.loadTeam(); }},

    // 5. REPORTS
    loadReports: async () => {
        const el = document.getElementById('tab-reports');
        el.innerHTML = '<div class="flex justify-center p-8"><i class="ph ph-spinner animate-spin text-3xl text-teal-600"></i></div>';

        const { data: sections } = await sb.from('sections')
            .select('id, title, modules(id, title, units(id, title, content(id, title, type)))')
            .eq('course_id', state.activeCourse.id).order('position');

        let gradableItems = [];
        sections?.forEach(s => s.modules?.forEach(m => m.units?.forEach(u => u.content?.forEach(c => {
            if(['assignment', 'quiz', 'simulator'].includes(c.type)) {
                gradableItems.push({ id: c.id, title: c.title, type: c.type, context: `${m.title} <br> <span class="text-gray-400 font-normal text-[10px] uppercase tracking-wide">${u.title}</span>` });
            }
        }))));

        if (isAdmin()) {
            const { data: roster } = await sb.from('enrollments').select('user_id, profiles(email)').eq('course_id', state.activeCourse.id).eq('course_role', 'student');
            if (!roster || roster.length === 0) { el.innerHTML = '<p class="text-gray-500 p-6">No students enrolled yet.</p>'; return; }

            const itemIds = gradableItems.map(i => i.id);
            const { data: allAssigns } = await sb.from('assignments').select('*').in('content_id', itemIds);
            const { data: allQuizzes } = await sb.from('quiz_results').select('*').in('content_id', itemIds).order('submitted_at', { ascending: true });

            const gradebook = {};
            roster.forEach(s => gradebook[s.user_id] = { email: s.profiles.email, data: {} });
            allAssigns?.forEach(a => { if(gradebook[a.student_id]) gradebook[a.student_id].data[a.content_id] = { type: 'assignment', grade: a.grade || 'Submitted' }; });
            allQuizzes?.forEach(q => { if(gradebook[q.user_id]) { if(!gradebook[q.user_id].data[q.content_id]) gradebook[q.user_id].data[q.content_id] = { type: 'quiz', history: [], best: null }; const info = getGradeInfo(q.score, q.total); gradebook[q.user_id].data[q.content_id].history.push(info.pct); if(!gradebook[q.user_id].data[q.content_id].best || info.pct > gradebook[q.user_id].data[q.content_id].best.pct) gradebook[q.user_id].data[q.content_id].best = info; } });

            let tableHtml = `<div class="flex justify-between items-center mb-4"><h2 class="text-xl font-bold text-gray-800">Class Gradebook</h2><button onclick="courseManager.loadReports()" class="text-sm text-teal-600 hover:underline"><i class="ph ph-arrow-clockwise"></i> Refresh</button></div><div class="overflow-x-auto bg-white rounded-lg shadow border border-gray-200"><table class="w-full text-sm text-left whitespace-nowrap"><thead class="bg-gray-50 text-gray-600 font-bold border-b border-gray-200"><tr><th class="p-4 sticky left-0 bg-gray-50 z-10 border-r">Student</th>${gradableItems.map(i => `<th class="p-4 min-w-[180px] border-r border-gray-100"><div class="text-xs font-bold text-teal-700 mb-1">${i.context}</div><div class="flex items-center gap-1 font-normal text-gray-500">${getContentEmoji(i.type)} ${i.title}</div></th>`).join('')}</tr></thead><tbody class="divide-y divide-gray-100">`;
            roster.forEach(student => {
                const row = gradebook[student.user_id];
                tableHtml += `<tr class="hover:bg-gray-50"><td class="p-4 font-medium text-gray-900 sticky left-0 bg-white border-r border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">${row.email}</td>`;
                gradableItems.forEach(item => {
                    const entry = row.data[item.id];
                    let cellHtml = '<span class="text-gray-300 text-xs italic">Not started</span>';
                    if (entry) {
                        if (entry.type === 'quiz') { cellHtml = `<div class="flex flex-col gap-1"><span class="${entry.best.color} px-2 py-0.5 rounded text-xs font-bold">${entry.best.pct}% (${entry.best.label})</span><div class="text-[10px] text-gray-400">Attempts: ${entry.history.length}</div></div>`; } 
                        else { cellHtml = `<span class="${entry.grade === 'Pass' ? 'text-green-600 bg-green-50' : (entry.grade==='Fail'?'text-red-600 bg-red-50':'text-yellow-600 bg-yellow-50')} px-2 py-1 rounded font-bold text-xs">${entry.grade}</span>`; }
                    }
                    tableHtml += `<td class="p-3 border-r border-gray-50 align-top">${cellHtml}</td>`;
                });
                tableHtml += `</tr>`;
            });
            tableHtml += `</tbody></table></div>`; el.innerHTML = tableHtml; return;
        }

        const { data: assigns } = await sb.from('assignments').select('*').eq('student_id', state.user.id);
        const { data: quizzes } = await sb.from('quiz_results').select('*').eq('user_id', state.user.id).order('submitted_at', { ascending: true });
        const lookup = {}; assigns?.forEach(a => lookup[a.content_id] = { ...a, type: 'assignment' });
        const quizLookup = {}; quizzes?.forEach(q => { if(!quizLookup[q.content_id]) quizLookup[q.content_id] = { history: [], best: null }; const info = getGradeInfo(q.score, q.total); quizLookup[q.content_id].history.push({ ...info, date: new Date(q.submitted_at).toLocaleDateString() }); if(!quizLookup[q.content_id].best || info.pct > quizLookup[q.content_id].best.pct) quizLookup[q.content_id].best = info; });

        let done = 0; gradableItems.forEach(i => { if (lookup[i.id] || (quizLookup[i.id] && quizLookup[i.id].history.length > 0)) done++; });
        const progress = gradableItems.length === 0 ? 0 : Math.round((done/gradableItems.length)*100);

        let html = `<div class="bg-white p-6 rounded-lg shadow border border-gray-200 mb-6"><div class="flex justify-between items-end mb-2"><h2 class="text-lg font-bold text-gray-700">Your Course Progress</h2><span class="text-2xl font-bold text-teal-600">${progress}%</span></div><div class="w-full bg-gray-200 rounded-full h-3"><div class="bg-teal-500 h-3 rounded-full transition-all" style="width: ${progress}%"></div></div></div><div class="space-y-4">`;
        sections?.forEach((sec, idx) => {
            let hasGradable = false; let sectionHtml = `<div class="p-4 border-t border-gray-100 space-y-4">`;
            sec.modules?.forEach(mod => { mod.units?.forEach(unit => { const graded = unit.content?.filter(c => ['assignment','quiz','simulator'].includes(c.type)) || []; if(graded.length > 0) { hasGradable = true; sectionHtml += `<div class="mb-2"><h5 class="text-xs font-bold text-gray-400 uppercase mb-2">${unit.title}</h5><div class="space-y-3">`; graded.forEach(item => { if(item.type === 'quiz') { const qData = quizLookup[item.id]; if(qData) { sectionHtml += `<div class="bg-white border border-gray-200 p-4 rounded-lg shadow-sm"><div class="flex justify-between items-start"><div><span class="font-bold text-gray-800">${item.title}</span><div class="text-xs text-gray-500 mt-1">Attempts: ${qData.history.length}</div></div><span class="${qData.best.color} px-3 py-1 rounded font-bold text-sm">${qData.best.pct}% (${qData.best.label})</span></div></div>`; } else { sectionHtml += `<div class="bg-white border border-gray-200 p-3 rounded flex justify-between items-center opacity-75"><span class="text-sm text-gray-600">${item.title}</span><span class="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">Not Taken</span></div>`; } } else { const data = lookup[item.id]; const status = data ? (data.grade || 'Submitted') : 'Not Started'; const style = data ? (data.grade === 'Pass' ? 'bg-green-100 text-green-800' : (data.grade==='Fail'?'bg-red-100 text-red-800':'bg-yellow-100 text-yellow-800')) : 'bg-gray-100 text-gray-500'; sectionHtml += `<div class="bg-white border border-gray-200 p-3 rounded flex justify-between items-center"><span class="text-sm font-medium text-gray-700">${item.title}</span><span class="${style} px-2 py-1 rounded text-xs font-bold">${status}</span></div>`; } }); sectionHtml += `</div></div>`; } }); }); sectionHtml += `</div>`;
            if(hasGradable) html += `<details ${idx===0 ? 'open' : ''} class="group bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"><summary class="flex justify-between items-center p-4 cursor-pointer bg-gray-50 hover:bg-gray-100 list-none"><h3 class="font-bold text-slate-800 flex items-center gap-2"><i class="ph ph-caret-right transition-transform group-open:rotate-90"></i> ${sec.title}</h3></summary>${sectionHtml}</details>`;
        });
        html += `</div>`; el.innerHTML = html;
    },

    // 6. UTILS
    addUnit: async () => { if(!state.activeModule) return; const t = prompt("Unit Title:"); if(t) { await sb.from('units').insert([{ module_id: state.activeModule.id, title: t }]); courseManager.openModule(state.activeModule.id); }},
    addContent: (unitId) => contentModal.open(unitId),
    deleteItem: async (table, id) => { if(confirm("Delete this item?")) { await sb.from(table).delete().eq('id', id); if(table==='units'||table==='content') courseManager.openModule(state.activeModule.id); else courseManager.loadSyllabus(); } },
    editItem: async (table, id, currentTitle) => {
        const t = prompt(`Rename ${table}:`, currentTitle);
        if(!t) return;
        await sb.from(table).update({ title: t }).eq('id', id);
        if(table === 'sections' || table === 'modules') courseManager.loadSyllabus(); else courseManager.openModule(state.activeModule.id);
    },
    moveItem: async (table, id, direction) => {
        let query = sb.from(table).select('id, position');
        if (table === 'sections') query = query.eq('course_id', state.activeCourse.id);
        else if (table === 'modules') {
            const parentSec = state.structure.find(s => s.modules && s.modules.some(m => m.id === id));
            if(parentSec) query = query.eq('section_id', parentSec.id);
        } else if (table === 'units') query = query.eq('module_id', state.activeModule.id);
        else if (table === 'content') {
            const { data: c } = await sb.from('content').select('unit_id').eq('id', id).single();
            if(c) query = query.eq('unit_id', c.unit_id);
        }
        const { data: items } = await query.order('position', { ascending: true });
        const sorted = items.map((item, idx) => ({ ...item, position: idx }));
        const index = sorted.findIndex(i => i.id === id);
        if (index === -1) return;
        const neighborIndex = direction === 'up' ? index - 1 : index + 1;
        if (neighborIndex < 0 || neighborIndex >= sorted.length) return;
        const temp = sorted[index].position;
        sorted[index].position = sorted[neighborIndex].position;
        sorted[neighborIndex].position = temp;
        for(const item of sorted) await sb.from(table).update({ position: item.position }).eq('id', item.id);
        if (table === 'units' || table === 'content') courseManager.openModule(state.activeModule.id); else courseManager.loadSyllabus();
    },
    
    // NEW CONTROLS (V2)
    toggleVisibility: async (table, id, isVisible) => {
        try { await sb.from(table).update({ is_visible: isVisible }).eq('id', id); ui.toast("Visibility updated", "success"); }
        catch(e) { ui.toast("Error updating", "error"); }
    },
    updateHours: async (unitId, hours) => {
        try {
            await sb.from('units').update({ total_hours_required: hours }).eq('id', unitId);
            state.structure.forEach(s => s.modules?.forEach(m => m.units?.forEach(u => { if(u.id == unitId) u.total_hours_required = parseFloat(hours); })));
            if(!document.getElementById('tab-schedule').classList.contains('hidden')) schedulerManager.renderSidebar(); 
        } catch (e) { ui.toast("Error updating hours", "error"); }
    },

    // 7. LAUNCHER
    launchContent: async (id, type, url) => {
        const { data: content } = await sb.from('content').select('allow_download').eq('id', id).single();
        const allowDl = content ? content.allow_download : false;
        sb.from('activity_logs').insert([{ user_id: state.user.id, content_id: id, action_type: 'viewed' }]).then(()=>{});
        const canDownload = isAdmin() || allowDl; 

        if(type === 'simulator') { const cleanUrl = url.split('?')[0]; window.open(`${cleanUrl}?auth=msletb_secure_launch&uid=${state.user.id}&cid=${id}`, '_blank'); }
        else if (type === 'audio') { const m = document.getElementById('modal-audio'); const p = document.getElementById('audio-player'); if(m && p) { p.src = url; m.classList.remove('hidden'); if(!canDownload) p.setAttribute('controlsList', 'nodownload'); else p.removeAttribute('controlsList'); } }
        else if (type === 'file' || type === 'video') { courseManager.openViewer(url, type, canDownload); }
        else if (type === 'assignment') { isAdmin() ? assignmentManager.openGrading(id) : assignmentManager.openSubmit(id); }
        else if (type === 'quiz') { isAdmin() ? alert("Admins cannot take quizzes.") : quizManager.takeQuiz(id); }
        else if (url) { window.open(url, '_blank'); }
    },
    openViewer: (url, type, canDownload) => {
        const modal = document.getElementById('modal-viewer');
        const body = document.getElementById('viewer-body');
        const dlBtn = document.getElementById('viewer-download-btn');
        modal.classList.remove('hidden');
        if(dlBtn) { dlBtn.classList.toggle('hidden', !canDownload); dlBtn.href = canDownload ? url : '#'; }
        
        body.innerHTML = '<div class="text-white flex items-center justify-center h-full"><i class="ph ph-spinner animate-spin text-4xl"></i></div>'; 
        const ext = url.split('?')[0].split('.').pop().toLowerCase();
        
        if (url.includes('youtube') || url.includes('youtu.be')) {
            let videoId = url.split('v=')[1]?.split('&')[0] || url.split('youtu.be/')[1]?.split('?')[0];
            if(videoId) body.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}" class="w-full h-full border-0" allowfullscreen></iframe>`;
        }
        else if (type === 'video' || ['mp4', 'webm'].includes(ext)) { body.innerHTML = `<video src="${url}" ${canDownload?'controls':'controls controlsList="nodownload"'} class="max-h-full max-w-full shadow-lg rounded"></video>`; } 
        else if (['pdf', 'jpg', 'png'].includes(ext)) { body.innerHTML = `<iframe src="${url}#toolbar=0" class="w-full h-full border-0 bg-white"></iframe>`; } 
        else { body.innerHTML = `<div class="text-white text-center p-8"><p class="text-xl">Preview not available.</p>${canDownload ? `<a href="${url}" target="_blank" class="text-teal-400 underline">Download</a>` : ''}</div>`; }
    },
    closeViewer: () => { document.getElementById('modal-viewer').classList.add('hidden'); document.getElementById('viewer-body').innerHTML=''; },
    closeAudio: () => { const m = document.getElementById('modal-audio'); if(m) m.classList.add('hidden'); document.getElementById('audio-player')?.pause(); }
};

// ==========================================
// 5. SCHEDULER MANAGER
// ==========================================
// ==========================================
// 5. SCHEDULER MANAGER
// ==========================================
// ==========================================
// 5. SCHEDULER MANAGER
// ==========================================
// ==========================================
// 5. SCHEDULER MANAGER (Fixed: Auto-Refresh Units)
// ==========================================
const schedulerManager = {
    currentDate: new Date(),
    schedules: [],

    init: async () => {
        if(typeof isAdmin !== 'undefined' && isAdmin()) {
             const btn = document.getElementById('tab-btn-schedule');
             if(btn) btn.classList.remove('hidden');
        }
        
        // FIX: Always reload structure so new Units/Modules appear immediately
        await courseManager.loadSyllabus(true);
        
        await schedulerManager.fetchData();
        schedulerManager.renderSidebar();
        schedulerManager.renderCalendar();
    },

    fetchData: async () => {
        const { data, error } = await sb.from('schedules')
            .select('*')
            .eq('course_id', state.activeCourse.id);
            
        if(error) console.error("Schedule Error:", error);
        schedulerManager.schedules = data || [];
    },

    renderSidebar: () => {
        const list = document.getElementById('scheduler-sidebar');
        if (!list) return;
        list.innerHTML = '';
        
        const map = {};
        schedulerManager.schedules.forEach(s => { if(s.unit_id) map[s.unit_id] = (map[s.unit_id]||0) + s.hours_assigned; });

        state.structure.forEach(section => {
            const modules = section.modules?.sort((a,b)=>a.position-b.position) || [];
            modules.forEach(mod => {
                if(!mod.units?.length) return;
                
                const details = document.createElement('details');
                details.open = true;
                details.className = "mb-2 group border border-gray-200 rounded bg-white overflow-hidden";
                details.innerHTML = `
                    <summary class="flex items-center gap-2 p-2 bg-gray-50 cursor-pointer list-none text-xs font-bold text-gray-600 uppercase">
                        <div class="w-2 h-2 rounded-full" style="background:${mod.color}"></div>
                        <span class="flex-1 truncate">${mod.title}</span>
                        <i class="ph ph-caret-down transition group-open:rotate-180"></i>
                    </summary>
                    <div class="unit-list p-2 space-y-1 bg-white"></div>
                `;
                
                const cont = details.querySelector('.unit-list');
                
                mod.units.sort((a,b)=>a.position-b.position).forEach(u => {
                    const scheduled = map[u.id] || 0;
                    const total = u.total_hours_required || 0;
                    const done = total > 0 && scheduled >= total;
                    const pct = total > 0 ? Math.min((scheduled/total)*100, 100) : 0;

                    const el = document.createElement('div');
                    el.draggable = true;
                    el.className = `p-2 border rounded cursor-grab hover:shadow-md bg-white ${done ? 'border-green-300' : 'border-gray-200'}`;
                    el.ondragstart = (e) => { 
                        e.dataTransfer.setData('type','unit'); 
                        e.dataTransfer.setData('id',u.id); 
                        e.dataTransfer.setData('title',u.title); 
                    };
                    
                    el.innerHTML = `
                        <div class="flex justify-between text-[10px] font-bold text-gray-700 mb-1">
                            <span class="truncate">${u.title}</span>
                            ${done ? '<i class="ph ph-check-circle text-green-500"></i>' : ''}
                        </div>
                        <div class="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div class="h-full ${done?'bg-green-500':'bg-teal-500'}" style="width:${pct}%"></div>
                        </div>
                        <div class="text-[9px] text-right text-gray-400 mt-0.5">${scheduled}/${total}h</div>
                    `;
                    cont.appendChild(el);
                });
                list.appendChild(details);
            });
        });
    },

    dragMisc: (e, type) => {
        e.dataTransfer.setData('type', type);
        let title = type === 'exam' ? 'Exam' : (type === 'holiday' ? 'Holiday' : 'Other');
        e.dataTransfer.setData('title', title);
    },

    handleDrop: async (e, dateStr) => {
        e.preventDefault();
        const type = e.dataTransfer.getData('type');
        
        if (type === 'move') {
            const moveId = e.dataTransfer.getData('moveId');
            await sb.from('schedules').update({ date: dateStr }).eq('id', moveId);
            schedulerManager.init();
            return;
        }

        const modal = document.getElementById('modal-sched-action');
        const titleEl = document.getElementById('sched-modal-title');
        const confirmBtn = document.getElementById('btn-sched-confirm');
        const inputHours = document.getElementById('sched-input-hours');
        const inputInsert = document.getElementById('sched-input-insert');

        let title = e.dataTransfer.getData('title');
        let unitId = e.dataTransfer.getData('id');


        titleEl.innerText = title;
        modal.classList.remove('hidden');
        inputHours.value = 6.5; 
        inputInsert.checked = false;

        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

        newBtn.onclick = async () => {
            const hours = parseFloat(inputHours.value);
            
            modal.classList.add('hidden');
            ui.toast("Scheduling...", "info");

            if (inputInsert.checked) await schedulerManager.shiftFutureItems(dateStr, 1);

            await sb.from('schedules').insert([{
                course_id: state.activeCourse.id,
                unit_id: type === 'unit' ? parseInt(unitId) : null,
                type: type, 
                label: type !== 'unit' ? title : null,
                date: dateStr,
                hours_assigned: hours
            }]);

            schedulerManager.init();
        };
    },

    renderCalendar: () => {
        const container = document.getElementById('calCont');
        if (!container) return;

        const year = schedulerManager.currentDate.getFullYear();
        const month = schedulerManager.currentDate.getMonth();
        const monthName = schedulerManager.currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

        container.innerHTML = `
            <div class="p-4 border-b flex justify-between items-center bg-white sticky top-0 z-20">
                <div class="flex gap-2">
                    <button onclick="schedulerManager.changeMonth(-1)" class="p-1 hover:bg-gray-100 rounded text-gray-600"><i class="ph ph-caret-left text-xl"></i></button>
                    <button onclick="schedulerManager.changeMonth(1)" class="p-1 hover:bg-gray-100 rounded text-gray-600"><i class="ph ph-caret-right text-xl"></i></button>
                </div>
                <h2 class="font-bold text-lg text-slate-800 capitalize">${monthName}</h2>
                <div class="relative group">
                    <button class="bg-slate-800 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 hover:bg-slate-700">Tools <i class="ph ph-caret-down"></i></button>
                    <div class="absolute right-0 top-full mt-1 bg-white border border-gray-200 shadow-xl rounded w-48 hidden group-hover:block z-50">
                        <button onclick="schedulerManager.resetDates()" class="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-700">📅 Reset Start Date</button>
                        <button onclick="schedulerManager.clearAll()" class="w-full text-left px-4 py-2 text-sm hover:bg-red-50 text-red-600">🗑️ Clear Schedule</button>
                    </div>
                </div>
            </div>
            <div class="cal-container bg-white">
                <div class="cal-header"><div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div></div>
                <div id="cal-grid" class="cal-grid"></div>
            </div>
        `;

        const grid = container.querySelector('#cal-grid');
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const holidays = (typeof getIrishHolidays === 'function') ? getIrishHolidays(year) : [];

        for (let i = 0; i < firstDay; i++) {
            grid.innerHTML += `<div class="cal-cell bg-gray-50/50"></div>`;
        }

        const getUnitDetails = (uid) => {
            for(const sec of state.structure) {
                for(const mod of (sec.modules||[])) {
                    const u = mod.units?.find(x => x.id == uid);
                    if(u) return { title: u.title, color: mod.color };
                }
            }
            return null;
        };

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isWeekend = new Date(dateStr).getDay() === 0 || new Date(dateStr).getDay() === 6;
            const isHoliday = holidays.includes(dateStr);
            const isBlocked = isWeekend || isHoliday;

            const cell = document.createElement('div');
            cell.className = `cal-cell ${isBlocked ? 'cal-blocked' : ''}`;
            cell.innerHTML = `<div class="cal-day-num ${isBlocked ? 'text-red-300' : ''}">${d}</div>`;
            
            if (isHoliday) {
                cell.innerHTML += `<div class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20"><span class="text-xs font-bold text-red-600 uppercase -rotate-12 border-2 border-red-600 p-1 rounded">Holiday</span></div>`;
            }

            if (!isBlocked) {
                cell.ondragover = (e) => e.preventDefault();
                cell.ondrop = (e) => schedulerManager.handleDrop(e, dateStr);

                const items = schedulerManager.schedules.filter(s => s.date === dateStr);
                items.forEach(item => {
                    const div = document.createElement('div');
                    div.className = "slot-item";
                    div.draggable = true;
                    
                    let borderColor = '#3b82f6'; 
                    let bgColor = '#eff6ff';
                    let textColor = '#1e40af';
                    let displayLabel = item.label || 'Item';

                    if (item.type === 'unit' && item.unit_id) {
                         const details = getUnitDetails(item.unit_id);
                         if(details) {
                             bgColor = details.color; 
                             borderColor = '#94a3b8';
                             textColor = '#334155';
                             displayLabel = details.title;
                         }
                    } else if (item.type === 'exam') {
                        borderColor = '#9333ea'; bgColor = '#f3e8ff'; textColor = '#6b21a8';
                    } else if (item.type === 'holiday') {
                        borderColor = '#ef4444'; bgColor = '#fef2f2'; textColor = '#991b1b';
                    } else if (item.type === 'other') {
                        borderColor = '#f59e0b'; bgColor = '#fffbeb'; textColor = '#92400e';
                    }

                    div.style.borderLeftColor = borderColor;
                    div.style.backgroundColor = bgColor;
                    div.style.color = textColor;
                    div.innerHTML = `<strong>${item.hours_assigned || 0}h</strong> ${displayLabel}`;
                    
                    div.onclick = (e) => { e.stopPropagation(); schedulerManager.openContextMenu(item, e); };
                    div.ondragstart = (e) => { e.dataTransfer.setData('moveId', item.id); e.dataTransfer.setData('type', 'move'); };

                    cell.appendChild(div);
                });
            }
            grid.appendChild(cell);
        }
    },

    changeMonth: (delta) => {
        schedulerManager.currentDate.setMonth(schedulerManager.currentDate.getMonth() + delta);
        schedulerManager.renderCalendar();
    },

    openContextMenu: (item, e) => {
        const menu = document.getElementById('modal-sched-ctx');
        const title = document.getElementById('ctx-item-title');
        const dateEl = document.getElementById('ctx-item-date');
        
        let displayLabel = item.label || 'Item';
        if(item.type === 'unit' && item.unit_id && state.structure) {
             for(const sec of state.structure) {
                 for(const mod of (sec.modules||[])) {
                     const u = mod.units?.find(x => x.id == item.unit_id);
                     if(u) displayLabel = u.title;
                 }
             }
        }

        title.innerText = displayLabel;
        dateEl.innerText = new Date(item.date).toDateString();
        
        menu.classList.remove('hidden');

        document.getElementById('btn-ctx-delete').onclick = () => schedulerManager.deleteSlot(item.id);
        document.getElementById('btn-ctx-global-back').onclick = () => schedulerManager.shiftGlobal(item.date, -1);
        document.getElementById('btn-ctx-global-fwd').onclick = () => schedulerManager.shiftGlobal(item.date, 1);

        const modId = item.type==='unit' ? state.structure.flatMap(s=>s.modules).find(m=>m.units.some(u=>u.id==item.unit_id))?.id : null;
        const modBtns = ['btn-ctx-mod-back', 'btn-ctx-mod-fwd'];
        
        if (modId) {
            document.getElementById('btn-ctx-mod-back').onclick = () => schedulerManager.shiftModule(modId, item.date, -1);
            document.getElementById('btn-ctx-mod-fwd').onclick = () => schedulerManager.shiftModule(modId, item.date, 1);
            modBtns.forEach(id => document.getElementById(id).classList.remove('opacity-50', 'pointer-events-none'));
        } else {
            modBtns.forEach(id => document.getElementById(id).classList.add('opacity-50', 'pointer-events-none'));
        }
    },

    deleteSlot: async (id) => {
        if(confirm("Delete this slot?")) {
            await sb.from('schedules').delete().eq('id', id);
            document.getElementById('modal-sched-ctx').classList.add('hidden');
            schedulerManager.init();
        }
    },

    shiftFutureItems: async (fromDateStr, days) => {
        const { data: items } = await sb.from('schedules').select('*')
            .eq('course_id', state.activeCourse.id)
            .gte('date', fromDateStr);
            
        if (!items || items.length === 0) return;

        const addWorkingDays = (startDate, days) => {
             let current = new Date(startDate);
             let added = 0;
             const direction = days > 0 ? 1 : -1;
             days = Math.abs(days);
             while (added < days) {
                 current.setDate(current.getDate() + direction);
                 const d = current.getDay();
                 if (d !== 0 && d !== 6) added++;
             }
             return current;
        };

        for (const item of items) {
            const oldDate = new Date(item.date);
            const newDate = addWorkingDays(oldDate, days);
            await sb.from('schedules').update({ date: newDate.toISOString().split('T')[0] }).eq('id', item.id);
        }
    },

    shiftGlobal: async (fromDateStr, direction) => {
        document.getElementById('modal-sched-ctx').classList.add('hidden');
        ui.toast("Shifting schedule...", "info");
        await schedulerManager.shiftFutureItems(fromDateStr, direction);
        schedulerManager.init();
    },

    shiftModule: async (moduleId, fromDateStr, direction) => {
        document.getElementById('modal-sched-ctx').classList.add('hidden');
        ui.toast("Shifting module...", "info");
        
        const { data: units } = await sb.from('units').select('id').eq('module_id', moduleId);
        const unitIds = units.map(u => u.id);
        
        const { data: items } = await sb.from('schedules').select('*')
            .eq('course_id', state.activeCourse.id)
            .in('unit_id', unitIds)
            .gte('date', fromDateStr);
            
        if (!items) return;

        const addWorkingDays = (startDate, days) => {
             let current = new Date(startDate);
             let added = 0;
             const direction = days > 0 ? 1 : -1;
             days = Math.abs(days);
             while (added < days) {
                 current.setDate(current.getDate() + direction);
                 const d = current.getDay();
                 if (d !== 0 && d !== 6) added++;
             }
             return current;
        };

        for (const item of items) {
            const newDate = addWorkingDays(new Date(item.date), direction);
            await sb.from('schedules').update({ date: newDate.toISOString().split('T')[0] }).eq('id', item.id);
        }
        schedulerManager.init();
    },

    clearAll: async () => {
        if(confirm("⚠ WARNING: Delete ENTIRE schedule?")) {
            await sb.from('schedules').delete().eq('course_id', state.activeCourse.id);
            schedulerManager.init();
        }
    },

    resetDates: async () => { alert("Use context menu 'Shift Schedule' on calendar items instead."); }
};

// ==========================================
// 6. OTHER MODALS (Quiz, Assignments, Entity)
// ==========================================
const assignmentManager = {
    openSubmit: (contentId) => {
        document.getElementById('modal-submit-assignment').classList.remove('hidden');
        document.getElementById('input-submit-file').dataset.cid = contentId;
    },
    closeSubmit: () => document.getElementById('modal-submit-assignment').classList.add('hidden'),
    submit: async () => {
        const fileIn = document.getElementById('input-submit-file');
        const file = fileIn.files[0];
        const cid = fileIn.dataset.cid;
        const comment = document.getElementById('input-submit-comment').value;
        
        if(!file && !comment) return ui.toast("File or comment required", "error");
        
        let fileUrl = null;
        if(file) {
            const path = `assignments/${state.user.id}_${Date.now()}_${file.name}`;
            await sb.storage.from('course_content').upload(path, file);
            const { data } = sb.storage.from('course_content').getPublicUrl(path);
            fileUrl = data.publicUrl;
        }
        
        await sb.from('assignments').insert([{ 
            course_id: state.activeCourse.id, 
            content_id: cid, 
            student_id: state.user.id, 
            file_url: fileUrl,
            comments: comment,
            grade: 'Submitted'
        }]);
        ui.toast("Submitted!", "success"); 
        assignmentManager.closeSubmit();
        courseManager.openModule(state.activeModule.id);
    },
    openGrading: async (contentId) => {
        const m = document.getElementById('modal-grade-assignment'); m.classList.remove('hidden');
        const list = document.getElementById('grading-list'); list.innerHTML = 'Loading...';
        const { data } = await sb.from('assignments').select('*, profiles(email)').eq('content_id', contentId);
        
        if(!data || data.length === 0) { list.innerHTML = '<p class="p-4 text-gray-500">No submissions.</p>'; return; }

        list.innerHTML = data.map(sub => `
            <div class="border-b p-3 flex justify-between items-center bg-white mb-2 rounded shadow-sm">
                <div>
                    <div class="font-bold text-sm">${sub.profiles?.email || 'Unknown'}</div>
                    ${sub.file_url ? `<a href="${sub.file_url}" target="_blank" class="text-blue-600 text-xs hover:underline flex items-center gap-1"><i class="ph ph-download"></i> File</a>` : ''}
                    ${sub.comments ? `<div class="text-xs text-gray-500 italic">"${sub.comments}"</div>` : ''}
                </div>
                <div class="flex gap-2">
                    <span class="text-xs font-bold px-2 py-1 rounded ${sub.grade==='Pass'?'bg-green-100 text-green-700':(sub.grade==='Fail'?'bg-red-100 text-red-700':'bg-yellow-100 text-yellow-700')}">${sub.grade || 'Pending'}</span>
                    <select onchange="assignmentManager.grade(${sub.id}, this.value)" class="border p-1 text-xs rounded">
                        <option value="">Grade...</option><option value="Pass">Pass</option><option value="Fail">Fail</option><option value="Credit">Credit</option>
                    </select>
                </div>
            </div>`).join('');
    },
    closeGrading: () => document.getElementById('modal-grade-assignment').classList.add('hidden'),
    grade: async (id, val) => { await sb.from('assignments').update({ grade: val }).eq('id', id); ui.toast("Graded!"); assignmentManager.openGrading(assignmentManager.contentId); } 
};

const quizManager = {
    // UI: Add Question input fields
    addQuestionUI: (data = null) => {
        const div = document.createElement('div');
        div.className = "question-card-ui border p-4 rounded-lg bg-slate-50 mb-4 shadow-sm relative group border-l-4 border-l-teal-500";
        const unique = Date.now() + Math.random().toString(16).slice(2);
        
        div.innerHTML = `
            <div class="mb-4 space-y-2">
                <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide">Question Text</label>
                <input placeholder="Type your question here..." class="w-full border border-gray-300 p-2.5 rounded text-sm q-text focus:ring-2 focus:ring-teal-500 outline-none shadow-sm" 
                    value="${data ? (data.text || data.question).replace(/"/g, '&quot;') : ''}"
                    onpaste="quizManager.handleImagePaste(event, this)">
                
                <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mt-2">Question Image (Optional)</label>
                <div class="flex items-center gap-2">
                    <div class="flex-1 relative">
                        <i class="ph ph-link absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                        <input placeholder="Image URL or Paste Screenshot (Ctrl+V)" 
                            class="w-full border border-gray-300 p-2 pl-9 rounded text-xs bg-white q-image text-gray-600 focus:ring-2 focus:ring-teal-500 outline-none" 
                            value="${data && data.image ? data.image : ''}"
                            onpaste="quizManager.handleImagePaste(event, this)">
                    </div>
                    <label class="cursor-pointer bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded text-xs font-bold flex items-center gap-2 transition shadow-sm">
                        <i class="ph ph-upload-simple text-teal-600 text-lg"></i> Upload
                        <input type="file" accept="image/*" class="hidden" onchange="quizManager.uploadQuestionImage(this)">
                    </label>
                </div>
            </div>

            <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Answers (Select the correct one)</label>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                ${[0,1,2,3].map(i => `
                    <div class="flex items-center bg-white border border-gray-200 rounded p-2 focus-within:border-teal-500 focus-within:ring-1 focus-within:ring-teal-500 transition shadow-sm">
                        <input type="radio" name="correct-${unique}" value="${i}" class="mx-2 w-4 h-4 text-teal-600 focus:ring-teal-500 cursor-pointer" ${data && parseInt(data.correct) === i ? 'checked' : (i===0 && !data ? 'checked' : '')}>
                        <input placeholder="Option ${i+1}" class="w-full p-1 text-sm outline-none bg-transparent q-opt" value="${data && data.options[i] ? data.options[i].replace(/"/g, '&quot;') : ''}">
                    </div>
                `).join('')}
            </div>
            
            <button onclick="this.closest('.question-card-ui').remove()" class="absolute top-2 right-2 text-gray-300 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition" title="Delete Question">
                <i class="ph ph-trash text-xl"></i>
            </button>
        `;
        document.getElementById('quiz-questions-list').appendChild(div);
    },

    uploadQuestionImage: async (input) => {
        const file = input.files[0];
        if (!file) return;
        const textInput = input.closest('.flex').querySelector('.q-image');
        const originalPlaceholder = textInput.placeholder;
        textInput.value = '';
        textInput.placeholder = "⏳ Uploading image...";
        textInput.disabled = true;

        try {
            const ext = file.name.split('.').pop();
            const path = `quiz_images/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;
            const { error } = await sb.storage.from('course_content').upload(path, file);
            if (error) throw error;
            const { data } = sb.storage.from('course_content').getPublicUrl(path);
            textInput.value = data.publicUrl;
            ui.toast("Image uploaded!", "success");
        } catch (e) {
            console.error(e); ui.toast("Upload failed", "error");
        } finally {
            textInput.disabled = false; textInput.placeholder = originalPlaceholder;
        }
    },

    handleImagePaste: async (e, inputEl) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        let file = null;
        for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf("image") === 0) { file = items[i].getAsFile(); break; } }
        if (!file) return; 
        e.preventDefault(); 
        const row = inputEl.closest('.question-card-ui'); 
        const imgInput = row.querySelector('.q-image');
        imgInput.placeholder = "⏳ Uploading pasted image...";
        imgInput.disabled = true;
        try {
            const path = `quiz_images/${Date.now()}_paste.png`;
            const { error } = await sb.storage.from('course_content').upload(path, file);
            if (error) throw error;
            const { data } = sb.storage.from('course_content').getPublicUrl(path);
            imgInput.value = data.publicUrl;
            ui.toast("Pasted image uploaded!", "success");
        } catch (err) { ui.toast("Paste upload failed", "error"); } finally { imgInput.disabled = false; }
    },

    takeQuiz: async (id) => {
        const { data } = await sb.from('content').select('*').eq('id', id).single();
        if(!data || !data.data?.questions) return ui.toast("Error loading quiz", "error");
        
        document.getElementById('modal-take-quiz').classList.remove('hidden');
        document.getElementById('quiz-title-display').innerText = data.title;
        const container = document.getElementById('quiz-body');
        container.innerHTML = '';
        container.dataset.id = id; 

        let allQuestions = [...data.data.questions]; 
        // Shuffle
        for (let i = allQuestions.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]]; }
        
        const limit = data.data.questionCount || 10;
        const selectedQuestions = allQuestions.slice(0, limit);
        container.dataset.questions = JSON.stringify(selectedQuestions);

        selectedQuestions.forEach((q, idx) => {
            const qEl = document.createElement('div');
            qEl.className = "mb-4 border-b pb-4";
            const displayQuestion = q.text || q.question || "Question";
            const imgHtml = q.image ? `<img src="${q.image}" class="max-w-full h-auto max-h-64 rounded mb-3 border border-gray-200 block shadow-sm">` : '';
            
            qEl.innerHTML = `
                <p class="font-bold mb-3 text-gray-800 text-lg">${idx+1}. ${displayQuestion}</p>
                ${imgHtml}
                <div class="space-y-2">
                    ${q.options.map((opt, i) => `
                        <label class="flex items-center gap-3 p-3 border border-gray-200 hover:bg-teal-50 hover:border-teal-200 rounded-lg cursor-pointer transition group">
                            <input type="radio" name="q-${idx}" value="${i}" class="w-4 h-4 text-teal-600 focus:ring-teal-500"> 
                            <span class="text-sm text-gray-700 group-hover:text-teal-900">${opt}</span>
                        </label>
                    `).join('')}
                </div>
            `;
            container.appendChild(qEl);
        });
    },

    closeTakeQuiz: () => document.getElementById('modal-take-quiz').classList.add('hidden'),

    submitQuiz: async () => {
        const container = document.getElementById('quiz-body');
        const questions = JSON.parse(container.dataset.questions);
        let score = 0;
        let userAnswers = []; 
        
        questions.forEach((q, idx) => {
            const selected = document.querySelector(`input[name="q-${idx}"]:checked`);
            const val = selected ? parseInt(selected.value) : -1;
            userAnswers.push(val);
            if(val === parseInt(q.correct)) score++;
        });

        await sb.from('quiz_results').insert([{ user_id: state.user.id, content_id: container.dataset.id, score: score, total: questions.length }]);
        ui.toast(`Submitted! Score: ${score}/${questions.length}`, "success");
        quizManager.renderReview(questions, userAnswers, score);
    },

    renderReview: (questions, userAnswers, score) => {
        const container = document.getElementById('quiz-body');
        const percentage = Math.round((score / questions.length) * 100);
        let html = `<div class="text-center mb-6 border-b pb-4"><h2 class="text-3xl font-bold ${percentage >= 50 ? 'text-green-600' : 'text-red-600'}">${percentage}%</h2><p class="text-gray-500">You scored ${score} out of ${questions.length}</p></div><div class="space-y-6">`;

        questions.forEach((q, idx) => {
            const userAns = userAnswers[idx];
            const correctAns = parseInt(q.correct);
            const isCorrect = userAns === correctAns;
            const boxClass = isCorrect ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200";
            const imgHtml = q.image ? `<img src="${q.image}" class="max-w-full h-auto max-h-48 rounded mb-2 border border-gray-200 block">` : '';

            html += `<div class="p-4 rounded-lg border ${boxClass}"><p class="font-bold text-gray-800 mb-2">Q${idx+1}: ${q.text}</p>${imgHtml}<div class="space-y-1 ml-2 mt-3">`;
            q.options.forEach((opt, i) => {
                let style = "text-gray-500"; let icon = `<i class="ph ph-circle text-gray-300"></i>`;
                if (i === correctAns) { style = "font-bold text-green-700 bg-green-100 p-1 rounded"; icon = `<i class="ph ph-check-circle text-green-600 text-lg"></i>`; }
                if (i === userAns && !isCorrect) { style = "font-bold text-red-600 bg-red-100 p-1 rounded"; icon = `<i class="ph ph-x-circle text-red-600 text-lg"></i>`; }
                html += `<div class="flex items-center gap-2 text-sm ${style}">${icon} ${opt}</div>`;
            });
            html += `</div></div>`;
        });
        html += `</div>`;
        container.innerHTML = html;
        const footerBtn = document.querySelector('#modal-take-quiz .border-t button');
        if(footerBtn) { footerBtn.innerText = "Close Results"; footerBtn.className = "px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded font-bold shadow"; footerBtn.onclick = () => quizManager.closeTakeQuiz(); }
    }
};

const entityModal = {
    type: null, id: null, parentId: null,
    
    openFromEl: (el, type) => {
        const id = el.dataset.id;
        const title = el.dataset.title;
        const desc = el.dataset.desc;
        const image = el.dataset.image;
        entityModal.open(type, id, title, desc, image);
    },

    open: async (type, id = null, title = '', desc = '', image = '', parentId = null) => {
        entityModal.type = type; entityModal.id = id; entityModal.parentId = parentId;
        document.getElementById('modal-entity').classList.remove('hidden');
        document.getElementById('entity-modal-title').innerText = (id ? 'Edit ' : 'New ') + type.charAt(0).toUpperCase() + type.slice(1);
        document.getElementById('entity-title').value = title;
        document.getElementById('entity-desc').value = desc;
        document.getElementById('entity-image-file').value = ''; 
        document.getElementById('entity-image-url').value = image.startsWith('http') ? image : '';
        document.getElementById('entity-desc-wrapper').classList.toggle('hidden', type !== 'course');
        
        let item = null;
        if(id) {
            const { data } = await sb.from(type + 's').select('*').eq('id', id).single();
            item = data;
        }

        document.getElementById('entity-visible').checked = item ? (item.is_visible !== false) : true;
        const hrsWrapper = document.getElementById('entity-hours-wrapper');
        if(type === 'unit') {
            hrsWrapper.classList.remove('hidden');
            document.getElementById('entity-hours').value = item ? (item.total_hours_required || 0) : 0;
        } else {
            hrsWrapper.classList.add('hidden');
        }
        entityModal.toggleImageSource();
    },
    
    close: () => document.getElementById('modal-entity').classList.add('hidden'),
    
    toggleImageSource: () => {
        const source = document.querySelector('input[name="entity-img-source"]:checked').value;
        const fileInput = document.getElementById('entity-image-file');
        const urlInput = document.getElementById('entity-image-url');
        if (source === 'url') { fileInput.classList.add('hidden'); urlInput.classList.remove('hidden'); } 
        else { fileInput.classList.remove('hidden'); urlInput.classList.add('hidden'); }
    },

    save: async () => {
        const btn = document.getElementById('btn-save-entity'); const originalText = btn.innerText;
        btn.innerText = '⏳ Saving...'; btn.disabled = true;

        try {
            const title = document.getElementById('entity-title').value;
            const desc = document.getElementById('entity-desc').value;
            const isVisible = document.getElementById('entity-visible').checked;
            const totalHours = document.getElementById('entity-hours').value;
            
            let imageUrl = null;
            if(document.getElementById('entity-image-url') && !document.getElementById('entity-image-url').classList.contains('hidden')) {
                 imageUrl = document.getElementById('entity-image-url').value;
            } else {
                 const fileInput = document.getElementById('entity-image-file');
                 if (fileInput && fileInput.files.length > 0) {
                    const file = fileInput.files[0];
                    const path = `covers/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9]/g,'_')}`;
                    await sb.storage.from('course_content').upload(path, file);
                    const { data } = sb.storage.from('course_content').getPublicUrl(path);
                    imageUrl = data.publicUrl;
                 }
            }
            
            if(!title) throw new Error("Title required");
            const data = { title, is_visible: isVisible };
            if(entityModal.type === 'course') { data.description = desc; if(imageUrl) data.image_url = imageUrl; }
            if(entityModal.type === 'unit') data.total_hours_required = totalHours;

            if (entityModal.id) await sb.from(entityModal.type + 's').update(data).eq('id', entityModal.id);
            else {
                if (entityModal.type === 'section') data.course_id = state.activeCourse.id;
                else if (entityModal.type === 'module') data.section_id = entityModal.parentId;
                await sb.from(entityModal.type + 's').insert([data]);
            }
            ui.toast("Saved!", "success"); entityModal.close();
            if (entityModal.type === 'course') dashboard.loadCourses(); else courseManager.loadSyllabus();

        } catch(e) { console.error(e); ui.toast(e.message, 'error'); } 
        finally { btn.innerText = originalText; btn.disabled = false; }
    } 
};

const contentModal = {
    targetUnitId: null, editId: null, currentData: null, 

    open: (unitId, item = null) => {
        contentModal.targetUnitId = unitId; contentModal.editId = item ? item.id : null; contentModal.currentData = item;
        const modal = document.getElementById('modal-add-content'); modal.classList.remove('hidden');
        
        document.getElementById('input-content-title').value = item ? item.title : '';
        document.getElementById('input-content-desc').value = (item && item.data) ? item.data.description : '';
        document.getElementById('input-content-url').value = (item && item.type === 'url') ? item.file_url : '';
        document.getElementById('input-content-file').value = ''; 
        
        const typeSelect = document.getElementById('input-content-type');
        if (item) { typeSelect.value = item.type; typeSelect.disabled = true; } 
        else { typeSelect.value = 'file'; typeSelect.disabled = false; }

        // Quiz Questions
        document.getElementById('quiz-questions-list').innerHTML = ''; 
        if (item && item.type === 'quiz' && item.data && item.data.questions) {
            item.data.questions.forEach(q => quizManager.addQuestionUI(q));
        }

        contentModal.toggleFields();
    },

    close: () => { document.getElementById('modal-add-content').classList.add('hidden'); },
    
    toggleFields: () => {
        const type = document.getElementById('input-content-type').value;
        const descWrapper = document.getElementById('desc-wrapper');
        const quizWrapper = document.getElementById('quiz-wrapper');
        const sourceWrapper = document.getElementById('source-wrapper');
        
        descWrapper.classList.add('hidden'); quizWrapper.classList.add('hidden'); sourceWrapper.classList.remove('hidden');
        if (type === 'assignment') { descWrapper.classList.remove('hidden'); document.getElementById('lbl-source').innerText = "Brief (Optional)"; } 
        else if (type === 'quiz') { quizWrapper.classList.remove('hidden'); sourceWrapper.classList.add('hidden'); } 
        else if (type === 'simulator') { sourceWrapper.classList.add('hidden'); }
        else { document.getElementById('lbl-source').innerText = "Source"; }

        const source = document.querySelector('input[name="source"]:checked').value;
        const urlInput = document.getElementById('input-content-url');
        const fileUI = document.getElementById('file-upload-ui');
        if(source === 'url') { urlInput.classList.remove('hidden'); fileUI.classList.add('hidden'); }
        else { urlInput.classList.add('hidden'); fileUI.classList.remove('hidden'); }
    },

    save: async () => {
        const btn = document.getElementById('btn-save-content'); btn.innerText = '⏳ Saving...'; btn.disabled = true;
        try {
            const unitId = contentModal.targetUnitId;
            const type = document.getElementById('input-content-type').value;
            const title = document.getElementById('input-content-title').value;
            const desc = document.getElementById('input-content-desc').value;
            const source = document.querySelector('input[name="source"]:checked').value;
            
            if(!title) throw new Error("Title required");

            let finalUrl = contentModal.currentData ? contentModal.currentData.file_url : null;
            let metaData = contentModal.currentData ? (contentModal.currentData.data || {}) : {};

            if(type === 'quiz') {
                const qEls = document.querySelectorAll('#quiz-questions-list > .question-card-ui');
                if (qEls.length > 0) {
                    const questions = Array.from(qEls).map(div => ({
                        text: div.querySelector('.q-text').value,
                        image: div.querySelector('.q-image').value.trim(), 
                        options: Array.from(div.querySelectorAll('.q-opt')).map(i => i.value),
                        correct: div.querySelector('input[type="radio"]:checked')?.value || 0
                    }));
                    metaData.questions = questions;
                }
            } 
            else if (type === 'simulator') { finalUrl = './simulator/index.html?auth=msletb_secure_launch'; }
            else {
                if (source === 'url') { const newUrl = document.getElementById('input-content-url').value; if (newUrl) finalUrl = newUrl; } 
                else {
                    const file = document.getElementById('input-content-file').files[0];
                    if (file) {
                        const ext = file.name.split('.').pop().toLowerCase();
                        const path = `uploads/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
                        const { error } = await sb.storage.from('course_content').upload(path, file);
                        if (error) throw error; 
                        const { data } = sb.storage.from('course_content').getPublicUrl(path);
                        finalUrl = data.publicUrl;
                    }
                }
            }

            if(type === 'assignment') { metaData.description = desc; }

            const payload = { title, file_url: finalUrl, data: metaData };

            if (contentModal.editId) { await sb.from('content').update(payload).eq('id', contentModal.editId); ui.toast("Updated!", "success"); } 
            else { await sb.from('content').insert([{ unit_id: unitId, type, ...payload }]); ui.toast("Created!", "success"); }
            contentModal.close(); courseManager.openModule(state.activeModule.id);
        } catch(e) { console.error(e); ui.toast(e.message, 'error'); } 
        finally { btn.innerText = 'Save'; btn.disabled = false; }
    }
};

// ==========================================
// 7. INITIALIZATION
// ==========================================

// 1. EXPOSE TO WINDOW (Critical for HTML onclicks)
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

// 2. DOM LISTENERS
document.addEventListener('DOMContentLoaded', () => {
    
    // Login Form Logic
    const authForm = document.getElementById('auth-form');
    if (authForm) {
        authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const pass = document.getElementById('password').value;
            
            // Use window reference to be 100% sure it exists
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

    // Add Section Button (Safe Listener)
    const btnAddSec = document.getElementById('btn-add-section');
    if (btnAddSec) {
        btnAddSec.addEventListener('click', () => {
            if (window.entityModal) window.entityModal.open('section');
        });
    }

    // Start App
    if(window.auth) window.auth.init();
});