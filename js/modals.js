import { sb, state } from './config.js';
import { ui } from './ui.js';
import { courseManager } from './courseManager.js';

export const assignmentManager = {
    openSubmit: (contentId) => {
        document.getElementById('modal-submit-assignment').classList.remove('hidden');
        document.getElementById('input-submit-file').dataset.cid = contentId;
    },
    closeSubmit: () => {
        document.getElementById('modal-submit-assignment').classList.add('hidden');
        document.getElementById('input-submit-file').value = ''; 
        document.getElementById('input-submit-comment').value = '';
    },
    submit: async () => {
        const fileIn = document.getElementById('input-submit-file');
        const file = fileIn.files[0];
        const cid = fileIn.dataset.cid;
        const comment = document.getElementById('input-submit-comment').value;
        
        if(fileIn.files.length === 0 && !comment) return ui.toast("File or comment required", "error");
        
        let fileUrl = null;
        if(file) {
            // FIX: Add extension to filename
            const ext = file.name.split('.').pop();
            const path = `assignments/${state.user.id}_${Date.now()}.${ext}`;
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
        document.getElementById('modal-grade-assignment').classList.remove('hidden'); 
        const list = document.getElementById('grading-list'); 
        list.innerHTML = '<div class="p-4 text-center"><i class="ph ph-spinner animate-spin text-2xl"></i></div>';
        
        const { data } = await sb.from('assignments').select('*, profiles(email)').eq('content_id', contentId);
        
        if(!data || data.length === 0) { list.innerHTML = '<p class="p-4 text-gray-500">No submissions.</p>'; return; }
        
        list.innerHTML = data.map(sub => {
            let fileDisplay = '';
            if (sub.file_url && sub.file_url.includes('simulator_snapshot')) {
                const simUrl = `./simulator/index.html?auth=msletb_secure_launch&viewSubmission=${sub.id}`;
                fileDisplay = `<a href="${simUrl}" target="_blank" class="text-xs font-bold text-purple-600 bg-purple-100 px-3 py-1 rounded border border-purple-200 hover:bg-purple-200 flex items-center gap-1 w-fit transition"><i class="ph ph-circuitry"></i> View Circuit</a>`;
            } else if (sub.file_url) {
                fileDisplay = `<a href="${sub.file_url}" target="_blank" class="text-blue-600 text-xs hover:underline flex items-center gap-1"><i class="ph ph-download"></i> File</a>`;
            }

            return `
            <div class="border-b p-3 flex justify-between items-center bg-white mb-2 rounded shadow-sm">
                <div>
                    <div class="font-bold text-sm">${sub.profiles?.email || 'Unknown'}</div>
                    ${fileDisplay}
                    ${sub.comments ? `<div class="text-xs text-gray-500 italic mt-1">"${sub.comments}"</div>` : ''}
                </div>
                <div class="flex gap-2 items-center">
                    <span class="text-xs font-bold px-2 py-1 rounded ${sub.grade==='Pass'?'bg-green-100 text-green-700':(sub.grade==='Fail'?'bg-red-100 text-red-700':'bg-yellow-100 text-yellow-700')}">${sub.grade || 'Pending'}</span>
                    <select onchange="assignmentManager.grade(${sub.id}, this.value)" class="border p-1 text-xs rounded bg-gray-50">
                        <option value="">Grade...</option><option value="Pass">Pass</option><option value="Fail">Fail</option><option value="Credit">Credit</option><option value="Retry">Retry</option>
                    </select>
                </div>
            </div>`;
        }).join('');
    },
    closeGrading: () => document.getElementById('modal-grade-assignment').classList.add('hidden'),
    grade: async (id, val) => { await sb.from('assignments').update({ grade: val }).eq('id', id); ui.toast("Graded!"); } 
};

export const quizManager = {
    addQuestionUI: (data = null) => {
        const div = document.createElement('div');
        div.className = "question-card-ui border p-3 rounded-lg bg-gray-50 mb-3 shadow-sm relative border-l-4 border-l-teal-500";
        const unique = Date.now() + Math.random().toString(16).slice(2);
        
        div.innerHTML = `
            <div class="mb-3 space-y-2">
                <input placeholder="Question Text" class="w-full border border-gray-300 p-2 rounded text-sm q-text focus:ring-2 focus:ring-teal-500 outline-none" 
                    value="${data ? (data.text || data.question).replace(/"/g, '&quot;') : ''}" 
                    onpaste="quizManager.handleImagePaste(event, this)">
                
                <div class="flex gap-2">
                    <input placeholder="Image URL (Optional) or Paste (Ctrl+V)" 
                        class="flex-1 border border-gray-300 p-1.5 rounded text-xs bg-white q-image text-gray-600 focus:ring-1 focus:ring-teal-500" 
                        value="${data && data.image ? data.image : ''}" 
                        onpaste="quizManager.handleImagePaste(event, this)">
                    <label class="cursor-pointer bg-white border border-gray-300 hover:bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs flex items-center gap-1">
                        <i class="ph ph-upload-simple"></i> <input type="file" accept="image/*" class="hidden" onchange="quizManager.uploadQuestionImage(this)">
                    </label>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
                ${[0,1,2,3].map(i => `
                    <div class="flex items-center bg-white border border-gray-200 rounded px-2 py-1">
                        <input type="radio" name="correct-${unique}" value="${i}" class="mr-2 accent-teal-600" ${data && parseInt(data.correct) === i ? 'checked' : ''}>
                        <input placeholder="Option ${i+1}" class="w-full text-xs outline-none bg-transparent q-opt" value="${data && data.options[i] ? data.options[i].replace(/"/g, '&quot;') : ''}">
                    </div>`).join('')}
            </div>
            <button onclick="this.parentElement.remove()" class="absolute top-2 right-2 text-gray-400 hover:text-red-500 p-1"><i class="ph ph-trash"></i></button>
        `;
        document.getElementById('quiz-questions-list').appendChild(div);
    },
    
    uploadQuestionImage: async (input) => { 
        const file = input.files[0]; 
        if (!file) return; 
        const textInput = input.closest('.question-card-ui').querySelector('.q-image'); 
        const originalPlaceholder = textInput.placeholder; 
        textInput.value = ''; textInput.placeholder = "⏳ Uploading..."; textInput.disabled = true; 
        try { 
            const ext = file.name.split('.').pop(); 
            const path = `quiz_images/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`; 
            const { error } = await sb.storage.from('course_content').upload(path, file); 
            if (error) throw error; 
            const { data } = sb.storage.from('course_content').getPublicUrl(path); 
            textInput.value = data.publicUrl; 
            ui.toast("Image uploaded!", "success"); 
        } catch (e) { console.error(e); ui.toast("Upload failed", "error"); } 
        finally { textInput.disabled = false; textInput.placeholder = originalPlaceholder; } 
    },
    
    handleImagePaste: async (e, inputEl) => { 
        const items = (e.clipboardData || e.originalEvent.clipboardData).items; 
        let file = null; 
        for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf("image") === 0) { file = items[i].getAsFile(); break; } } 
        if (!file) return; 
        e.preventDefault(); 
        const row = inputEl.closest('.question-card-ui'); 
        const imgInput = row.querySelector('.q-image'); 
        imgInput.placeholder = "⏳ Uploading pasted image..."; imgInput.disabled = true; 
        try { 
            const path = `quiz_images/${Date.now()}_paste.png`; 
            const { error } = await sb.storage.from('course_content').upload(path, file); 
            if (error) throw error; 
            const { data } = sb.storage.from('course_content').getPublicUrl(path); 
            imgInput.value = data.publicUrl; 
            ui.toast("Pasted image uploaded!", "success"); 
        } catch (err) { ui.toast("Paste upload failed", "error"); } 
        finally { imgInput.disabled = false; } 
    },
    
    takeQuiz: async (id) => { 
        const { data } = await sb.from('content').select('*').eq('id', id).single(); 
        if(!data || !data.data?.questions) return ui.toast("Error loading quiz", "error"); 
        document.getElementById('modal-take-quiz').classList.remove('hidden'); 
        document.getElementById('quiz-title-display').innerText = data.title; 
        const container = document.getElementById('quiz-body'); container.innerHTML = ''; container.dataset.id = id; 
        let allQuestions = [...data.data.questions]; 
        for (let i = allQuestions.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]]; } 
        const limit = data.data.questionCount || 10; 
        const selectedQuestions = allQuestions.slice(0, limit); 
        container.dataset.questions = JSON.stringify(selectedQuestions); 
        selectedQuestions.forEach((q, idx) => { 
            const qEl = document.createElement('div'); qEl.className = "mb-4 border-b pb-4"; 
            const imgHtml = q.image ? `<img src="${q.image}" class="max-w-full h-auto max-h-64 rounded mb-3 border border-gray-200 block shadow-sm">` : ''; 
            qEl.innerHTML = `<p class="font-bold mb-3 text-gray-800 text-lg">${idx+1}. ${q.text || q.question}</p>${imgHtml}<div class="space-y-2">${q.options.map((opt, i) => `<label class="flex items-center gap-3 p-3 border border-gray-200 hover:bg-teal-50 hover:border-teal-200 rounded-lg cursor-pointer transition group"><input type="radio" name="q-${idx}" value="${i}" class="w-4 h-4 text-teal-600 focus:ring-teal-500"><span class="text-sm text-gray-700 group-hover:text-teal-900">${opt}</span></label>`).join('')}</div>`; 
            container.appendChild(qEl); 
        }); 
    },
    
    closeTakeQuiz: () => document.getElementById('modal-take-quiz').classList.add('hidden'),
    
    submitQuiz: async () => { 
        const container = document.getElementById('quiz-body'); 
        const questions = JSON.parse(container.dataset.questions); 
        let score = 0; let userAnswers = []; 
        questions.forEach((q, idx) => { const selected = document.querySelector(`input[name="q-${idx}"]:checked`); const val = selected ? parseInt(selected.value) : -1; userAnswers.push(val); if(val === parseInt(q.correct)) score++; }); 
        await sb.from('quiz_results').insert([{ user_id: state.user.id, content_id: container.dataset.id, score: score, total: questions.length }]); 
        ui.toast(`Submitted! Score: ${score}/${questions.length}`, "success"); 
        quizManager.renderReview(questions, userAnswers, score); 
    },
    
    renderReview: (questions, userAnswers, score) => { 
        const container = document.getElementById('quiz-body'); 
        const percentage = Math.round((score / questions.length) * 100); 
        let html = `<div class="text-center mb-6 border-b pb-4"><h2 class="text-3xl font-bold ${percentage >= 50 ? 'text-green-600' : 'text-red-600'}">${percentage}%</h2><p class="text-gray-500">You scored ${score} out of ${questions.length}</p></div><div class="space-y-6">`; 
        questions.forEach((q, idx) => { 
            const userAns = userAnswers[idx]; const correctAns = parseInt(q.correct); const isCorrect = userAns === correctAns; 
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
        html += `</div>`; container.innerHTML = html; 
        const footerBtn = document.querySelector('#modal-take-quiz .border-t button'); 
        if(footerBtn) { footerBtn.innerText = "Close Results"; footerBtn.className = "px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded font-bold shadow"; footerBtn.onclick = () => quizManager.closeTakeQuiz(); } 
    }
};

export const entityModal = {
    type: null, id: null, parentId: null,
    openFromEl: (el, type) => { 
        const id = el.dataset.id; const title = el.dataset.title; 
        const desc = el.dataset.desc; const image = el.dataset.image; 
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
        if(id) { const { data } = await sb.from(type + 's').select('*').eq('id', id).single(); item = data; } 
        document.getElementById('entity-visible').checked = item ? (item.is_visible !== false) : true; 
        const hrsWrapper = document.getElementById('entity-hours-wrapper'); 
        if(type === 'unit') { 
            hrsWrapper.classList.remove('hidden'); 
            document.getElementById('entity-hours').value = item ? (item.total_hours_required || 0) : 0; 
        } else { hrsWrapper.classList.add('hidden'); } 
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
        const btn = document.getElementById('btn-save-entity'); 
        const originalText = btn.innerText; btn.innerText = '⏳ Saving...'; btn.disabled = true; 
        try { 
            const title = document.getElementById('entity-title').value; 
            const desc = document.getElementById('entity-desc').value; 
            const isVisible = document.getElementById('entity-visible').checked; 
            const totalHours = document.getElementById('entity-hours').value; 
            let imageUrl = null; 
            if(document.getElementById('entity-image-url') && !document.getElementById('entity-image-url').classList.contains('hidden')) { imageUrl = document.getElementById('entity-image-url').value; } 
            else { 
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
            if (entityModal.type === 'course') import('./dashboard.js').then(m => m.dashboard.loadCourses()); 
            else courseManager.loadSyllabus(); 
        } catch(e) { console.error(e); ui.toast(e.message, 'error'); } 
        finally { btn.innerText = originalText; btn.disabled = false; } 
    } 
};

export const contentModal = {
    targetUnitId: null, editId: null, currentData: null, 
    
    open: (unitId, item = null) => {
        contentModal.targetUnitId = unitId; 
        contentModal.editId = item ? item.id : null; 
        contentModal.currentData = item;

        const modal = document.getElementById('modal-add-content'); 
        modal.classList.remove('hidden');
        
        document.getElementById('input-content-title').value = item ? item.title : '';
        document.getElementById('input-content-desc').value = (item && item.data) ? item.data.description : '';
        document.getElementById('input-content-url').value = (item && item.type === 'url') ? item.file_url : '';
        document.getElementById('input-content-file').value = ''; 
        
        const typeSelect = document.getElementById('input-content-type');
        if (item) { typeSelect.value = item.type; typeSelect.disabled = true; } else { typeSelect.value = 'file'; typeSelect.disabled = false; }

        // --- RESTORED: Inject YouTube Checkbox ---
        let ytWrapper = document.getElementById('youtube-force-wrapper');
        if (!ytWrapper) {
            const div = document.createElement('div'); 
            div.id = 'youtube-force-wrapper'; 
            div.className = 'mt-3 pt-3 border-t border-gray-100 hidden';
            div.innerHTML = `<label class="flex items-center gap-2 cursor-pointer bg-red-50 p-2 rounded border border-red-100 hover:bg-red-100 transition"><input type="checkbox" id="input-open-external" class="rounded text-red-600"><span class="text-sm font-bold text-red-700 flex items-center gap-2"><i class="ph ph-youtube-logo"></i> Open in YouTube?</span></label><p class="text-xs text-gray-500 mt-1 ml-2">Select this if video is blocked inside LMS.</p>`;
            document.getElementById('source-wrapper').appendChild(div);
        }
        // Set state safely
        const ytCheck = document.getElementById('input-open-external');
        ytCheck.checked = (item && item.data && item.data.openExternal) || false;

        // --- RESTORED: Inject Quiz Question Count ---
        let qCountInput = document.getElementById('input-quiz-count');
        if (!qCountInput) {
            const wrapper = document.createElement('div'); 
            wrapper.className = "mb-4 border-b pb-4";
            wrapper.innerHTML = `<label class="block text-sm font-semibold text-gray-700 mb-1">Questions to Ask</label><div class="flex items-center gap-2"><input type="number" id="input-quiz-count" class="w-24 border border-gray-300 rounded p-2 text-sm" value="10" min="1"><span class="text-xs text-gray-500">(Random subset from pool)</span></div>`;
            document.getElementById('quiz-wrapper').prepend(wrapper);
            qCountInput = document.getElementById('input-quiz-count');
        }
        if (item && item.type === 'quiz' && item.data) {
            qCountInput.value = item.data.questionCount || 10;
        } else {
            qCountInput.value = 10;
        }

        // --- RESTORED: Permission Logic (Download) ---
        let dlWrapper = document.getElementById('download-permission-wrapper');
        if(!dlWrapper) {
            const div = document.createElement('div');
            div.id = 'download-permission-wrapper';
            div.className = 'mt-3 pt-3 border-t border-gray-100';
            div.innerHTML = `<label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="input-allow-download" class="rounded text-teal-600"><span class="text-sm font-semibold text-gray-700">Allow Download?</span></label><p class="text-xs text-gray-500 ml-6">If unchecked, files open in secure viewer.</p>`;
            document.getElementById('source-wrapper').appendChild(div);
        }
        document.getElementById('input-allow-download').checked = item ? item.allow_download : false;

        // Load Questions
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
        const ytWrapper = document.getElementById('youtube-force-wrapper');
        const dlWrapper = document.getElementById('download-permission-wrapper');

        descWrapper.classList.add('hidden'); 
        quizWrapper.classList.add('hidden'); 
        sourceWrapper.classList.remove('hidden'); 
        if(ytWrapper) ytWrapper.classList.add('hidden');
        if(dlWrapper) dlWrapper.classList.add('hidden');

        if (type === 'assignment') { 
            descWrapper.classList.remove('hidden'); 
            document.getElementById('lbl-source').innerText = "Brief (Optional)"; 
        } else if (type === 'quiz') { 
            quizWrapper.classList.remove('hidden'); 
            sourceWrapper.classList.add('hidden'); 
        } else if (type === 'simulator') { 
            sourceWrapper.classList.add('hidden'); 
        } else { 
            document.getElementById('lbl-source').innerText = "Source"; 
            // Show YouTube option
            if (['video', 'url'].includes(type) && ytWrapper) ytWrapper.classList.remove('hidden');
            // Show Download option
            if (['video', 'audio', 'file'].includes(type) && dlWrapper) dlWrapper.classList.remove('hidden');
        } 
        
        const source = document.querySelector('input[name="source"]:checked').value; 
        const urlInput = document.getElementById('input-content-url'); 
        const fileUI = document.getElementById('file-upload-ui'); 
        if(source === 'url') { urlInput.classList.remove('hidden'); fileUI.classList.add('hidden'); } 
        else { urlInput.classList.add('hidden'); fileUI.classList.remove('hidden'); } 
    },
    
    save: async () => { 
        const btn = document.getElementById('btn-save-content'); 
        btn.innerText = '⏳ Saving...'; 
        btn.disabled = true; 
        try { 
            const unitId = contentModal.targetUnitId; 
            const type = document.getElementById('input-content-type').value; 
            const title = document.getElementById('input-content-title').value; 
            const desc = document.getElementById('input-content-desc').value; 
            const source = document.querySelector('input[name="source"]:checked').value; 
            const allowDownload = document.getElementById('input-allow-download')?.checked || false;
            
            if(!title) throw new Error("Title required"); 
            
            let finalUrl = contentModal.currentData ? contentModal.currentData.file_url : null; 
            let metaData = contentModal.currentData ? (contentModal.currentData.data || {}) : {}; 
            
            // SAVE SETTINGS
            metaData.openExternal = document.getElementById('input-open-external')?.checked || false;

            if(type === 'quiz') { 
                metaData.questionCount = parseInt(document.getElementById('input-quiz-count').value) || 10;
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
            } else if (type === 'simulator') { 
                finalUrl = './simulator/index.html?auth=msletb_secure_launch'; 
            } else { 
                if (source === 'url') { 
                    const newUrl = document.getElementById('input-content-url').value; 
                    if (newUrl) finalUrl = newUrl; 
                } else { 
                    const file = document.getElementById('input-content-file').files[0]; 
                    if (file) { 
                        // --- CRITICAL FIX: Add extension to filename ---
                        const ext = file.name.split('.').pop().toLowerCase(); 
                        const path = `uploads/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`; 
                        // -----------------------------------------------

                        const { error } = await sb.storage.from('course_content').upload(path, file); 
                        if (error) throw error; 
                        const { data } = sb.storage.from('course_content').getPublicUrl(path); 
                        finalUrl = data.publicUrl; 
                    } 
                } 
            } 
            if(type === 'assignment') { metaData.description = desc; } 
            
            const payload = { title, file_url: finalUrl, data: metaData, allow_download: allowDownload }; 
            
            if (contentModal.editId) { await sb.from('content').update(payload).eq('id', contentModal.editId); ui.toast("Updated!", "success"); } 
            else { await sb.from('content').insert([{ unit_id: unitId, type, ...payload }]); ui.toast("Created!", "success"); } 
            contentModal.close(); 
            courseManager.openModule(state.activeModule.id); 
        } catch(e) { console.error(e); ui.toast(e.message, 'error'); } 
        finally { btn.innerText = 'Save'; btn.disabled = false; } 
    }
};