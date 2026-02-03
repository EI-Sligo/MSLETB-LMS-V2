import { sb, state } from './config.js';
import { ui } from './ui.js';
import { courseManager } from './courseManager.js';

export const assignmentManager = {
    contentId: null,
    openSubmit: (id) => {
        assignmentManager.contentId = id;
        document.getElementById('modal-submit-assignment').classList.remove('hidden');
    },
    closeSubmit: () => {
        document.getElementById('modal-submit-assignment').classList.add('hidden');
        document.getElementById('input-submit-file').value = '';
        document.getElementById('input-submit-comment').value = '';
    },
    submit: async () => {
        const fileInput = document.getElementById('input-submit-file');
        const comment = document.getElementById('input-submit-comment').value;
        if(fileInput.files.length === 0 && !comment) return ui.toast("Please add a file or comment", "error");
        ui.toast("Uploading...", "info");
        try {
            let fileUrl = null;
            if(fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const ext = file.name.split('.').pop();
                const path = `assignments/${state.user.id}_${Date.now()}.${ext}`;
                await sb.storage.from('course_content').upload(path, file);
                const { data } = sb.storage.from('course_content').getPublicUrl(path);
                fileUrl = data.publicUrl;
            }
            await sb.from('assignments').insert([{
                student_id: state.user.id,
                content_id: assignmentManager.contentId,
                file_url: fileUrl,
                comments: comment,
                grade: 'Submitted'
            }]);
            ui.toast("Assignment Submitted!", "success");
            assignmentManager.closeSubmit();
            courseManager.openModule(state.activeModule.id);
        } catch(e) {
            ui.toast("Error submitting assignment", "error");
        }
    },
    openGrading: async (id) => {
        assignmentManager.contentId = id;
        document.getElementById('modal-grade-assignment').classList.remove('hidden');
        const list = document.getElementById('grading-list');
        list.innerHTML = '<p class="p-4">Loading submissions...</p>';
        const { data: subs } = await sb.from('assignments').select('*, profiles(email)').eq('content_id', id);
        if(!subs || subs.length === 0) {
            list.innerHTML = '<p class="text-gray-500 p-4">No submissions yet.</p>';
            return;
        }
        list.innerHTML = subs.map(sub => {
            let fileDisplay = '';
            if (sub.file_url && sub.file_url.includes('simulator_snapshot')) {
                const simUrl = `./simulator/index.html?auth=msletb_secure_launch&viewSubmission=${sub.id}`;
                fileDisplay = `<a href="${simUrl}" target="_blank" class="text-xs font-bold text-purple-600 bg-purple-100 px-3 py-1 rounded border border-purple-200 hover:bg-purple-200 flex items-center gap-1 w-fit transition"><i class="ph ph-circuitry"></i> View Student Circuit</a>`;
            } else if (sub.file_url) {
                fileDisplay = `<a href="${sub.file_url}" target="_blank" class="text-blue-600 hover:underline text-sm flex items-center gap-1"><i class="ph ph-download"></i> View File</a>`;
            }
            return `
            <div class="bg-white p-4 rounded shadow mb-2 border border-gray-200">
                <div class="flex justify-between font-bold mb-2">
                    <span>${sub.profiles?.email || 'Unknown User'}</span>
                    <span class="${sub.grade === 'Pass' ? 'text-green-600' : (sub.grade === 'Fail' ? 'text-red-600' : 'text-orange-600')}">${sub.grade || 'Pending'}</span>
                </div>
                ${fileDisplay}
                ${sub.comments ? `<p class="text-gray-600 text-sm mt-2 italic bg-gray-50 p-2 rounded">"${sub.comments}"</p>` : ''}
                <div class="mt-3 flex gap-2 border-t pt-2">
                    <button onclick="assignmentManager.grade('${sub.id}', 'Pass')" class="px-3 py-1 bg-green-100 text-green-700 rounded text-xs font-bold hover:bg-green-200">Pass</button>
                    <button onclick="assignmentManager.grade('${sub.id}', 'Fail')" class="px-3 py-1 bg-red-100 text-red-700 rounded text-xs font-bold hover:bg-red-200">Fail</button>
                    <button onclick="assignmentManager.grade('${sub.id}', 'Retry')" class="px-3 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-bold hover:bg-yellow-200">Retry</button>
                </div>
            </div>`;
        }).join('');
    },
    closeGrading: () => document.getElementById('modal-grade-assignment').classList.add('hidden'),
    grade: async (id, status) => {
        await sb.from('assignments').update({ grade: status }).eq('id', id);
        ui.toast("Graded: " + status, "success");
        assignmentManager.openGrading(assignmentManager.contentId);
    }
};

export const quizManager = {
    addQuestionUI: (data = null) => {
        const div = document.createElement('div');
        div.className = "question-card-ui border p-2 rounded bg-gray-50 mb-2 relative group";
        const unique = Date.now() + Math.random().toString(16).slice(2);
        div.innerHTML = `
            <div class="mb-2 space-y-1">
                <input placeholder="Question Text" class="w-full border p-1 rounded text-sm q-text" value="${data ? (data.text || data.question).replace(/"/g, '&quot;') : ''}" onpaste="quizManager.handleImagePaste(event, this)">
                <input placeholder="Image URL (Optional) - or Paste Screenshot (Ctrl+V)" class="w-full border p-1 rounded text-xs bg-white q-image text-gray-600" value="${data && data.image ? data.image : ''}" onpaste="quizManager.handleImagePaste(event, this)">
            </div>
            <div class="grid grid-cols-2 gap-2">
                ${[0,1,2,3].map(i => `
                    <div class="flex items-center">
                        <input type="radio" name="correct-${unique}" value="${i}" class="mr-1" ${data && parseInt(data.correct) === i ? 'checked' : (i===0 && !data ? 'checked' : '')}>
                        <input placeholder="Option ${i+1}" class="border p-1 w-full text-xs q-opt" value="${data && data.options[i] ? data.options[i].replace(/"/g, '&quot;') : ''}">
                    </div>`).join('')}
            </div>
            <button onclick="this.parentElement.remove()" class="text-xs text-red-500 mt-1">Remove Question</button>`;
        document.getElementById('quiz-questions-list').appendChild(div);
    },
    handleImagePaste: async (e, inputEl) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        let file = null;
        for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf("image") === 0) { file = items[i].getAsFile(); break; } }
        if (!file) return;
        e.preventDefault();
        const originalPlaceholder = inputEl.placeholder;
        inputEl.placeholder = "⏳ Uploading pasted image...";
        try {
            const ext = 'png';
            const path = `quiz_images/${Date.now()}_paste.${ext}`;
            await sb.storage.from('course_content').upload(path, file);
            const { data: publicUrl } = sb.storage.from('course_content').getPublicUrl(path);
            const row = inputEl.closest('.question-card-ui');
            const imgInput = row.querySelector('.q-image');
            if (imgInput) { imgInput.value = publicUrl.publicUrl; ui.toast("Image pasted & linked!", "success"); }
        } catch (err) { ui.toast("Failed to upload image", "error"); }
        finally { inputEl.placeholder = originalPlaceholder; }
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
        for (let i = allQuestions.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]]; }
        const limit = data.data.questionCount || 10;
        const selectedQuestions = allQuestions.slice(0, limit);
        container.dataset.questions = JSON.stringify(selectedQuestions);
        selectedQuestions.forEach((q, idx) => {
            const qEl = document.createElement('div');
            qEl.className = "mb-4 border-b pb-4";
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
            const userAns = userAnswers[idx]; const correctAns = parseInt(q.correct); const isCorrect = userAns === correctAns;
            const boxClass = isCorrect ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200";
            const imgHtml = q.image ? `<img src="${q.image}" class="max-w-full h-auto max-h-48 rounded mb-2 border border-gray-200 block">` : '';
            html += `<div class="p-4 rounded-lg border ${boxClass}"><p class="font-bold text-gray-800 mb-2">Q${idx+1}: ${q.text}</p>${imgHtml}<div class="space-y-1 ml-2 mt-3">`;
            q.options.forEach((opt, i) => {
                let style = "text-gray-500";
                if (i === correctAns) style = "font-bold text-green-700 bg-green-100 p-1 rounded";
                if (i === userAns && !isCorrect) style = "font-bold text-red-600 bg-red-100 p-1 rounded";
                html += `<div class="flex items-center gap-2 text-sm ${style}">${opt}</div>`;
            });
            html += `</div></div>`;
        });
        html += `</div>`; container.innerHTML = html;
        const footerBtn = document.querySelector('#modal-take-quiz .border-t button');
        if(footerBtn) { footerBtn.innerText = "Close Results"; footerBtn.onclick = () => quizManager.closeTakeQuiz(); }
    }
};

export const entityModal = {
    type: null, id: null, parentId: null,
    open: async (type, id = null, title = '', desc = '', image = '', parentId = null) => {
        entityModal.type = type; entityModal.id = id; entityModal.parentId = parentId;
        document.getElementById('modal-entity').classList.remove('hidden');
        document.getElementById('entity-modal-title').innerText = (id ? 'Edit ' : 'New ') + type.charAt(0).toUpperCase() + type.slice(1);
        document.getElementById('entity-title').value = title;
        document.getElementById('entity-desc').value = desc;
        document.getElementById('entity-image-file').value = '';
        document.getElementById('entity-image-url').value = (image && image.startsWith('http')) ? image : '';
        document.getElementById('entity-desc-wrapper').classList.toggle('hidden', type !== 'course');
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
            let imageUrl = null;
            if(!document.getElementById('entity-image-url').classList.contains('hidden')) { imageUrl = document.getElementById('entity-image-url').value; }
            else {
                const fileInput = document.getElementById('entity-image-file');
                if (fileInput.files.length > 0) {
                    const file = fileInput.files[0];
                    const path = `covers/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9]/g,'_')}`;
                    await sb.storage.from('course_content').upload(path, file);
                    const { data } = sb.storage.from('course_content').getPublicUrl(path);
                    imageUrl = data.publicUrl;
                }
            }
            if(!title) throw new Error("Title required");
            const data = { title };
            if(entityModal.type === 'course') { data.description = desc; if(imageUrl) data.image_url = imageUrl; }
            if (entityModal.id) await sb.from(entityModal.type + 's').update(data).eq('id', entityModal.id);
            else {
                if (entityModal.type === 'section') data.course_id = state.activeCourse.id;
                else if (entityModal.type === 'module') data.section_id = entityModal.parentId;
                await sb.from(entityModal.type + 's').insert([data]);
            }
            ui.toast("Saved!", "success"); entityModal.close();
            if (entityModal.type === 'course') { const { dashboard } = await import('./dashboard.js'); dashboard.loadCourses(); }
            else courseManager.loadSyllabus();
        } catch(e) { ui.toast(e.message, 'error'); }
        finally { btn.innerText = originalText; btn.disabled = false; }
    }
};

export const contentModal = {
    targetUnitId: null, editId: null, currentData: null,
    open: (unitId, item = null) => {
        contentModal.targetUnitId = unitId; contentModal.editId = item ? item.id : null; contentModal.currentData = item;
        const modal = document.getElementById('modal-add-content'); modal.classList.remove('hidden');
        document.getElementById('input-content-title').value = item ? item.title : '';
        document.getElementById('input-content-desc').value = (item && item.data) ? item.data.description : '';
        document.getElementById('input-content-url').value = (item && item.type === 'url') ? item.file_url : '';
        document.getElementById('input-content-file').value = '';
        const typeSelect = document.getElementById('input-content-type');
        typeSelect.value = item ? item.type : 'file';
        typeSelect.disabled = !!item;

        // --- INJECT RESTORED UI ELEMENTS (YOUTUBE & QUIZ COUNT) ---
        let ytWrapper = document.getElementById('youtube-force-wrapper');
        if (!ytWrapper) {
            const div = document.createElement('div'); div.id = 'youtube-force-wrapper'; div.className = 'mt-3 pt-3 border-t border-gray-100 hidden';
            div.innerHTML = `<label class="flex items-center gap-2 cursor-pointer bg-red-50 p-2 rounded border border-red-100 hover:bg-red-100 transition"><input type="checkbox" id="input-open-external" class="rounded text-red-600"><span class="text-sm font-bold text-red-700 flex items-center gap-2"><i class="ph ph-youtube-logo"></i> Open in YouTube?</span></label>`;
            document.getElementById('source-wrapper').appendChild(div);
            ytWrapper = div;
        }
        document.getElementById('input-open-external').checked = (item && item.data && item.data.openExternal);

        let qCountInput = document.getElementById('input-quiz-count');
        if (!qCountInput) {
            const wrapper = document.createElement('div'); wrapper.id = 'quiz-count-wrapper'; wrapper.className = "mb-4 border-b pb-4";
            wrapper.innerHTML = `<label class="block text-sm font-semibold text-gray-700 mb-1">Questions to Ask</label><input type="number" id="input-quiz-count" class="w-24 border border-gray-300 rounded p-2 text-sm" value="10" min="1">`;
            document.getElementById('quiz-wrapper').prepend(wrapper);
            qCountInput = document.getElementById('input-quiz-count');
        }
        qCountInput.value = (item && item.data) ? (item.data.questionCount || 10) : 10;

        let dlWrapper = document.getElementById('download-permission-wrapper');
        if(!dlWrapper) {
            const div = document.createElement('div'); div.id = 'download-permission-wrapper'; div.className = 'mt-3 pt-3 border-t border-gray-100';
            div.innerHTML = `<label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="input-allow-download" class="rounded text-teal-600"><span class="text-sm font-semibold text-gray-700">Allow Download?</span></label>`;
            document.getElementById('source-wrapper').appendChild(div);
            dlWrapper = div;
        }
        document.getElementById('input-allow-download').checked = item ? item.allow_download : false;

        document.getElementById('quiz-questions-list').innerHTML = '';
        if (item && item.type === 'quiz' && item.data && item.data.questions) { item.data.questions.forEach(q => quizManager.addQuestionUI(q)); }
        contentModal.toggleFields();
    },
    close: () => document.getElementById('modal-add-content').classList.add('hidden'),
    toggleFields: () => {
        const type = document.getElementById('input-content-type').value;
        const ytWrapper = document.getElementById('youtube-force-wrapper');
        const quizWrapper = document.getElementById('quiz-wrapper');
        const sourceWrapper = document.getElementById('source-wrapper');
        const dlWrapper = document.getElementById('download-permission-wrapper');

        document.getElementById('desc-wrapper').classList.toggle('hidden', type !== 'assignment');
        quizWrapper.classList.toggle('hidden', type !== 'quiz');
        sourceWrapper.classList.toggle('hidden', ['quiz', 'simulator'].includes(type));
        if(ytWrapper) ytWrapper.classList.toggle('hidden', !['video', 'url'].includes(type));
        if(dlWrapper) dlWrapper.classList.toggle('hidden', !['file', 'video', 'audio'].includes(type));

        const source = document.querySelector('input[name="source"]:checked').value;
        document.getElementById('input-content-url').classList.toggle('hidden', source !== 'url');
        document.getElementById('file-upload-ui').classList.toggle('hidden', source !== 'upload');
    },
    save: async () => {
        const btn = document.getElementById('btn-save-content'); btn.innerText = '⏳ Saving...'; btn.disabled = true;
        try {
            const unitId = contentModal.targetUnitId;
            const type = document.getElementById('input-content-type').value;
            const title = document.getElementById('input-content-title').value;
            const source = document.querySelector('input[name="source"]:checked').value;
            if(!title) throw new Error("Title required");
            let finalUrl = contentModal.currentData ? contentModal.currentData.file_url : null;
            let metaData = contentModal.currentData ? (contentModal.currentData.data || {}) : {};
            metaData.openExternal = document.getElementById('input-open-external')?.checked || false;
            if (type === 'quiz') {
                metaData.questionCount = parseInt(document.getElementById('input-quiz-count').value) || 10;
                const qEls = document.querySelectorAll('#quiz-questions-list > .question-card-ui');
                metaData.questions = Array.from(qEls).map(div => ({
                    text: div.querySelector('.q-text').value, image: div.querySelector('.q-image').value.trim(),
                    options: Array.from(div.querySelectorAll('.q-opt')).map(i => i.value),
                    correct: div.querySelector('input[type="radio"]:checked')?.value || 0
                }));
            } else if (type === 'simulator') { finalUrl = './simulator/index.html?auth=msletb_secure_launch'; }
            else {
                if (source === 'url') { finalUrl = document.getElementById('input-content-url').value; }
                else {
                    const file = document.getElementById('input-content-file').files[0];
                    if (file) {
                        const ext = file.name.split('.').pop().toLowerCase();
                        const path = `uploads/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`;
                        await sb.storage.from('course_content').upload(path, file);
                        const { data } = sb.storage.from('course_content').getPublicUrl(path);
                        finalUrl = data.publicUrl;
                    }
                }
            }
            if(type === 'assignment') metaData.description = document.getElementById('input-content-desc').value;
            const payload = { title, file_url: finalUrl, data: metaData, allow_download: document.getElementById('input-allow-download')?.checked || false };
            if (contentModal.editId) await sb.from('content').update(payload).eq('id', contentModal.editId);
            else await sb.from('content').insert([{ unit_id: unitId, type, ...payload }]);
            contentModal.close(); courseManager.openModule(state.activeModule.id);
        } catch(e) { ui.toast(e.message, 'error'); }
        finally { btn.innerText = 'Save'; btn.disabled = false; }
    }
};