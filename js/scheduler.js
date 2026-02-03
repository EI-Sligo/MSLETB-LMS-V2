import { sb, state } from './config.js';
import { ui } from './ui.js';
import { courseManager } from './courseManager.js';
import { isAdmin, getIrishHolidays } from './utils.js';

export const schedulerManager = {
    currentDate: new Date(),
    schedules: [],

    init: async () => {
        if(typeof isAdmin !== 'undefined' && isAdmin()) {
             const btn = document.getElementById('tab-btn-schedule');
             if(btn) btn.classList.remove('hidden');
        }
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

        state.structure.forEach(sec => {
            const modules = sec.modules?.sort((a,b)=>a.position-b.position) || [];
            modules.forEach(mod => {
                if(!mod.units?.length) return;
                const details = document.createElement('details');
                details.open = true;
                details.className = "mb-2 group border border-gray-200 rounded bg-white overflow-hidden";
                details.innerHTML = `<summary class="flex items-center gap-2 p-2 bg-gray-50 cursor-pointer list-none text-xs font-bold text-gray-600 uppercase"><div class="w-2 h-2 rounded-full" style="background:${mod.color}"></div><span class="flex-1 truncate">${mod.title}</span><i class="ph ph-caret-down transition group-open:rotate-180"></i></summary><div class="unit-list p-2 space-y-1 bg-white"></div>`;
                const cont = details.querySelector('.unit-list');
                mod.units.sort((a,b)=>a.position-b.position).forEach(u => {
                    const scheduled = map[u.id] || 0;
                    const total = u.total_hours_required || 0;
                    const done = total > 0 && scheduled >= total;
                    const pct = total > 0 ? Math.min((scheduled/total)*100, 100) : 0;
                    const el = document.createElement('div');
                    el.draggable = true;
                    el.className = `p-2 border rounded cursor-grab hover:shadow-md bg-white ${done ? 'border-green-300' : 'border-gray-200'}`;
                    el.ondragstart = (e) => { e.dataTransfer.setData('type','unit'); e.dataTransfer.setData('id',u.id); e.dataTransfer.setData('title',u.title); };
                    el.innerHTML = `<div class="flex justify-between text-[10px] font-bold text-gray-700 mb-1"><span class="truncate">${u.title}</span>${done ? '<i class="ph ph-check-circle text-green-500"></i>' : ''}</div><div class="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden"><div class="h-full ${done?'bg-green-500':'bg-teal-500'}" style="width:${pct}%"></div></div><div class="text-[9px] text-right text-gray-400 mt-0.5">${scheduled}/${total}h</div>`;
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

        if (type === 'other') {
            const customName = prompt("Enter label:", "Meeting");
            if (!customName) return; 
            title = customName;
        }

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
            await sb.from('schedules').insert([{ course_id: state.activeCourse.id, unit_id: type === 'unit' ? parseInt(unitId) : null, type: type, label: type !== 'unit' ? title : null, date: dateStr, hours_assigned: hours }]);
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

        // Helper to find unit details (Title & Color) from local structure
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
                    
                    // FIX: Default label to 'Item', but overwrite it if we find the unit
                    let displayLabel = item.label || 'Item';

                    if (item.type === 'unit' && item.unit_id) {
                         const details = getUnitDetails(item.unit_id);
                         if(details) {
                             bgColor = details.color; 
                             borderColor = '#94a3b8';
                             textColor = '#334155';
                             displayLabel = details.title; // <--- This fixes the "Item" name issue
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
                    
                    // FIX: Use the resolved displayLabel
                    div.innerHTML = `<strong>${item.hours_assigned || 0}h</strong> ${displayLabel}`;
                    
                    div.onclick = (e) => { e.stopPropagation(); schedulerManager.openContextMenu(item, e); };
                    div.ondragstart = (e) => { e.dataTransfer.setData('moveId', item.id); e.dataTransfer.setData('type', 'move'); };

                    cell.appendChild(div);
                });
            }
            grid.appendChild(cell);
        }
    },
    changeMonth: (delta) => { schedulerManager.currentDate.setMonth(schedulerManager.currentDate.getMonth() + delta); schedulerManager.renderCalendar(); },
    openContextMenu: (item, e) => { const menu = document.getElementById('modal-sched-ctx'); const title = document.getElementById('ctx-item-title'); const dateEl = document.getElementById('ctx-item-date'); let displayLabel = item.label || 'Item'; if(item.type === 'unit' && item.unit_id && state.structure) { for(const sec of state.structure) { for(const mod of (sec.modules||[])) { const u = mod.units?.find(x => x.id == item.unit_id); if(u) displayLabel = u.title; } } } title.innerText = displayLabel; dateEl.innerText = new Date(item.date).toDateString(); menu.classList.remove('hidden'); document.getElementById('btn-ctx-delete').onclick = () => schedulerManager.deleteSlot(item.id); document.getElementById('btn-ctx-global-back').onclick = () => schedulerManager.shiftGlobal(item.date, -1); document.getElementById('btn-ctx-global-fwd').onclick = () => schedulerManager.shiftGlobal(item.date, 1); const modId = item.type==='unit' ? state.structure.flatMap(s=>s.modules).find(m=>m.units.some(u=>u.id==item.unit_id))?.id : null; const modBtns = ['btn-ctx-mod-back', 'btn-ctx-mod-fwd']; if (modId) { document.getElementById('btn-ctx-mod-back').onclick = () => schedulerManager.shiftModule(modId, item.date, -1); document.getElementById('btn-ctx-mod-fwd').onclick = () => schedulerManager.shiftModule(modId, item.date, 1); modBtns.forEach(id => document.getElementById(id).classList.remove('opacity-50', 'pointer-events-none')); } else { modBtns.forEach(id => document.getElementById(id).classList.add('opacity-50', 'pointer-events-none')); } },
    deleteSlot: async (id) => { if(confirm("Delete this slot?")) { await sb.from('schedules').delete().eq('id', id); document.getElementById('modal-sched-ctx').classList.add('hidden'); schedulerManager.init(); } },
    shiftFutureItems: async (fromDateStr, days) => { const { data: items } = await sb.from('schedules').select('*').eq('course_id', state.activeCourse.id).gte('date', fromDateStr); if (!items || items.length === 0) return; const addWorkingDays = (startDate, days) => { let current = new Date(startDate); let added = 0; const direction = days > 0 ? 1 : -1; days = Math.abs(days); while (added < days) { current.setDate(current.getDate() + direction); const d = current.getDay(); if (d !== 0 && d !== 6) added++; } return current; }; for (const item of items) { const oldDate = new Date(item.date); const newDate = addWorkingDays(oldDate, days); await sb.from('schedules').update({ date: newDate.toISOString().split('T')[0] }).eq('id', item.id); } },
    shiftGlobal: async (fromDateStr, direction) => { document.getElementById('modal-sched-ctx').classList.add('hidden'); ui.toast("Shifting schedule...", "info"); await schedulerManager.shiftFutureItems(fromDateStr, direction); schedulerManager.init(); },
    shiftModule: async (moduleId, fromDateStr, direction) => { document.getElementById('modal-sched-ctx').classList.add('hidden'); ui.toast("Shifting module...", "info"); const { data: units } = await sb.from('units').select('id').eq('module_id', moduleId); const unitIds = units.map(u => u.id); const { data: items } = await sb.from('schedules').select('*').eq('course_id', state.activeCourse.id).in('unit_id', unitIds).gte('date', fromDateStr); if (!items) return; const addWorkingDays = (startDate, days) => { let current = new Date(startDate); let added = 0; const direction = days > 0 ? 1 : -1; days = Math.abs(days); while (added < days) { current.setDate(current.getDate() + direction); const d = current.getDay(); if (d !== 0 && d !== 6) added++; } return current; }; for (const item of items) { const newDate = addWorkingDays(new Date(item.date), direction); await sb.from('schedules').update({ date: newDate.toISOString().split('T')[0] }).eq('id', item.id); } schedulerManager.init(); },
    clearAll: async () => { if(confirm("⚠ WARNING: Delete ENTIRE schedule?")) { await sb.from('schedules').delete().eq('course_id', state.activeCourse.id); schedulerManager.init(); } },
    resetDates: async () => {
        // 1. Find the earliest date in the current schedule
        const { data: items } = await sb.from('schedules')
            .select('date')
            .eq('course_id', state.activeCourse.id)
            .order('date', { ascending: true })
            .limit(1);

        if (!items || items.length === 0) return ui.toast("Schedule is empty.", "info");

        const currentStart = items[0].date;
        
        // 2. Prompt user for the new date
        const newStart = prompt(`Current Start Date: ${currentStart}\n\nEnter New Start Date (YYYY-MM-DD):`, currentStart);
        
        // Validate input
        if (!newStart || newStart === currentStart) return;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(newStart)) {
            return alert("Invalid date format. Please use YYYY-MM-DD");
        }

        ui.toast("Rescheduling entire course...", "info");

        // 3. Calculate the difference in days
        const d1 = new Date(currentStart);
        const d2 = new Date(newStart);
        const diffTime = d2 - d1;
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return;

        // 4. Fetch all items and apply the shift
        const { data: allItems } = await sb.from('schedules')
            .select('id, date')
            .eq('course_id', state.activeCourse.id);
        
        for (const item of allItems) {
            const oldDate = new Date(item.date);
            const newDate = new Date(oldDate);
            newDate.setDate(oldDate.getDate() + diffDays);
            
            await sb.from('schedules').update({ 
                date: newDate.toISOString().split('T')[0] 
            }).eq('id', item.id);
        }
        
        schedulerManager.init();
        ui.toast("Schedule Updated!", "success");
    }
};