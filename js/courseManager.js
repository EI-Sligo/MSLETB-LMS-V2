import { sb, state } from './config.js';
import { ui } from './ui.js';
import { isAdmin, getContentEmoji, renderContentItem, getGradeInfo } from './utils.js';
import { entityModal, contentModal, assignmentManager, quizManager } from './modals.js';
import { schedulerManager } from './scheduler.js';

export const courseManager = {
    loadSyllabus: async (silent = false) => {
        if(!silent) {
            const list = document.getElementById('syllabus-list');
            if(list) list.innerHTML = '<div class="p-4 text-center"><i class="ph ph-spinner animate-spin text-teal-600"></i></div>';
        }
        
        let query = sb.from('sections').select('*, modules(*, units(*, content(*)))').eq('course_id', state.activeCourse.id).order('position');
        if(!isAdmin()) query = query.eq('is_visible', true);
        
        const { data: sections } = await query;
        state.structure = sections || [];

        // FIX: Assign colors immediately for Scheduler
        const palette = ['#dbeafe', '#d1fae5', '#fef9c3', '#fee2e2', '#f3e8ff', '#ffedd5'];
        let modIdx = 0;
        state.structure.forEach(sec => {
            sec.modules?.sort((a,b)=>a.position-b.position).forEach(m => { m.color = palette[modIdx++ % palette.length]; });
        });

        if(silent) return; 

        const list = document.getElementById('syllabus-list');
        list.innerHTML = '';

        if (!sections || sections.length === 0) { list.innerHTML = '<div class="text-center text-gray-400 p-4 text-sm">No sections yet.</div>'; return; }

        sections.forEach(section => {
            const modules = section.modules || [];
            const div = document.createElement('div');
            div.className = "border-b border-gray-100 last:border-0";
            div.innerHTML = `
                <div class="flex justify-between items-center p-3 hover:bg-slate-50 group cursor-pointer" onclick="ui.toggleAccordion('${section.id}')">
                    <div class="flex items-center gap-2 font-bold text-xs text-gray-600 uppercase tracking-wide flex-1">
                        <i id="acc-icon-${section.id}" class="ph ph-caret-down transition-transform duration-200"></i>
                        <span class="truncate">${section.title}</span>
                    </div>
                    <div class="flex items-center gap-1" onclick="event.stopPropagation()">
                        ${isAdmin() ? `<button onclick="courseManager.bulkCreate('module', ${section.id})" class="text-teal-600 hover:bg-teal-50 p-1 rounded" title="Add Module"><i class="ph ph-plus"></i></button><button onclick="entityModal.open('section', ${section.id}, '${section.title.replace(/'/g,"")}')" class="text-blue-500 hover:bg-blue-50 p-1 rounded"><i class="ph ph-pencil-simple"></i></button><button onclick="courseManager.deleteItem('sections', ${section.id})" class="text-red-400 hover:bg-red-50 p-1 rounded"><i class="ph ph-trash"></i></button>` : ''}
                    </div>
                </div>
                <div id="acc-content-${section.id}" class="pl-4 pb-2 space-y-1 hidden">
                    ${modules.map(m => `
                        <div class="p-2 rounded cursor-pointer text-sm text-gray-600 hover:bg-teal-50 hover:text-teal-700 flex justify-between items-center group transition" onclick="courseManager.openModule('${m.id}')">
                            <div class="flex items-center gap-2 flex-1"><div class="w-2 h-2 rounded-full" style="background:${m.color}"></div><span class="truncate ${!m.is_visible ? 'opacity-50 italic' : ''}">${m.title}</span></div>
                            <div class="flex items-center gap-1" onclick="event.stopPropagation()">
                                ${isAdmin() ? `<input type="checkbox" class="accent-teal-600 mr-1" ${m.is_visible ? 'checked' : ''} onclick="courseManager.toggleVisibility('modules', ${m.id}, this.checked)"><button onclick="courseManager.moveItem('modules', ${m.id}, 'up')" class="text-gray-400 hover:text-teal-600 hidden group-hover:block"><i class="ph ph-arrow-up"></i></button><button onclick="courseManager.moveItem('modules', ${m.id}, 'down')" class="text-gray-400 hover:text-teal-600 hidden group-hover:block"><i class="ph ph-arrow-down"></i></button><button onclick="entityModal.open('module', ${m.id}, '${m.title.replace(/'/g,"")}')" class="text-blue-400 hover:text-blue-600 hidden group-hover:block"><i class="ph ph-pencil-simple"></i></button><button onclick="courseManager.deleteItem('modules', ${m.id})" class="text-red-400 hover:text-red-600 hidden group-hover:block"><i class="ph ph-trash"></i></button>` : ''}
                            </div>
                        </div>`).join('')}
                </div>`;
            list.appendChild(div);
        });
    },

    openModule: async (moduleId) => {
        const { data: module } = await sb.from('modules').select('*').eq('id', moduleId).single();
        state.activeModule = module;
        document.getElementById('current-module-title').innerHTML = `<span class="flex items-center gap-2 text-teal-900 font-bold"><i class="ph ph-folder-open"></i> ${module.title}</span>`;
        
        if(isAdmin()) {
            const btnAdd = document.getElementById('btn-add-unit');
            btnAdd.classList.remove('hidden');
            btnAdd.onclick = courseManager.addUnit;
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
                <div id="acc-content-unit-${unit.id}" class="${isOpen ? '' : 'hidden'} bg-slate-50 p-4 space-y-3"></div>`;
            const contentContainer = unitEl.querySelector(`#acc-content-unit-${unit.id}`);
            if(unit.content && !isAdmin()) unit.content = unit.content.filter(c => c.is_visible);
            if(unit.content && unit.content.length > 0) {
                unit.content.sort((a,b) => a.position - b.position);
                const groups = { video: [], file: [], audio: [], simulator: [], assignment: [], quiz: [], url: [] };
                unit.content.forEach(item => { if(groups[item.type]) groups[item.type].push(item); else groups['file'].push(item); });
                Object.keys(groups).forEach(type => {
                    if(groups[type].length === 0) return;
                    contentContainer.innerHTML += `<details class="group/nested bg-white border border-gray-200 rounded-lg overflow-hidden mb-2" open><summary class="flex justify-between items-center p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 list-none text-xs font-bold text-gray-500 uppercase tracking-wider"><span class="flex items-center gap-2">${getContentEmoji(type)} ${type.charAt(0).toUpperCase() + type.slice(1)}s</span><i class="ph ph-caret-down text-gray-400 transition-transform group-open/nested:rotate-180"></i></summary><div class="p-2 space-y-1 border-t border-gray-100">${groups[type].map(file => renderContentItem(file, unit.id, myWork)).join('')}</div></details>`;
                });
            } else { contentContainer.innerHTML = '<p class="text-sm text-gray-400 italic pl-2">No content yet.</p>'; }
            container.appendChild(unitEl);
        });
    },
    
    // UTILS
    addUnit: async () => { if(!state.activeModule) return; const t = prompt("Unit Title:"); if(t) { await sb.from('units').insert([{ module_id: state.activeModule.id, title: t }]); courseManager.openModule(state.activeModule.id); }},
    addContent: (unitId) => contentModal.open(unitId),
    deleteItem: async (table, id) => { if(confirm("Delete this item?")) { await sb.from(table).delete().eq('id', id); if(table==='units'||table==='content') courseManager.openModule(state.activeModule.id); else courseManager.loadSyllabus(); } },
    editItem: async (table, id, currentTitle) => { const t = prompt(`Rename ${table}:`, currentTitle); if(!t) return; await sb.from(table).update({ title: t }).eq('id', id); if(table === 'sections' || table === 'modules') courseManager.loadSyllabus(); else courseManager.openModule(state.activeModule.id); },
    moveItem: async (table, id, direction) => { let query = sb.from(table).select('id, position'); if (table === 'sections') query = query.eq('course_id', state.activeCourse.id); else if (table === 'modules') { const parentSec = state.structure.find(s => s.modules && s.modules.some(m => m.id === id)); if(parentSec) query = query.eq('section_id', parentSec.id); } else if (table === 'units') query = query.eq('module_id', state.activeModule.id); else if (table === 'content') { const { data: c } = await sb.from('content').select('unit_id').eq('id', id).single(); if(c) query = query.eq('unit_id', c.unit_id); } const { data: items } = await query.order('position', { ascending: true }); const sorted = items.map((item, idx) => ({ ...item, position: idx })); const index = sorted.findIndex(i => i.id === id); if (index === -1) return; const neighborIndex = direction === 'up' ? index - 1 : index + 1; if (neighborIndex < 0 || neighborIndex >= sorted.length) return; const temp = sorted[index].position; sorted[index].position = sorted[neighborIndex].position; sorted[neighborIndex].position = temp; for(const item of sorted) await sb.from(table).update({ position: item.position }).eq('id', item.id); if (table === 'units' || table === 'content') courseManager.openModule(state.activeModule.id); else courseManager.loadSyllabus(); },
    toggleVisibility: async (table, id, isVisible) => { try { await sb.from(table).update({ is_visible: isVisible }).eq('id', id); ui.toast("Visibility updated", "success"); } catch(e) { ui.toast("Error updating", "error"); } },
    updateHours: async (unitId, hours) => { try { await sb.from('units').update({ total_hours_required: hours }).eq('id', unitId); state.structure.forEach(s => s.modules?.forEach(m => m.units?.forEach(u => { if(u.id == unitId) u.total_hours_required = parseFloat(hours); }))); if(!document.getElementById('tab-schedule').classList.contains('hidden')) schedulerManager.renderSidebar(); } catch (e) { ui.toast("Error updating hours", "error"); } },
   launchContent: async (id, type, url) => {
        const { data: content } = await sb.from('content').select('allow_download, data').eq('id', id).single();
        const allowDl = content ? content.allow_download : false;
        const meta = content ? content.data : {}; // Get metadata

        sb.from('activity_logs').insert([{ user_id: state.user.id, content_id: id, action_type: 'viewed' }]).then(()=>{});
        const canDownload = isAdmin() || allowDl; 

        // DETECT YOUTUBE
        const isYouTube = url && (url.includes('youtube.com') || url.includes('youtu.be'));

        if(type === 'simulator') {
            const cleanUrl = url.split('?')[0]; 
            window.open(`${cleanUrl}?auth=msletb_secure_launch&uid=${state.user.id}&cid=${id}`, '_blank');
        }
        else if (type === 'audio') { 
            const m = document.getElementById('modal-audio'); 
            const p = document.getElementById('audio-player'); 
            if(m && p) { 
                p.src = url; 
                m.classList.remove('hidden'); 
                if(!canDownload) p.setAttribute('controlsList', 'nodownload'); else p.removeAttribute('controlsList'); 
            } 
        }
        else if (type === 'file' || type === 'video') { 
            courseManager.openViewer(url, type, canDownload); 
        }
        else if (type === 'url') {
            // FIX: If it is YouTube and NOT forced external, open in Viewer
            if (isYouTube && !meta?.openExternal) {
                courseManager.openViewer(url, 'video', false);
            } else {
                window.open(url, '_blank');
            }
        }
        else if (type === 'assignment') { 
            isAdmin() ? assignmentManager.openGrading(id) : assignmentManager.openSubmit(id); 
        }
        else if (type === 'quiz') { 
            isAdmin() ? alert("Admins cannot take quizzes.") : quizManager.takeQuiz(id); 
        }
    },
    openViewer: (url, type, canDownload) => {
        const modal = document.getElementById('modal-viewer');
        const body = document.getElementById('viewer-body');
        const dlBtn = document.getElementById('viewer-download-btn');
        const titleEl = document.getElementById('viewer-title');
        
        modal.classList.remove('hidden');
        
        // 1. Configure Download Button
        if(dlBtn) {
            if (canDownload) {
                dlBtn.classList.remove('hidden');
                dlBtn.href = url;
            } else {
                dlBtn.classList.add('hidden');
                dlBtn.href = '#';
            }
        }
        
        body.innerHTML = '<div class="text-white flex items-center justify-center h-full"><i class="ph ph-spinner animate-spin text-4xl"></i></div>'; 

        // 2. Parse Extension & Title
        const cleanUrl = url.split('?')[0];
        const ext = cleanUrl.split('.').pop().toLowerCase();
        let fileName = url.split('/').pop().split('?')[0];
        
        // Detect YouTube
        const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
        
        if (isYouTube) {
            fileName = "YouTube Video"; 
            if(titleEl) titleEl.innerText = fileName;

            // Extract Video ID
            let videoId = '';
            if (url.includes('youtu.be')) {
                videoId = url.split('youtu.be/')[1].split('?')[0];
            } else if (url.includes('v=')) {
                videoId = url.split('v=')[1].split('&')[0];
            } else if (url.includes('embed/')) {
                videoId = url.split('embed/')[1].split('?')[0];
            }

            if(videoId) {
                body.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}" class="w-full h-full border-0" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>`;
                return;
            }
        }

        if(titleEl) titleEl.innerText = decodeURIComponent(fileName);

        // 3. Render Content based on Type (Strict Matching)
        if (type === 'video' || ['mp4', 'webm', 'ogg'].includes(ext)) {
            const controls = canDownload ? 'controls' : 'controls controlsList="nodownload"';
            body.innerHTML = `<video src="${url}" ${controls} class="max-h-full max-w-full shadow-lg rounded outline-none"></video>`;
        } 
        else if (['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)) {
            // OPTION A: Microsoft Office Viewer
            const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
            body.innerHTML = `<iframe src="${viewerUrl}" class="w-full h-full border-0 bg-white"></iframe>`;
        } 
        else if (['pdf', 'jpg', 'jpeg', 'png', 'gif'].includes(ext)) {
            // OPTION B: Native Browser Support (PDFs/Images)
            body.innerHTML = `<iframe src="${url}#toolbar=0&navpanes=0&scrollbar=0" class="w-full h-full border-0 bg-white"></iframe>`;
        } 
        else {
            // OPTION C: Fallback
            body.innerHTML = `
                <div class="text-white text-center p-8">
                    <i class="ph ph-file-x text-6xl mb-4 text-gray-500"></i>
                    <p class="text-xl font-bold">Preview not available</p>
                    <p class="text-sm text-gray-400 mt-2">This file type (${ext}) cannot be viewed in the browser.</p>
                    ${canDownload ? `<a href="${url}" target="_blank" class="mt-6 inline-block bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 rounded font-bold transition">Download File</a>` : ''}
                </div>
            `;
        }
    },
    closeViewer: () => { document.getElementById('modal-viewer').classList.add('hidden'); document.getElementById('viewer-body').innerHTML=''; },
    closeAudio: () => { const m = document.getElementById('modal-audio'); if(m) m.classList.add('hidden'); document.getElementById('audio-player')?.pause(); },
    
    // Team & Reports need to remain but shortened for readability here (Keep original logic)
    loadTeam: async () => { const el = document.getElementById('tab-team'); el.innerHTML = '<p class="p-4">Loading roster...</p>'; const { data: roster } = await sb.from('enrollments').select('*, profiles(email)').eq('course_id', state.activeCourse.id); const { data: invites } = await sb.from('invitations').select('*').eq('course_id', state.activeCourse.id); let html = `<div class="flex justify-between mb-6 items-end"><h2 class="text-xl font-bold text-gray-800">Class Roster</h2><div class="flex gap-2 items-center bg-gray-50 p-2 rounded border border-gray-200"><select id="role-in" class="border border-gray-300 p-1.5 rounded text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none"><option value="student">Student</option><option value="instructor">Instructor</option></select><input id="email-in" placeholder="Email Address" class="border border-gray-300 p-1.5 rounded text-sm w-64 focus:ring-2 focus:ring-teal-500 outline-none"><button onclick="courseManager.enroll()" class="bg-teal-600 text-white px-4 py-1.5 rounded text-sm font-bold shadow-sm hover:bg-teal-700">+ Invite</button></div></div>`; html += `<div class="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm"><table class="w-full text-sm text-left"><thead class="bg-gray-50 text-gray-500 uppercase font-semibold border-b border-gray-200"><tr><th class="p-4">Email</th><th class="p-4">Role</th><th class="p-4">Status</th><th class="p-4"></th></tr></thead><tbody class="divide-y divide-gray-100">`; invites?.forEach(i => html += `<tr class="bg-yellow-50"><td class="p-4 font-medium text-gray-700">${i.email}</td><td class="p-4 uppercase text-xs font-bold">${i.role}</td><td class="p-4"><span class="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs font-bold">Pending</span></td><td class="p-4 text-right"><button onclick="courseManager.delInvite(${i.id})" class="text-red-400 hover:text-red-600 p-1"><i class="ph ph-x-circle text-xl"></i></button></td></tr>`); roster?.forEach(m => html += `<tr class="hover:bg-gray-50"><td class="p-4 font-medium text-gray-800">${m.profiles?.email || 'Unknown'}</td><td class="p-4"><span class="px-2 py-1 rounded text-xs font-bold ${m.course_role==='instructor'?'bg-purple-100 text-purple-700':'bg-blue-100 text-blue-700'}">${m.course_role.toUpperCase()}</span></td><td class="p-4"><span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">Active</span></td><td class="p-4 text-right">${isAdmin() && m.user_id !== state.user.id ? `<button onclick="courseManager.delUser('${m.user_id}')" class="text-gray-400 hover:text-red-600 p-1"><i class="ph ph-trash text-lg"></i></button>` : ''}</td></tr>`); html += `</tbody></table></div>`; el.innerHTML = html; },
    enroll: async () => { const email = document.getElementById('email-in').value; const role = document.getElementById('role-in').value; if(!email) return ui.toast("Enter email", "error"); const { data: u } = await sb.from('profiles').select('id').eq('email', email).maybeSingle(); if(u) { await sb.from('enrollments').insert([{course_id:state.activeCourse.id, user_id:u.id, course_role:role}]); ui.toast("User Enrolled!", "success"); } else { await sb.from('invitations').insert([{course_id:state.activeCourse.id, email, role, invited_by:state.user.id}]); ui.toast("Invite Sent!", "success"); } courseManager.loadTeam(); },
    delInvite: async (id) => { if(confirm("Cancel invite?")) { await sb.from('invitations').delete().eq('id', id); courseManager.loadTeam(); }},
    delUser: async (uid) => { if(confirm("Remove user from course?")) { await sb.from('enrollments').delete().eq('course_id', state.activeCourse.id).eq('user_id', uid); courseManager.loadTeam(); }},
    loadReports: async () => { const el = document.getElementById('tab-reports'); el.innerHTML = '<div class="flex justify-center p-8"><i class="ph ph-spinner animate-spin text-3xl text-teal-600"></i></div>'; const { data: sections } = await sb.from('sections').select('id, title, modules(id, title, units(id, title, content(id, title, type)))').eq('course_id', state.activeCourse.id).order('position'); let gradableItems = []; sections?.forEach(s => s.modules?.forEach(m => m.units?.forEach(u => u.content?.forEach(c => { if(['assignment', 'quiz', 'simulator'].includes(c.type)) { gradableItems.push({ id: c.id, title: c.title, type: c.type, context: `${m.title} <br> <span class="text-gray-400 font-normal text-[10px] uppercase tracking-wide">${u.title}</span>` }); } })))); if (isAdmin()) { const { data: roster } = await sb.from('enrollments').select('user_id, profiles(email)').eq('course_id', state.activeCourse.id).eq('course_role', 'student'); if (!roster || roster.length === 0) { el.innerHTML = '<p class="text-gray-500 p-6">No students enrolled yet.</p>'; return; } const itemIds = gradableItems.map(i => i.id); const { data: allAssigns } = await sb.from('assignments').select('*').in('content_id', itemIds); const { data: allQuizzes } = await sb.from('quiz_results').select('*').in('content_id', itemIds).order('submitted_at', { ascending: true }); const gradebook = {}; roster.forEach(s => gradebook[s.user_id] = { email: s.profiles.email, data: {} }); allAssigns?.forEach(a => { if(gradebook[a.student_id]) gradebook[a.student_id].data[a.content_id] = { type: 'assignment', grade: a.grade || 'Submitted' }; }); allQuizzes?.forEach(q => { if(gradebook[q.user_id]) { if(!gradebook[q.user_id].data[q.content_id]) gradebook[q.user_id].data[q.content_id] = { type: 'quiz', history: [], best: null }; const info = getGradeInfo(q.score, q.total); gradebook[q.user_id].data[q.content_id].history.push(info.pct); if(!gradebook[q.user_id].data[q.content_id].best || info.pct > gradebook[q.user_id].data[q.content_id].best.pct) gradebook[q.user_id].data[q.content_id].best = info; } }); let tableHtml = `<div class="flex justify-between items-center mb-4"><h2 class="text-xl font-bold text-gray-800">Class Gradebook</h2><button onclick="courseManager.loadReports()" class="text-sm text-teal-600 hover:underline"><i class="ph ph-arrow-clockwise"></i> Refresh</button></div><div class="overflow-x-auto bg-white rounded-lg shadow border border-gray-200"><table class="w-full text-sm text-left whitespace-nowrap"><thead class="bg-gray-50 text-gray-600 font-bold border-b border-gray-200"><tr><th class="p-4 sticky left-0 bg-gray-50 z-10 border-r">Student</th>${gradableItems.map(i => `<th class="p-4 min-w-[180px] border-r border-gray-100"><div class="text-xs font-bold text-teal-700 mb-1">${i.context}</div><div class="flex items-center gap-1 font-normal text-gray-500">${getContentEmoji(i.type)} ${i.title}</div></th>`).join('')}</tr></thead><tbody class="divide-y divide-gray-100">`; roster.forEach(student => { const row = gradebook[student.user_id]; tableHtml += `<tr class="hover:bg-gray-50"><td class="p-4 font-medium text-gray-900 sticky left-0 bg-white border-r border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">${row.email}</td>`; gradableItems.forEach(item => { const entry = row.data[item.id]; let cellHtml = '<span class="text-gray-300 text-xs italic">Not started</span>'; if (entry) { if (entry.type === 'quiz') { cellHtml = `<div class="flex flex-col gap-1"><span class="${entry.best.color} px-2 py-0.5 rounded text-xs font-bold">${entry.best.pct}% (${entry.best.label})</span><div class="text-[10px] text-gray-400">Attempts: ${entry.history.length}</div></div>`; } else { cellHtml = `<span class="${entry.grade === 'Pass' ? 'text-green-600 bg-green-50' : (entry.grade==='Fail'?'text-red-600 bg-red-50':'text-yellow-600 bg-yellow-50')} px-2 py-1 rounded font-bold text-xs">${entry.grade}</span>`; } } tableHtml += `<td class="p-3 border-r border-gray-50 align-top">${cellHtml}</td>`; }); tableHtml += `</tr>`; }); tableHtml += `</tbody></table></div>`; el.innerHTML = tableHtml; return; } const { data: assigns } = await sb.from('assignments').select('*').eq('student_id', state.user.id); const { data: quizzes } = await sb.from('quiz_results').select('*').eq('user_id', state.user.id).order('submitted_at', { ascending: true }); const lookup = {}; assigns?.forEach(a => lookup[a.content_id] = { ...a, type: 'assignment' }); const quizLookup = {}; quizzes?.forEach(q => { if(!quizLookup[q.content_id]) quizLookup[q.content_id] = { history: [], best: null }; const info = getGradeInfo(q.score, q.total); quizLookup[q.content_id].history.push({ ...info, date: new Date(q.submitted_at).toLocaleDateString() }); if(!quizLookup[q.content_id].best || info.pct > quizLookup[q.content_id].best.pct) quizLookup[q.content_id].best = info; }); let done = 0; gradableItems.forEach(i => { if (lookup[i.id] || (quizLookup[i.id] && quizLookup[i.id].history.length > 0)) done++; }); const progress = gradableItems.length === 0 ? 0 : Math.round((done/gradableItems.length)*100); let html = `<div class="bg-white p-6 rounded-lg shadow border border-gray-200 mb-6"><div class="flex justify-between items-end mb-2"><h2 class="text-lg font-bold text-gray-700">Your Course Progress</h2><span class="text-2xl font-bold text-teal-600">${progress}%</span></div><div class="w-full bg-gray-200 rounded-full h-3"><div class="bg-teal-500 h-3 rounded-full transition-all" style="width: ${progress}%"></div></div></div><div class="space-y-4">`; sections?.forEach((sec, idx) => { let hasGradable = false; let sectionHtml = `<div class="p-4 border-t border-gray-100 space-y-4">`; sec.modules?.forEach(mod => { mod.units?.forEach(unit => { const graded = unit.content?.filter(c => ['assignment','quiz','simulator'].includes(c.type)) || []; if(graded.length > 0) { hasGradable = true; sectionHtml += `<div class="mb-2"><h5 class="text-xs font-bold text-gray-400 uppercase mb-2">${unit.title}</h5><div class="space-y-3">`; graded.forEach(item => { if(item.type === 'quiz') { const qData = quizLookup[item.id]; if(qData) { sectionHtml += `<div class="bg-white border border-gray-200 p-4 rounded-lg shadow-sm"><div class="flex justify-between items-start"><div><span class="font-bold text-gray-800">${item.title}</span><div class="text-xs text-gray-500 mt-1">Attempts: ${qData.history.length}</div></div><span class="${qData.best.color} px-3 py-1 rounded font-bold text-sm">${qData.best.pct}% (${qData.best.label})</span></div></div>`; } else { sectionHtml += `<div class="bg-white border border-gray-200 p-3 rounded flex justify-between items-center opacity-75"><span class="text-sm text-gray-600">${item.title}</span><span class="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">Not Taken</span></div>`; } } else { const data = lookup[item.id]; const status = data ? (data.grade || 'Submitted') : 'Not Started'; const style = data ? (data.grade === 'Pass' ? 'bg-green-100 text-green-800' : (data.grade==='Fail'?'bg-red-100 text-red-800':'bg-yellow-100 text-yellow-800')) : 'bg-gray-100 text-gray-500'; sectionHtml += `<div class="bg-white border border-gray-200 p-3 rounded flex justify-between items-center"><span class="text-sm font-medium text-gray-700">${item.title}</span><span class="${style} px-2 py-1 rounded text-xs font-bold">${status}</span></div>`; } }); sectionHtml += `</div></div>`; } }); }); sectionHtml += `</div>`; if(hasGradable) html += `<details ${idx===0 ? 'open' : ''} class="group bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"><summary class="flex justify-between items-center p-4 cursor-pointer bg-gray-50 hover:bg-gray-100 list-none"><h3 class="font-bold text-slate-800 flex items-center gap-2"><i class="ph ph-caret-right transition-transform group-open:rotate-90"></i> ${sec.title}</h3></summary>${sectionHtml}</details>`; }); html += `</div>`; el.innerHTML = html; },
    
    openBulkEdit: async () => { const { data: sections } = await sb.from('sections').select('id, title, position, modules(id, title, position, units(id, title, total_hours_required, position))').eq('course_id', state.activeCourse.id).order('position', { ascending: true }); let rows = []; sections?.forEach(sec => { rows.push({ type: 'section', id: sec.id, title: sec.title, indent: 0 }); rows.push({ type: 'btn-module', parentId: sec.id, indent: 1 }); sec.modules?.sort((a,b)=>a.position-b.position).forEach(mod => { rows.push({ type: 'module', id: mod.id, title: mod.title, indent: 1 }); rows.push({ type: 'btn-unit', parentId: mod.id, indent: 2 }); mod.units?.sort((a,b)=>a.position-b.position).forEach(unit => { rows.push({ type: 'unit', id: unit.id, title: unit.title, hours: unit.total_hours_required, indent: 2 }); }); }); }); rows.push({ type: 'btn-section', indent: 0 }); const modal = document.createElement('div'); modal.className = "fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-8 fade-in"; modal.innerHTML = `<div class="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col"><div class="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl"><h3 class="font-bold text-lg">Bulk Edit: ${state.activeCourse.title}</h3><button onclick="this.closest('.fixed').remove(); courseManager.loadSyllabus();" class="text-gray-500 hover:text-red-500"><i class="ph ph-x text-xl"></i></button></div><div class="flex-1 overflow-y-auto p-0"><table class="w-full text-sm text-left"><thead class="bg-gray-100 text-gray-600 sticky top-0 z-10 shadow-sm"><tr><th class="p-3 w-24 pl-6">Type</th><th class="p-3">Title</th><th class="p-3 w-32">Hours</th></tr></thead><tbody class="divide-y divide-gray-100">${rows.map(row => { if(row.type.startsWith('btn-')) { const itemType = row.type.replace('btn-', ''); return `<tr class="bg-slate-50 hover:bg-slate-100"><td></td><td class="p-2"><button onclick="courseManager.bulkCreate('${itemType}', ${row.parentId || 0})" style="margin-left: ${row.indent * 1.5}rem" class="text-xs text-teal-600 hover:text-teal-800 font-bold flex items-center gap-1 px-2 py-1 rounded hover:bg-teal-50 border border-transparent hover:border-teal-200 transition"><i class="ph ph-plus-circle"></i> Add ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}</button></td><td></td></tr>`; } const isUnit = row.type === 'unit'; const typeLabel = row.type.charAt(0).toUpperCase() + row.type.slice(1); const typeColor = row.type === 'section' ? 'bg-gray-200 text-gray-800' : (row.type === 'module' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'); const table = row.type + 's'; return `<tr class="${row.type === 'section' ? 'bg-gray-50' : 'bg-white'} hover:bg-slate-50 transition border-b border-gray-100"><td class="p-2 pl-4 align-middle"><span class="text-[10px] font-bold ${typeColor} px-2 py-1 rounded uppercase tracking-wider">${typeLabel}</span></td><td class="p-2"><div style="padding-left: ${row.indent * 1.5}rem" class="relative flex items-center">${row.indent > 0 ? `<div class="absolute left-0 top-1/2 -translate-y-1/2 w-[${row.indent * 1.5}rem] h-px bg-gray-300"></div>` : ''}<input type="text" class="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-teal-500 focus:outline-none py-1 px-2 font-medium text-gray-700" value="${row.title}" onchange="courseManager.updateEntity('${table}', ${row.id}, 'title', this.value)"></div></td><td class="p-2">${isUnit ? `<div class="flex items-center gap-1"><input type="number" step="0.5" class="border p-1 rounded w-20 text-center bg-white focus:ring-2 focus:ring-teal-500 outline-none" value="${row.hours || 0}" onchange="courseManager.updateEntity('units', ${row.id}, 'total_hours_required', this.value)"><span class="text-xs text-gray-400">h</span></div>` : ''}</td></tr>`; }).join('')}</tbody></table></div><div class="p-4 border-t bg-gray-50 flex justify-end"><button onclick="this.closest('.fixed').remove(); courseManager.loadSyllabus();" class="bg-teal-600 text-white px-6 py-2 rounded shadow hover:bg-teal-700 font-bold">Done & Refresh</button></div></div>`; document.body.appendChild(modal); }
};