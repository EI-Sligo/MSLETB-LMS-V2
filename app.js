// ==========================================
// 1. CONFIGURATION
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
    const holidays = [
        `${year}-01-01`, // New Year's
        `${year}-03-17`, // St Patrick's
        `${year}-12-25`, // Christmas
        `${year}-12-26`  // St Stephen's
    ];

    // St Brigid's
    let feb1 = new Date(year, 1, 1);
    if (feb1.getDay() === 5) holidays.push(`${year}-02-01`);
    else {
        while (feb1.getDay() !== 1) feb1.setDate(feb1.getDate() + 1);
        holidays.push(feb1.toISOString().split('T')[0]);
    }

    // Easter & Good Friday
    const f = Math.floor, y = year;
    const G = y % 19, C = f(y / 100), H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30;
    const I = H - f(H / 28) * (1 - f(29 / (H + 1)) * f((21 - G) / 11));
    const J = (y + f(y / 4) + I + 2 - C + f(C / 4)) % 7;
    const L = I - J;
    const month = 3 + f((L + 40) / 44);
    const day = L + 28 - 31 * f(month / 4);
    const easterSunday = new Date(year, month - 1, day);
    
    const goodFriday = new Date(easterSunday); 
    goodFriday.setDate(easterSunday.getDate() - 2);
    holidays.push(goodFriday.toISOString().split('T')[0]);

    const easterMon = new Date(easterSunday); 
    easterMon.setDate(easterSunday.getDate() + 1);
    holidays.push(easterMon.toISOString().split('T')[0]);

    // Bank Holidays (May, June, Aug, Oct)
    [4, 5, 7].forEach(m => { 
        let d = new Date(year, m, 1);
        while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
        holidays.push(d.toISOString().split('T')[0]);
    });
    
    let oct = new Date(year, 10, 0); 
    while (oct.getDay() !== 1) oct.setDate(oct.getDate() - 1);
    holidays.push(oct.toISOString().split('T')[0]);

    return holidays;
}

function getContentEmoji(type) {
    switch (type) {
        case 'audio': return '🎧'; case 'video': return '🎥'; case 'simulator': return '⚡';
        case 'assignment': return '📝'; case 'quiz': return '✅'; case 'url': return '🔗';
        case 'file': return '📄'; default: return '📄';
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

function renderContentItem(file, unitId, myWork) {
    let emoji = getContentEmoji(file.type);
    let actionHtml = '';
    let descHtml = '';

    if (file.data) {
        if (file.data.description) descHtml = `<div class="text-sm text-gray-600 mt-2 ml-12 bg-white p-3 rounded border border-gray-200 shadow-sm">${file.data.description}</div>`;
        if (file.data.dueDate) descHtml += `<div class="ml-12 mt-1 text-xs font-bold text-red-600 flex items-center gap-1"><i class="ph ph-calendar-warning"></i> Due: ${new Date(file.data.dueDate).toLocaleDateString()}</div>`;
    }

    if(file.type === 'assignment') {
        if(file.file_url) descHtml += `<div class="ml-12 mt-2"><a href="${file.file_url}" target="_blank" class="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium"><i class="ph ph-file-arrow-down"></i> Download Brief</a></div>`;
        if (isAdmin()) actionHtml = `<button onclick="event.stopPropagation(); assignmentManager.openGrading(${file.id})" class="text-xs bg-indigo-100 text-indigo-700 px-3 py-1 rounded border border-indigo-200 hover:bg-indigo-200 font-bold">Grade</button>`;
        else {
            const status = myWork[file.id] || 'Upload Work';
            const btnColor = status === 'Submitted' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-sm';
            actionHtml = `<button onclick="event.stopPropagation(); assignmentManager.openSubmit(${file.id})" class="text-xs px-3 py-1 rounded border ${btnColor} font-medium">${status}</button>`;
        }
    } else if (file.type === 'quiz') {
        if (isAdmin()) actionHtml = `<span class="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">Quiz</span>`;
        else {
            const status = myWork[file.id] ? 'Retake Quiz' : 'Take Quiz';
            actionHtml = `<button onclick="event.stopPropagation(); quizManager.takeQuiz(${file.id})" class="text-xs px-3 py-1 rounded bg-purple-600 text-white hover:bg-purple-700 shadow-sm font-medium">${status}</button>`;
        }
    }
    
    // JSON Stringify for editing
    const safeFile = JSON.stringify(file).replace(/'/g, "&#39;").replace(/"/g, "&quot;");

    return `
    <div class="bg-white p-2 rounded-lg border border-gray-200 hover:shadow-md transition group">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-3 cursor-pointer flex-1" onclick="courseManager.launchContent(${file.id}, '${file.type}', '${file.file_url}')">
                <div class="h-8 w-8 flex items-center justify-center text-2xl grayscale group-hover:grayscale-0 transition-all">
                    ${emoji}
                </div>
                <span class="font-medium text-sm text-gray-800 group-hover:text-teal-700 transition">
                    ${file.title}
                    ${!file.is_visible ? '<i class="ph ph-eye-slash text-red-400 text-xs ml-1"></i>' : ''}
                </span>
            </div>
            <div class="flex items-center gap-3">
                ${actionHtml}
                ${isAdmin() ? `
                    <div class="hidden group-hover:flex gap-1">
                        <button onclick='contentModal.open(${unitId}, ${safeFile})' class="text-gray-400 hover:text-blue-500"><i class="ph ph-pencil-simple"></i></button>
                        <button onclick="courseManager.deleteItem('content', ${file.id})" class="text-gray-400 hover:text-red-500"><i class="ph ph-trash"></i></button>
                    </div>
                ` : ''}
            </div>
        </div>
        ${descHtml}
    </div>`;
}

// ==========================================
// 3. AUTH & UI LOGIC
// ==========================================
const auth = {
    init: async () => {
        const { data: { session } } = await sb.auth.getSession();
        sb.auth.onAuthStateChange((e) => {
            if (e === 'PASSWORD_RECOVERY') {
                const p = prompt("New password:");
                if(p) sb.auth.updateUser({ password: p }).then(({error}) => {
                    ui.toast(error ? error.message : "Updated! Logging in...", error ? "error" : "success");
                    if(!error) setTimeout(() => window.location.reload(), 1000);
                });
            } else if (e === 'SIGNED_OUT') window.location.reload();
        });
        if (session) {
            state.user = session.user;
            await auth.loadProfile();
            app.showApp();
        } else { app.showLogin(); }
    },

    signIn: async (email, password) => {
        ui.toast('Logging in...', 'info');
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) { ui.toast(error.message, 'error'); return; }
        state.user = data.user;
        await auth.loadProfile();
        app.showApp();
    },

    resetPassword: async () => {
        const email = document.getElementById('email').value;
        if(!email) return alert("Please enter email.");
        ui.toast("Sending link...", "info");
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
        ui.toast(error ? error.message : "Check your email!", error ? 'error' : 'success');
    },

    loadProfile: async () => {
        let { data } = await sb.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
        if (!data) {
            const { data: newProfile } = await sb.from('profiles').insert([{ id: state.user.id, email: state.user.email, global_role: 'student' }]).select().single();
            data = newProfile;
        }
        state.profile = data;
        document.getElementById('user-name').innerText = state.user.email;
        document.getElementById('user-role').innerText = data.global_role.replace('_', ' ').toUpperCase();
        
        const isStaff = ['instructor', 'super_admin'].includes(data.global_role);
        document.getElementById('tab-btn-reports').classList.remove('hidden');
        document.getElementById('btn-new-course')?.classList.toggle('hidden', data.global_role !== 'super_admin');
        ['btn-add-section', 'btn-add-unit'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.classList.toggle('hidden', !isStaff);
        });
    },

    signOut: async () => {
        try { await sb.auth.signOut(); } catch (e) {} 
        finally { localStorage.clear(); window.location.reload(); }
    }
};

const authUI = {
    mode: 'login', 
    toggleMode: (mode) => {
        authUI.mode = mode;
        const btn = document.getElementById('btn-auth-submit');
        if (mode === 'signup') {
            document.getElementById('msg-login').classList.add('hidden');
            document.getElementById('msg-signup').classList.remove('hidden');
            document.getElementById('auth-title').classList.remove('hidden');
            btn.innerHTML = `<span>Activate & Login</span> <i class="ph ph-rocket-launch"></i>`;
            btn.classList.replace('bg-teal-600', 'bg-purple-600');
            btn.classList.replace('hover:bg-teal-700', 'hover:bg-purple-700');
        } else {
            document.getElementById('msg-login').classList.remove('hidden');
            document.getElementById('msg-signup').classList.add('hidden');
            document.getElementById('auth-title').classList.add('hidden');
            btn.innerHTML = `<span>Sign In</span> <i class="ph ph-sign-in"></i>`;
            btn.classList.replace('bg-purple-600', 'bg-teal-600');
            btn.classList.replace('hover:bg-purple-700', 'hover:bg-teal-700');
        }
    }
};

// ==========================================
// 4. NAVIGATION
// ==========================================
const app = {
    showLogin: () => {
        document.getElementById('login-view').classList.remove('hidden');
        document.getElementById('app-view').classList.add('hidden');
    },
    showApp: () => {
        document.getElementById('login-view').classList.add('hidden');
        document.getElementById('app-view').classList.remove('hidden');
        dashboard.loadCourses();
    },
    goHome: () => {
        document.getElementById('dashboard-content').classList.remove('hidden');
        document.getElementById('course-content').classList.add('hidden');
        document.getElementById('breadcrumb-container').innerHTML = '';
        dashboard.loadCourses();
    }
};

const ui = {
    toast: (msg, type = 'info') => {
        let bg = type === 'error' ? "#ef4444" : (type === 'success' ? "#10b981" : "#3b82f6");
        if(typeof Toastify === 'function') Toastify({ text: msg, duration: 3000, gravity: "top", position: "right", style: { background: bg, borderRadius: "8px" } }).showToast();
        else alert(msg);
    },
    switchTab: (tabName) => {
        ['content', 'team', 'reports', 'schedule'].forEach(t => {
            const el = document.getElementById(`tab-${t}`);
            const btn = document.getElementById(`tab-btn-${t}`);
            if(el) el.classList.add('hidden');
            if(btn) {
                btn.classList.replace('text-teal-700', 'text-gray-600');
                btn.classList.remove('bg-white', 'shadow');
            }
        });
        document.getElementById(`tab-${tabName}`).classList.remove('hidden');
        document.getElementById(`tab-btn-${tabName}`).classList.add('bg-white', 'shadow', 'text-teal-700');
        
        if(tabName === 'team') courseManager.loadTeam();
        if(tabName === 'reports') courseManager.loadReports();
        if(tabName === 'schedule') schedulerManager.init();
    },
    toggleAccordion: (sectionId) => {
        const content = document.getElementById(`acc-content-${sectionId}`);
        const icon = document.getElementById(`acc-icon-${sectionId}`);
        if(content.classList.contains('hidden')) {
            content.classList.remove('hidden');
            icon.classList.add('rotate-180');
        } else {
            content.classList.add('hidden');
            icon.classList.remove('rotate-180');
        }
    }
};

// ==========================================
// 5. DASHBOARD
// ==========================================
const dashboard = {
    showMyCoursesOnly: false,

    loadCourses: async () => {
        const grid = document.getElementById('course-grid');
        grid.innerHTML = '<div class="col-span-full text-center p-8"><i class="ph ph-spinner animate-spin text-3xl text-teal-600"></i><p class="text-gray-500 mt-2">Loading courses...</p></div>';

        const [coursesReq, enrollmentsReq] = await Promise.all([
            sb.from('courses').select('*').order('created_at', { ascending: false }),
            sb.from('enrollments').select('course_id, course_role').eq('user_id', state.user.id)
        ]);
        const courses = coursesReq.data || [];
        const myEnrollments = {}; 
        (enrollmentsReq.data || []).forEach(e => myEnrollments[e.course_id] = e.course_role);

        const header = document.querySelector('#dashboard-content .flex.justify-between');
        if (header && !document.getElementById('filter-my-courses')) {
            const filterDiv = document.createElement('div');
            filterDiv.className = "flex items-center gap-2 mr-4";
            filterDiv.innerHTML = `<input type="checkbox" id="filter-my-courses" class="w-4 h-4 text-teal-600 rounded cursor-pointer"><label for="filter-my-courses" class="text-sm font-semibold text-gray-700 cursor-pointer">My Courses Only</label>`;
            header.insertBefore(filterDiv, document.getElementById('btn-new-course'));
            document.getElementById('filter-my-courses').onchange = (e) => { dashboard.showMyCoursesOnly = e.target.checked; dashboard.loadCourses(); };
        }

        let displayCourses = dashboard.showMyCoursesOnly ? courses.filter(c => myEnrollments[c.id]) : courses;
        grid.innerHTML = '';
        
        if (displayCourses.length === 0) {
            grid.innerHTML = `<div class="col-span-full text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300"><p class="text-gray-500 font-medium">No courses found.</p></div>`; return;
        }
        
        displayCourses.forEach(course => {
            const userRole = myEnrollments[course.id];
            const card = document.createElement('div');
            card.className = "bg-white rounded-lg shadow hover:shadow-lg transition cursor-pointer border border-transparent hover:border-teal-500 overflow-hidden flex flex-col h-full group relative";
            card.onclick = () => dashboard.openCourse(course);
            
            let imgHtml = course.image_url ? `<div class="h-32 bg-cover bg-center" style="background-image: url('${course.image_url}')"></div>` : `<div class="h-32 bg-teal-100 flex items-center justify-center text-teal-600"><i class="ph ph-book text-4xl"></i></div>`;
            if (userRole) imgHtml += `<div class="absolute top-2 right-2 bg-teal-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm">ENROLLED</div>`;

            let actions = '';
            if(state.profile.global_role === 'super_admin') {
                actions = `<div class="flex gap-2 mt-auto pt-4 border-t border-gray-100"><button data-id="${course.id}" data-title="${course.title.replace(/"/g, '&quot;')}" class="text-xs text-blue-600 hover:underline" onclick="event.stopPropagation(); entityModal.openFromEl(this, 'course')">Edit</button><button onclick="event.stopPropagation(); dashboard.deleteCourse(${course.id})" class="text-xs text-red-500 hover:underline">Delete</button></div>`;
            }

            card.innerHTML = `${imgHtml}<div class="p-5 flex flex-col flex-1"><h3 class="font-bold text-lg text-slate-800 mb-1">${course.title}</h3><p class="text-sm text-slate-500 line-clamp-2">${course.description || 'No description.'}</p>${actions}</div>`;
            grid.appendChild(card);
        });
    },

    resumeCourse: async (courseId) => { /* Placeholder */ },
    
    openCourse: async (course) => {
        if (state.profile.global_role !== 'super_admin') {
            const { data: enrollment } = await sb.from('enrollments').select('course_role').eq('course_id', course.id).eq('user_id', state.user.id).maybeSingle();
            if (!enrollment) { ui.toast("🚫 Access Denied: Not Enrolled", "error"); return; }
            state.courseRole = enrollment.course_role;
        } else { state.courseRole = 'super_admin'; }

        const isStaff = ['instructor', 'super_admin'].includes(state.courseRole);
        ['tab-btn-team', 'tab-btn-schedule', 'btn-add-unit'].forEach(id => document.getElementById(id)?.classList.toggle('hidden', !isStaff));

        state.activeCourse = course;
        state.activeModule = null;
        
        document.getElementById('dashboard-content').classList.add('hidden');
        document.getElementById('course-content').classList.remove('hidden');
        document.getElementById('active-course-title').innerText = course.title;
        document.getElementById('active-course-desc').innerText = course.description || '';
        document.getElementById('breadcrumb-container').innerHTML = `<i class="ph ph-caret-right mx-2"></i> <span class="font-semibold text-slate-700">${course.title}</span>`;
        document.getElementById('unit-container').innerHTML = `<div class="flex flex-col items-center justify-center h-full text-gray-400"><i class="ph ph-arrow-left text-4xl mb-4 text-gray-300"></i><p>Select a module.</p></div>`;
        document.getElementById('current-module-title').innerHTML = `<span class="italic text-gray-400">Select a module...</span>`;

        ui.switchTab('content');
        courseManager.loadSyllabus();
    },

    deleteCourse: async (id) => {
        if(confirm("Delete?")) { 
            await sb.from('courses').delete().eq('id', id); 
            dashboard.loadCourses(); 
        }
    }
};

// ==========================================
// 6. CONTENT & SYLLABUS MANAGER
// ==========================================
const courseManager = {
    loadSyllabus: async () => {
        const list = document.getElementById('syllabus-list');
        list.innerHTML = '<div class="p-4 text-center"><i class="ph ph-spinner animate-spin text-teal-600"></i></div>';
        
        const palette = ['#dbeafe', '#d1fae5', '#fef9c3', '#fee2e2', '#f3e8ff', '#ffedd5'];
        
        let query = sb.from('sections').select('*, modules(*, units(*, content(*)))') 
            .eq('course_id', state.activeCourse.id).order('position', { ascending: true });
        if(!isAdmin()) query = query.eq('is_visible', true);

        const { data: sections } = await query;
        list.innerHTML = '';
        state.structure = sections || []; 

        if (!sections || sections.length === 0) { list.innerHTML = '<div class="text-center text-gray-400 p-4 text-sm">No sections yet.</div>'; return; }

        sections.forEach(section => {
            let modules = (section.modules || []).sort((a,b) => a.position - b.position);
            if(!isAdmin()) modules = modules.filter(m => m.is_visible);

            const safeSecTitle = section.title.replace(/'/g, "\\'"); 

            const sectionEl = document.createElement('div');
            sectionEl.className = "border-b border-gray-100 last:border-0";
            
            sectionEl.innerHTML = `
                <div class="flex justify-between items-center p-3 hover:bg-slate-50 group cursor-pointer" onclick="ui.toggleAccordion('${section.id}')">
                    <div class="flex items-center gap-2 font-bold text-xs text-gray-600 uppercase tracking-wide flex-1">
                        <i id="acc-icon-${section.id}" class="ph ph-caret-down transition-transform duration-200"></i>
                        <span class="truncate">${section.title}</span>
                    </div>
                    <div class="flex items-center gap-2" onclick="event.stopPropagation()">
                        ${isAdmin() ? `
                            <button onclick="courseManager.bulkCreate('module', ${section.id})" class="text-teal-600 hover:bg-teal-50 p-1 rounded" title="Add Module"><i class="ph ph-plus"></i></button>
                            <button onclick="entityModal.open('section', ${section.id}, '${safeSecTitle}')" class="text-blue-500 hover:bg-blue-50 p-1 rounded"><i class="ph ph-pencil-simple"></i></button>
                            <button onclick="courseManager.deleteItem('sections', ${section.id})" class="text-red-400 hover:bg-red-50 p-1 rounded"><i class="ph ph-trash"></i></button>
                        ` : ''}
                    </div>
                </div>
                <div id="acc-content-${section.id}" class="pl-4 pb-2 space-y-1 hidden">
                    ${modules.map((mod, idx) => {
                        const safeModTitle = mod.title.replace(/'/g, "\\'");
                        const modColor = palette[idx % palette.length]; 
                        mod.color = modColor; 
                        return `
                        <div class="p-2 rounded cursor-pointer text-sm text-gray-600 hover:bg-teal-50 hover:text-teal-700 flex justify-between items-center group transition" onclick="courseManager.openModule('${mod.id}')">
                            <div class="flex items-center gap-2 flex-1">
                                <div class="w-2 h-2 rounded-full" style="background:${modColor}"></div>
                                <i class="ph ph-folder-notch text-gray-400"></i>
                                <span class="truncate">${mod.title}</span>
                            </div>
                            <div class="flex items-center gap-3" onclick="event.stopPropagation()">
                                ${isAdmin() ? `
                                    <button onclick="entityModal.open('module', ${mod.id}, '${safeModTitle}')" class="text-blue-400 hover:text-blue-600"><i class="ph ph-pencil-simple"></i></button>
                                    <button onclick="courseManager.deleteItem('modules', ${mod.id})" class="text-red-400 hover:text-red-600"><i class="ph ph-trash"></i></button>
                                ` : ''}
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            `;
            list.appendChild(sectionEl);
        });
    },

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

    bulkCreate: async (type, parentId) => {
        const title = prompt(`Enter ${type} title:`);
        if(!title) return;
        
        const payload = { title, is_visible: true };
        if(type === 'section') payload.course_id = state.activeCourse.id;
        else if(type === 'module') payload.section_id = parentId;
        else if(type === 'unit') { payload.module_id = parentId; payload.total_hours_required = 0; }
        
        await sb.from(type + 's').insert([payload]);
        document.querySelector('.fixed.inset-0').remove(); 
        courseManager.openBulkEdit(); 
    },
    
    updateEntity: async (table, id, field, value) => { await sb.from(table).update({ [field]: value }).eq('id', id); },

    openBulkEdit: async () => {
        const { data: sections } = await sb.from('sections').select('id, title, position, modules(id, title, position, units(id, title, total_hours_required, position))')
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
        modal.className = "fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-8 fade-in";
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

    openModule: async (moduleId) => {
        const { data: module } = await sb.from('modules').select('*').eq('id', moduleId).single();
        state.activeModule = module;
        
        document.getElementById('current-module-title').innerHTML = `<span class="flex items-center gap-2 text-teal-900 font-bold"><i class="ph ph-folder-open"></i> ${module.title}</span>`;
        if(isAdmin()) {
            document.getElementById('btn-add-unit').classList.remove('hidden');
            const headerContainer = document.getElementById('current-module-title').parentElement;
            if(!document.getElementById('btn-bulk-edit')) {
                const bulkBtn = document.createElement('button');
                bulkBtn.id = 'btn-bulk-edit';
                bulkBtn.className = "text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded border border-indigo-200 mr-2 hover:bg-indigo-100 font-bold flex items-center gap-1";
                bulkBtn.innerHTML = `<i class="ph ph-list-dashes"></i> Bulk Edit`;
                bulkBtn.onclick = () => courseManager.openBulkEdit();
                const addBtn = document.getElementById('btn-add-unit');
                headerContainer.insertBefore(bulkBtn, addBtn);
            }
        }

        const container = document.getElementById('unit-container');
        container.innerHTML = '<div class="text-gray-400 p-8 flex justify-center"><i class="ph ph-spinner animate-spin text-2xl"></i></div>';
        
        let query = sb.from('units').select('*, content(*)').eq('module_id', moduleId).order('position', { ascending: true });
        if(!isAdmin()) query = query.eq('is_visible', true); 
        const { data: units } = await query;
        
        let myWork = {};
        if(!isAdmin()) {
            const { data: subs } = await sb.from('assignments').select('content_id').eq('student_id', state.user.id);
            const { data: quizzes } = await sb.from('quiz_results').select('content_id').eq('user_id', state.user.id);
            subs?.forEach(s => myWork[s.content_id] = 'Submitted');
            quizzes?.forEach(q => myWork[q.content_id] = 'Completed');
        }

        container.innerHTML = '';
        if (!units || units.length === 0) { container.innerHTML = '<div class="flex flex-col items-center justify-center h-64 text-gray-400"><i class="ph ph-tray text-4xl mb-2"></i><p>This module is empty.</p></div>'; return; }

        units.forEach((unit, index) => {
            const isOpen = index === 0;
            const unitEl = document.createElement('div');
            unitEl.className = "mb-4 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden";
            unitEl.innerHTML = `
                <div class="flex justify-between items-center p-4 bg-white cursor-pointer hover:bg-gray-50 border-b border-gray-100" onclick="ui.toggleAccordion('unit-${unit.id}')">
                    <div class="flex items-center gap-2 flex-1"><i id="acc-icon-unit-${unit.id}" class="ph ph-caret-down text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}"></i><h3 class="font-bold text-slate-700 text-lg">${unit.title}</h3></div>
                    <div class="flex items-center gap-3" onclick="event.stopPropagation()">
                        ${isAdmin() ? `<div class="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded border border-gray-200" title="Total Hours Required"><i class="ph ph-clock text-gray-400 text-xs"></i><input type="number" step="0.5" class="w-12 text-xs bg-transparent outline-none font-bold text-gray-600 text-right" value="${unit.total_hours_required || 0}" onchange="courseManager.updateHours(${unit.id}, this.value)"><span class="text-[10px] text-gray-400">h</span></div><label class="relative inline-flex items-center cursor-pointer mr-2"><input type="checkbox" class="sr-only peer" ${unit.is_visible ? 'checked' : ''} onchange="courseManager.toggleVisibility('units', ${unit.id}, this.checked)"><div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-teal-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all"></div></label><div class="flex gap-1 border-l pl-2 border-gray-200"><button onclick="courseManager.moveItem('units', ${unit.id}, 'up')" class="text-gray-400 hover:text-teal-600 p-1"><i class="ph ph-arrow-up"></i></button><button onclick="courseManager.moveItem('units', ${unit.id}, 'down')" class="text-gray-400 hover:text-teal-600 p-1"><i class="ph ph-arrow-down"></i></button><button onclick="courseManager.addContent(${unit.id})" class="text-xs bg-teal-50 text-teal-700 px-3 py-1 rounded hover:bg-teal-100 border border-teal-200 font-medium">+ Content</button><button onclick="courseManager.editItem('units', ${unit.id}, '${unit.title}')" class="text-gray-400 hover:text-blue-500 p-1"><i class="ph ph-pencil-simple text-lg"></i></button><button onclick="courseManager.deleteItem('units', ${unit.id})" class="text-gray-400 hover:text-red-500 p-1"><i class="ph ph-trash text-lg"></i></button></div>` : ''}
                    </div>
                </div>
                <div id="acc-content-unit-${unit.id}" class="${isOpen ? '' : 'hidden'} bg-slate-50 p-4 space-y-3"></div>
            `;
            
            const contentContainer = unitEl.querySelector(`#acc-content-unit-${unit.id}`);
            if(unit.content && !isAdmin()) unit.content = unit.content.filter(c => c.is_visible);

            if(unit.content && unit.content.length > 0) {
                unit.content.sort((a,b) => a.position - b.position);
                const groups = { video: [], file: [], audio: [], simulator: [], assignment: [], quiz: [], url: [] };
                unit.content.forEach(item => { if(groups[item.type]) groups[item.type].push(item); else groups['file'].push(item); });

                Object.keys(groups).forEach(type => {
                    if(groups[type].length === 0) return;
                    
                    const groupTitle = type.charAt(0).toUpperCase() + type.slice(1);
                    const groupIcon = getContentEmoji(type); 

                    contentContainer.innerHTML += `
                        <details class="group/nested bg-white border border-gray-200 rounded-lg overflow-hidden mb-2">
                            <summary class="flex justify-between items-center p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 list-none">
                                <span class="font-bold text-sm text-gray-700 flex items-center gap-2">
                                    ${groupIcon} ${groupTitle} 
                                    <span class="bg-gray-200 text-gray-600 text-[10px] px-2 py-0.5 rounded-full">${groups[type].length}</span>
                                </span>
                                <i class="ph ph-caret-down text-gray-400 transition-transform group-open/nested:rotate-180"></i>
                            </summary>
                            <div class="p-3 space-y-2 border-t border-gray-100">
                                ${groups[type].map(file => renderContentItem(file, unit.id, myWork)).join('')}
                            </div>
                        </details>`;
                });
            } else { contentContainer.innerHTML = '<p class="text-sm text-gray-400 italic pl-2">No content yet.</p>'; }
            container.appendChild(unitEl);
        });
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
    editItem: async (table, id, currentTitle) => {
        if(table === 'sections' || table === 'modules') {
            courseManager.loadSyllabus(); 
        } else {
            courseManager.openModule(state.activeModule.id);
        }
    },
    
    launchContent: async (id, type, url) => {
        if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) { window.open(url, '_blank'); return; }

        const { data: content } = await sb.from('content').select('allow_download').eq('id', id).single();
        sb.from('activity_logs').insert([{ user_id: state.user.id, content_id: id, action_type: 'viewed' }]).then(()=>{});
        const canDownload = isAdmin() || (content && content.allow_download);

        if(type === 'simulator') {
            const baseUrl = url.split('?')[0]; 
            const cleanUrl = baseUrl.endsWith('/') ? baseUrl + 'index.html' : (baseUrl.endsWith('html') ? baseUrl : baseUrl + '/index.html');
            window.open(`${cleanUrl}?auth=msletb_secure_launch&uid=${state.user.id}&cid=${id}`, '_blank');
        }
        else if (type === 'audio') { 
            const p = document.getElementById('audio-player'); p.src = url; document.getElementById('modal-audio').classList.remove('hidden');
            if(!canDownload) p.setAttribute('controlsList', 'nodownload'); else p.removeAttribute('controlsList');
        }
        else if (type === 'file' || type === 'video') courseManager.openViewer(url, type, canDownload);
        else if (type === 'assignment') isAdmin() ? assignmentManager.openGrading(id) : assignmentManager.openSubmit(id);
        else if (type === 'quiz') isAdmin() ? alert("Admins cannot take quizzes.") : quizManager.takeQuiz(id);
        else if (url) window.open(url, '_blank');
    },

    openViewer: (url, type, canDownload) => {
        const modal = document.getElementById('modal-viewer');
        const body = document.getElementById('viewer-body');
        const dlBtn = document.getElementById('viewer-download-btn');
        modal.classList.remove('hidden');
        if(dlBtn) { if (canDownload) { dlBtn.classList.remove('hidden'); dlBtn.href = url; } else { dlBtn.classList.add('hidden'); dlBtn.href = '#'; } }
        body.innerHTML = '<div class="text-white flex items-center justify-center h-full"><i class="ph ph-spinner animate-spin text-4xl"></i></div>'; 
        const ext = url.split('?')[0].split('.').pop().toLowerCase();
        
        if (type === 'video' || ['mp4', 'webm'].includes(ext)) {
            body.innerHTML = `<video src="${url}" controls class="max-h-full max-w-full shadow-lg rounded"></video>`;
        } else if (['pdf', 'jpg', 'png'].includes(ext)) {
            body.innerHTML = `<iframe src="${url}" class="w-full h-full border-0 bg-white"></iframe>`;
        } else {
            body.innerHTML = `<div class="text-white p-8">File type not supported for preview. <a href="${url}" target="_blank" class="underline">Download</a></div>`;
        }
    },
    closeViewer: () => { document.getElementById('modal-viewer').classList.add('hidden'); document.getElementById('viewer-body').innerHTML = ''; },
    closeAudio: () => { const m = document.getElementById('modal-audio'); const p = document.getElementById('audio-player'); if(p){p.pause(); p.currentTime=0;} if(m) m.classList.add('hidden'); },
    addUnit: async () => { if(!state.activeModule) return; const t = prompt("Unit Title:"); if(t) { await sb.from('units').insert([{ module_id: state.activeModule.id, title: t }]); courseManager.openModule(state.activeModule.id); }},
    addContent: (unitId) => contentModal.open(unitId),
    deleteItem: async (table, id) => { if(confirm("Delete?")) { await sb.from(table).delete().eq('id', id); if(table==='units'||table==='content') courseManager.openModule(state.activeModule.id); else courseManager.loadSyllabus(); } },
    loadTeam: async () => { 
        const el = document.getElementById('tab-team'); el.innerHTML = '<p>Loading...</p>';
        const { data: roster } = await sb.from('enrollments').select('*, profiles(email)').eq('course_id', state.activeCourse.id);
        const { data: invites } = await sb.from('invitations').select('*').eq('course_id', state.activeCourse.id);
        let html = `<div class="flex justify-between mb-6"><h2 class="text-xl font-bold">Class Roster</h2><div class="flex gap-2"><select id="role-in" class="border p-2 rounded text-sm"><option value="student">Student</option><option value="instructor">Instructor</option></select><input id="email-in" placeholder="Email Address" class="border p-2 rounded text-sm w-64"><button onclick="courseManager.enroll()" class="bg-teal-600 text-white px-4 py-2 rounded text-sm font-bold shadow-sm">+ Invite</button></div></div><div class="bg-white rounded-lg border border-gray-200 overflow-hidden"><table class="w-full text-sm text-left"><thead class="bg-gray-50 text-gray-500 uppercase font-semibold"><tr><th class="p-4">Email</th><th class="p-4">Role</th><th class="p-4">Status</th><th class="p-4"></th></tr></thead><tbody class="divide-y divide-gray-100">`;
        invites?.forEach(i => html += `<tr class="bg-yellow-50"><td class="p-4">${i.email}</td><td class="p-4 uppercase text-xs font-bold">${i.role}</td><td class="p-4"><span class="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs font-bold">Invited</span></td><td class="p-4"><button onclick="courseManager.delInvite(${i.id})" class="text-red-400 hover:text-red-600"><i class="ph ph-x text-lg"></i></button></td></tr>`);
        roster?.forEach(m => html += `<tr><td class="p-4 font-medium text-gray-800">${m.profiles?.email || 'Unknown'}</td><td class="p-4"><span class="px-2 py-1 rounded text-xs font-bold ${m.course_role==='instructor'?'bg-purple-100 text-purple-700':'bg-blue-100 text-blue-700'}">${m.course_role.toUpperCase()}</span></td><td class="p-4"><span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">Active</span></td><td class="p-4 text-right">${isAdmin() && m.user_id !== state.user.id ? `<button onclick="courseManager.delUser('${m.user_id}')" class="text-red-400 hover:text-red-600"><i class="ph ph-trash text-lg"></i></button>` : ''}</td></tr>`);
        html += `</tbody></table></div>`; el.innerHTML = html;
    },
    
    enroll: async () => {
        const email = document.getElementById('email-in').value; 
        const role = document.getElementById('role-in').value;
        if(!email) return alert("Please enter an email address");

        const { data: u, error: uError } = await sb.from('profiles').select('id').eq('email', email).maybeSingle();
        
        if (uError) {
            console.error("Profile check error:", uError);
            ui.toast("Error checking user: " + uError.message, "error");
            return;
        }

        if(u) { 
            const { error } = await sb.from('enrollments').insert([{course_id:state.activeCourse.id, user_id:u.id, course_role:role}]); 
            if(error) {
                console.error("Enrollment error:", error);
                ui.toast("Failed to enroll: " + error.message, "error");
            } else {
                ui.toast("Enrolled successfully!", "success"); 
            }
        } else { 
            const { error } = await sb.from('invitations').insert([{course_id:state.activeCourse.id, email, role, invited_by:state.user.id}]); 
            if(error) {
                console.error("Invite error:", error);
                ui.toast("Failed to invite: " + error.message, "error");
            } else {
                ui.toast("Invitation sent!", "success"); 
            }
        }
        courseManager.loadTeam();
    },
    delInvite: async (id) => { if(confirm("Cancel?")) { await sb.from('invitations').delete().eq('id', id); courseManager.loadTeam(); }},
    delUser: async (uid) => { if(confirm("Remove?")) { await sb.from('enrollments').delete().eq('course_id', state.activeCourse.id).eq('user_id', uid); courseManager.loadTeam(); }},
    
    // Reports Logic
    loadReports: async () => {
        const el = document.getElementById('tab-reports');
        el.innerHTML = '<div class="flex justify-center p-8"><i class="ph ph-spinner animate-spin text-3xl text-teal-600"></i></div>';
        const { data: sections } = await sb.from('sections').select('id, title, modules(id, title, units(id, title, content(id, title, type)))').eq('course_id', state.activeCourse.id).order('position');
        let gradableItems = [];
        sections?.forEach(s => s.modules?.forEach(m => m.units?.forEach(u => u.content?.forEach(c => { if(['assignment', 'quiz', 'simulator'].includes(c.type)) gradableItems.push({ id: c.id, title: c.title, type: c.type, context: `${m.title} <br> <span class="text-gray-400 font-normal text-[10px] uppercase tracking-wide">${u.title}</span>` }); }))));

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
    }
};

// ==========================================
// 6. ENTITY MODAL (Sections/Modules/Units)
// ==========================================
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

// ==========================================
// 8. CONTENT MODAL (Updated to handle Edit)
// ==========================================
const contentModal = {
    // UPDATED: Now accepts an 'item' to populate for editing
    open: (unitId, item = null) => {
        document.getElementById('modal-add-content').classList.remove('hidden');
        document.getElementById('btn-save-content').onclick = () => contentModal.save(unitId, item?.id);
        
        // Reset or Populate
        if(item) {
            document.getElementById('input-content-type').value = item.type;
            document.getElementById('input-content-title').value = item.title;
            document.getElementById('input-content-url').value = item.file_url || '';
            if(item.type === 'quiz' && item.data?.questions) {
                quizManager.questions = item.data.questions;
                document.getElementById('quiz-questions-list').innerHTML = item.data.questions.map(q=>`<div>${q.q}</div>`).join('');
            }
            // Trigger UI update for type
            contentModal.toggleFields();
        } else {
            document.getElementById('input-content-title').value = '';
            document.getElementById('input-content-url').value = '';
            quizManager.questions = [];
            document.getElementById('quiz-questions-list').innerHTML = '';
            contentModal.toggleFields();
        }
    },
    close: () => document.getElementById('modal-add-content').classList.add('hidden'),
    toggleFields: () => {
        const type = document.getElementById('input-content-type').value;
        const isQuiz = type === 'quiz';
        document.getElementById('quiz-wrapper').classList.toggle('hidden', !isQuiz);
        document.getElementById('source-wrapper').classList.toggle('hidden', isQuiz);
    },
    save: async (unitId, itemId = null) => {
        const title = document.getElementById('input-content-title').value;
        const type = document.getElementById('input-content-type').value;
        let fileUrl = document.getElementById('input-content-url').value; 
        let jsonData = {};

        // HARDCODE SIMULATOR LINK
        if(type === 'simulator') {
            fileUrl = '/simulator/index.html'; 
        } 
        else if(type === 'quiz') {
            jsonData = { questions: quizManager.questions };
        } 
        else {
            const fileInput = document.getElementById('input-content-file');
            if(fileInput && fileInput.files.length > 0) {
                 const file = fileInput.files[0];
                 const path = `files/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9]/g,'_')}`;
                 await sb.storage.from('course_content').upload(path, file);
                 const { data } = sb.storage.from('course_content').getPublicUrl(path);
                 fileUrl = data.publicUrl;
            }
        }

        const payload = {
            unit_id: unitId,
            title,
            type,
            file_url: fileUrl,
            data: jsonData
        };

        if(itemId) {
            await sb.from('content').update(payload).eq('id', itemId);
            ui.toast("Content Updated!");
        } else {
            await sb.from('content').insert([payload]);
            ui.toast("Content Added!");
        }
        
        contentModal.close();
        courseManager.openModule(state.activeModule.id);
    }
};

// ==========================================
// 9. ASSIGNMENT & QUIZ MANAGERS
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
        if(!file) return alert("Please select a file.");
        const path = `assignments/${state.user.id}_${Date.now()}_${file.name}`;
        await sb.storage.from('course_content').upload(path, file);
        const { data } = sb.storage.from('course_content').getPublicUrl(path);
        await sb.from('assignments').insert([{ course_id: state.activeCourse.id, content_id: cid, student_id: state.user.id, file_url: data.publicUrl }]);
        ui.toast("Submitted!", "success"); assignmentManager.closeSubmit();
    },
    openGrading: async (contentId) => {
        const m = document.getElementById('modal-grade-assignment'); m.classList.remove('hidden');
        const list = document.getElementById('grading-list'); list.innerHTML = 'Loading...';
        const { data } = await sb.from('assignments').select('*, profiles(email)').eq('content_id', contentId);
        list.innerHTML = data.map(sub => `<div class="border-b p-3 flex justify-between"><div><div class="font-bold">${sub.profiles.email}</div><a href="${sub.file_url}" target="_blank" class="text-blue-600 text-sm underline">View Work</a></div><div><select onchange="assignmentManager.grade(${sub.id}, this.value)" class="border p-1"><option value="">Grade...</option><option value="Pass">Pass</option><option value="Fail">Fail</option><option value="Credit">Credit</option></select></div></div>`).join('');
    },
    closeGrading: () => document.getElementById('modal-grade-assignment').classList.add('hidden'),
    grade: async (id, val) => { await sb.from('assignments').update({ grade: val }).eq('id', id); ui.toast("Graded!"); }
};

const quizManager = {
    questions: [],
    addQuestionUI: () => {
        const q = prompt("Question:"); if(!q) return;
        const a = prompt("Option 1 (Correct):"); const b = prompt("Option 2:"); const c = prompt("Option 3:");
        quizManager.questions.push({ q, options: [a,b,c], correct: 0 });
        document.getElementById('quiz-questions-list').innerHTML += `<div>${q}</div>`;
    },
    takeQuiz: async (id) => {
        const { data } = await sb.from('content').select('data').eq('id', id).single();
        if(!data || !data.data.questions) return alert("Error loading quiz");
        document.getElementById('modal-take-quiz').classList.remove('hidden');
        const body = document.getElementById('quiz-body'); body.innerHTML = ''; body.dataset.cid = id;
        data.data.questions.forEach((q, idx) => {
            let opts = ''; q.options.forEach((opt, oIdx) => { opts += `<label class="block p-2 border rounded mb-1 cursor-pointer hover:bg-gray-50"><input type="radio" name="q${idx}" value="${oIdx}"> ${opt}</label>`; });
            body.innerHTML += `<div class="mb-4"><p class="font-bold mb-2">${idx+1}. ${q.q}</p>${opts}</div>`;
        });
    },
    closeTakeQuiz: () => document.getElementById('modal-take-quiz').classList.add('hidden'),
    submitQuiz: async () => {
        const body = document.getElementById('quiz-body'); const cid = body.dataset.cid;
        await sb.from('quiz_results').insert([{ user_id: state.user.id, content_id: cid, score: 100, total: 100 }]);
        ui.toast("Quiz Submitted!"); quizManager.closeTakeQuiz();
    }
};

// ==========================================
// 10. SCHEDULER MANAGER (FIXED)
// ==========================================
const schedulerManager = {
    currentDate: new Date(),
    schedules: [],

    init: async () => {
        await schedulerManager.fetchData();
        schedulerManager.renderSidebar();
        schedulerManager.renderCalendar();
    },

    fetchData: async () => {
        const { data } = await sb.from('schedules')
            .select('*, units:unit_id(title, total_hours_required, module_id)')
            .eq('course_id', state.activeCourse.id);
        schedulerManager.schedules = data || [];
    },

    renderCalendar: () => {
        const container = document.getElementById('calCont');
        if (!container) return;

        const year = schedulerManager.currentDate.getFullYear();
        const month = schedulerManager.currentDate.getMonth();
        const monthName = schedulerManager.currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

        container.innerHTML = `
            <div class="p-4 border-b flex justify-between items-center bg-white">
                <h2 class="font-bold text-lg text-slate-800 capitalize">${monthName}</h2>
                <div class="flex gap-2">
                    <button onclick="schedulerManager.changeMonth(-1)" class="p-2 hover:bg-gray-100 rounded"><i class="ph ph-caret-left"></i></button>
                    <button onclick="schedulerManager.changeMonth(1)" class="p-2 hover:bg-gray-100 rounded"><i class="ph ph-caret-right"></i></button>
                    <button onclick="schedulerManager.openTools()" class="bg-slate-800 text-white px-3 py-1 rounded text-xs font-bold">Tools</button>
                </div>
            </div>
            <div class="cal-header"><div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div></div>
            <div id="cal-grid" class="cal-grid flex-1 overflow-y-auto bg-white"></div>
        `;

        const grid = container.querySelector('#cal-grid');
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const holidays = getIrishHolidays(year);

        // Fill empty start days
        for (let i = 0; i < firstDay; i++) {
            grid.innerHTML += `<div class="cal-cell bg-gray-50/50"></div>`;
        }

        // Fill actual days
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isWeekend = new Date(dateStr).getDay() === 0 || new Date(dateStr).getDay() === 6;
            const isHoliday = holidays.includes(dateStr);
            const isBlocked = isWeekend || isHoliday;

            const cell = document.createElement('div');
            cell.className = `cal-cell ${isBlocked ? 'cal-blocked' : ''}`;
            cell.innerHTML = `<div class="cal-day-num">${d}</div>`;

            if (!isBlocked) {
                cell.ondragover = (e) => e.preventDefault();
                cell.ondrop = (e) => schedulerManager.handleDrop(e, dateStr);

                // Filter items for this specific day
                const dayItems = schedulerManager.schedules.filter(s => s.date === dateStr);
                dayItems.forEach(item => {
                    const div = document.createElement('div');
                    div.className = "slot-item shadow-sm text-slate-700 bg-white border-slate-300";
                    div.innerText = `${item.hours_assigned}h: ${item.units?.title || item.label}`;
                    div.onclick = () => schedulerManager.editSlot(item);
                    cell.appendChild(div);
                });
            } else if (isHoliday) {
                cell.innerHTML += `<div class="flex items-center justify-center h-full text-[9px] font-bold text-red-300 uppercase rotate-12">Holiday</div>`;
            }
            grid.appendChild(cell);
        }
    },

    changeMonth: (delta) => {
        schedulerManager.currentDate.setMonth(schedulerManager.currentDate.getMonth() + delta);
        schedulerManager.renderCalendar();
    },

    handleDrop: async (e, dateStr) => {
        e.preventDefault();
        const unitId = e.dataTransfer.getData('id');
        const type = e.dataTransfer.getData('type');

        if (type === 'unit') {
            const hours = prompt("Enter hours for this day:", "6.5");
            if (!hours) return;

            await sb.from('schedules').insert([{
                course_id: state.activeCourse.id,
                unit_id: parseInt(unitId),
                date: dateStr,
                hours_assigned: parseFloat(hours),
                type: 'unit'
            }]);
            schedulerManager.init();
        }
    },

    renderSidebar: () => {
        const list = document.getElementById('scheduler-sidebar');
        if (!list) return;
        list.innerHTML = '';

        state.structure.forEach(section => {
            section.modules?.forEach(mod => {
                mod.units?.forEach(u => {
                    const div = document.createElement('div');
                    div.className = "p-2 bg-white border rounded shadow-sm text-xs cursor-grab hover:border-teal-500 transition";
                    div.draggable = true;
                    div.innerText = u.title;
                    div.ondragstart = (e) => {
                        e.dataTransfer.setData('type', 'unit');
                        e.dataTransfer.setData('id', u.id);
                    };
                    list.appendChild(div);
                });
            });
        });
    }
};

// ==========================================
// 11. EXPOSE TO WINDOW (REQUIRED FOR HTML ONCLICK)
// ==========================================
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

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('auth-form');
    if(loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const pass = document.getElementById('password').value;
            if (authUI.mode === 'login') auth.signIn(email, pass);
            else {
                ui.toast("Activating...", "info");
                const { error } = await sb.auth.signUp({ email, password: pass });
                if (error) ui.toast(error.message, "error");
                else { ui.toast("Activated! Logging in...", "success"); setTimeout(() => window.location.reload(), 1500); }
            }
        });
    }
    
    document.getElementById('btn-add-section')?.addEventListener('click', () => entityModal.open('section'));
    auth.init();
});