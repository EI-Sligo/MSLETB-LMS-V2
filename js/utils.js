import { state } from './config.js';
import { assignmentManager, quizManager, contentModal } from './modals.js';
import { courseManager } from './courseManager.js';

export function isAdmin() { 
    return state.profile && ['instructor', 'super_admin'].includes(state.profile.global_role); 
}

export function getContentEmoji(type) {
    const map = { 'audio': '🎧', 'video': '🎥', 'simulator': '⚡', 'assignment': '📝', 'quiz': '✅', 'url': '🔗' };
    return map[type] || '📄';
}

export function getGradeInfo(score, total) {
    if (!total || total === 0) return { pct: 0, label: 'No Data', color: 'bg-gray-100 text-gray-500' };
    const pct = Math.round((score / total) * 100);
    let label = 'Fail', color = 'bg-red-100 text-red-700';
    if (pct >= 85) { label = 'Credit'; color = 'bg-purple-100 text-purple-700'; } 
    else if (pct >= 70) { label = 'Pass'; color = 'bg-green-100 text-green-700'; }
    return { pct, label, color };
}

export function getIrishHolidays(year) {
    const holidays = [];
    
    // SAFE DATE FORMATTER: Ensures we get the local YYYY-MM-DD
    // This prevents the "Summer Time" bug where 00:00 becomes 23:00 previous day
    const toDateStr = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    // 1. Fixed Holidays (New Year & St Patricks)
    const addObserved = (month, day) => {
        const date = new Date(year, month - 1, day);
        const d = date.getDay(); // 0=Sun, 6=Sat
        if (d === 0) date.setDate(date.getDate() + 1); // Sun -> Mon
        else if (d === 6) date.setDate(date.getDate() + 2); // Sat -> Mon
        holidays.push(toDateStr(date));
    };

    addObserved(1, 1);  // New Year
    addObserved(3, 17); // St Patrick

    // 2. Christmas & St Stephens (Complex Weekend Logic)
    const xDay = new Date(year, 11, 25).getDay();
    
    if (xDay === 5) { // Christmas is Friday
        holidays.push(`${year}-12-25`);
        holidays.push(`${year}-12-28`); // Stephens (Sat) moves to Mon
    } else if (xDay === 6) { // Christmas is Saturday
        holidays.push(`${year}-12-27`); // Xmas (Sat) moves to Mon
        holidays.push(`${year}-12-28`); // Stephens (Sun) moves to Tue
    } else if (xDay === 0) { // Christmas is Sunday
        holidays.push(`${year}-12-26`); // Stephens is Mon (Normal)
        holidays.push(`${year}-12-27`); // Xmas (Sun) moves to Tue
    } else {
        // Normal Weekdays
        holidays.push(`${year}-12-25`);
        holidays.push(`${year}-12-26`);
    }

    // 3. St Brigid's (First Mon in Feb, unless Feb 1st is Friday)
    let feb1 = new Date(year, 1, 1);
    if (feb1.getDay() === 5) {
        holidays.push(toDateStr(feb1));
    } else {
        while (feb1.getDay() !== 1) feb1.setDate(feb1.getDate() + 1);
        holidays.push(toDateStr(feb1));
    }

    // 4. Easter (Good Fri & Easter Mon)
    const f=Math.floor, G=year%19, C=f(year/100), H=(C-f(C/4)-f((8*C+13)/25)+19*G+15)%30;
    const I=H-f(H/28)*(1-f(29/(H+1))*f((21-G)/11)), J=(year+f(year/4)+I+2-C+f(C/4))%7, L=I-J;
    const m=3+f((L+40)/44), d=L+28-31*f(m/4);
    const easter = new Date(year, m-1, d);
    
    const goodFri = new Date(easter); goodFri.setDate(easter.getDate()-2);
    const easterMon = new Date(easter); easterMon.setDate(easter.getDate()+1);
    holidays.push(toDateStr(goodFri), toDateStr(easterMon));

    // 5. Monthly Bank Holidays (May, June, August)
    [4, 5, 7].forEach(mIdx => { 
        let date = new Date(year, mIdx, 1);
        while (date.getDay() !== 1) date.setDate(date.getDate() + 1);
        holidays.push(toDateStr(date));
    });
    
    // 6. October Bank Holiday (Last Monday)
    let oct = new Date(year, 10, 0); // 0th day of Nov = 31st Oct
    while (oct.getDay() !== 1) oct.setDate(oct.getDate() - 1);
    holidays.push(toDateStr(oct));

    return holidays;
}

export function renderContentItem(file, unitId, myWork) {
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
    
    // SAFE JSON for HTML Attributes
    const safeFile = JSON.stringify(file).replace(/'/g, "&#39;").replace(/"/g, "&quot;");

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
                        <button onclick='contentModal.open(${unitId}, ${safeFile})' class="text-gray-400 hover:text-blue-500 p-1"><i class="ph ph-pencil-simple"></i></button>
                        <button onclick="courseManager.deleteItem('content', ${file.id})" class="text-gray-400 hover:text-red-500 p-1"><i class="ph ph-trash"></i></button>
                    </div>
                ` : ''}
            </div>
        </div>
        ${descHtml}
    </div>`;
}