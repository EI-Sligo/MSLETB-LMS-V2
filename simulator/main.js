/* main.js - Standalone Cloud-Enabled Simulator */

// 1. INIT SUPABASE (Direct Connection)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentEditComp = null;
let cloudSaves = []; // Store fetched saves here

const App = {
    init: async () => {
        Renderer.init();
        Interaction.init(document.getElementById('simCanvas'));
        Interaction.cableSize = '2.5'; 
        document.getElementById('simCanvas').addEventListener('dblclick', handleGlobalDoubleClick);
        
        const params = new URLSearchParams(window.location.search);
        
        // CHECK: Is this an Instructor viewing a submission?
        const submissionId = params.get('viewSubmission');
        if (submissionId) {
            await App.loadSubmission(submissionId);
        } else {
            // Normal Load (Student/Instructor building mode)
            await App.fetchCloudSaves();
            App.renderLevels();
        }
    },

    // NEW FUNCTION: Load Student Work for Grading
    loadSubmission: async (submissionId) => {
        // Fetch the assignment entry
        const { data, error } = await sb.from('assignments').select('comments').eq('id', submissionId).single();
        
        if (error || !data || !data.comments) {
            alert("Error loading submission. Data may be missing.");
            return;
        }

        try {
            // Parse the snapshot (stored in comments)
            const circuitData = JSON.parse(data.comments);
            
            // Clear and Load
            App.clear(false);
            
            // Rehydrate components (reuse existing load logic)
            circuitData.comps.forEach(c => {
                 const def = ComponentRegistry[c.type];
                 if(def) Engine.components.push(c);
            });
            Engine.wires = circuitData.wires || [];
            
            // UI Indication
            const hint = document.getElementById('hint-text');
            if(hint) hint.innerText = "👁️ VIEWING STUDENT SUBMISSION (Read Only)";
            document.body.style.border = "5px solid #9333ea"; // Purple border to indicate grading mode

        } catch(e) {
            console.error(e);
            alert("Corrupt circuit data.");
        }
    
    },

    // --- CLOUD LOGIC ---
    
    // Get User ID from URL (Passed from LMS)
    getUserId: () => {
        const params = new URLSearchParams(window.location.search);
        return params.get('uid');
    },

    fetchCloudSaves: async () => {
        const uid = App.getUserId();
        if(!uid) return; // Not logged in or local mode

        const { data, error } = await sb
            .from('saved_circuits')
            .select('*')
            .eq('user_id', uid)
            .order('updated_at', { ascending: false });

        if(data) cloudSaves = data;
    },

    saveToCloud: async () => {
        const uid = App.getUserId();
        if(!uid) { alert("Error: User ID missing. Please launch from LMS."); return; }

        const name = prompt("Name your circuit save:");
        if(!name) return;

        const circuitData = { 
            comps: Engine.components, 
            wires: Engine.wires 
        };

        const { error } = await sb.from('saved_circuits').insert([{
            user_id: uid,
            circuit_name: name,
            circuit_data: circuitData
        }]);

        if(error) {
            alert("Save Failed: " + error.message);
        } else {
            alert("✅ Saved to Cloud!");
            await App.fetchCloudSaves(); // Refresh list
            App.renderLevels(); // Re-render sidebar
        }
    },
	submitToLMS: async () => {
        const uid = App.getUserId();
        const params = new URLSearchParams(window.location.search);
        const cid = params.get('cid'); // Content ID passed from LMS

        if(!uid || !cid) { 
            alert("⚠️ Connection Error: Please launch this simulator from the LMS Course Dashboard to submit work."); 
            return; 
        }

        if(!confirm("Submit your current circuit to the Gradebook?")) return;

        // Take a snapshot of the circuit
        const circuitSnapshot = JSON.stringify({ comps: Engine.components, wires: Engine.wires });

        // Save to Supabase Assignments table
        // We use 'grade: Pass' to mark completion
        const { error } = await sb.from('assignments').insert([{
            content_id: cid,
            student_id: uid,
            grade: 'Pass', 
            file_url: 'simulator_snapshot',
            comments: circuitSnapshot 
        }]);

        if(error) alert("Submission Failed: " + error.message);
        else alert("✅ Assignment Submitted Successfully!");
    },

    loadCloudSave: (saveId) => {
        if(!confirm("Load this save? Unsaved work will be lost.")) return;
        
        const save = cloudSaves.find(s => s.id === saveId);
        if(!save) return;

        const data = save.circuit_data;
        App.clear(false); // Clear board without asking again
        
        // Rehydrate components
        data.comps.forEach(c => {
             const def = ComponentRegistry[c.type];
             if(def) {
                 Engine.components.push(c);
             }
        });
        Engine.wires = data.wires || [];
        Engine.powerOn = false;
        document.getElementById('btn-power').innerHTML = "🔌 Power ON";
        document.getElementById('btn-power').classList.remove('active');
    },

    deleteCloudSave: async (saveId, event) => {
        event.stopPropagation();
        if(!confirm("Delete this saved circuit permanently?")) return;

        const { error } = await sb.from('saved_circuits').delete().eq('id', saveId);
        if(!error) {
            await App.fetchCloudSaves();
            App.renderLevels();
        }
    },

    // --- STANDARD APP LOGIC ---

    addComponent: (type) => {
        const cvs = document.getElementById('simCanvas');
        const cx = (cvs.width/2 - Renderer.camera.x) / Renderer.camera.zoom;
        const cy = (cvs.height/2 - Renderer.camera.y) / Renderer.camera.zoom;
        Engine.add(type, cx - 50, cy - 50);
        App.setToolMode('move');
    },

    setToolMode: (mode) => {
        Interaction.mode = mode;
        Interaction.selectedComp = null;
        Interaction.wireStart = null;
        ['interact', 'wire', 'move'].forEach(m => {
            const btn = document.getElementById(`btn-mode-${m}`);
            if(m === mode) btn.classList.add('active'); else btn.classList.remove('active');
        });
        const hint = document.getElementById('hint-text');
        if(mode === 'interact') hint.innerText = "👆 INTERACT: Toggle switches, use Meter, Edit Properties.";
        if(mode === 'wire') hint.innerText = "🔌 WIRE MODE: Drag between terminals to connect. Tap wire to delete.";
        if(mode === 'move') hint.innerText = "✋ MOVE MODE: Drag components to rearrange.";
    },

    toggleInputMode: () => {
        const btn = document.getElementById('btn-input-mode');
        if (Interaction.inputType === 'mouse') {
            Interaction.setInputType('touch');
            btn.innerHTML = "👆 Input: TOUCH";
            btn.classList.add('active'); 
        } else {
            Interaction.setInputType('mouse');
            btn.innerHTML = "🖱️ Input: MOUSE";
            btn.classList.remove('active');
        }
    },

    togglePower: () => {
        Engine.powerOn = !Engine.powerOn;
        const btn = document.getElementById('btn-power');
        btn.innerHTML = Engine.powerOn ? "⚡ Power OFF" : "🔌 Power ON";
        btn.classList.toggle('active');
        if(!Engine.powerOn) {
            Engine.components.forEach(c => c.state.on = c.state.on); 
        }
    },

    toggleWireOrder: () => {
        Renderer.wiresOnTop = !Renderer.wiresOnTop;
        const btn = document.getElementById('btn-wire-order');
        if(btn) {
            btn.innerText = Renderer.wiresOnTop ? "Wires: FRONT" : "Wires: BACK";
            btn.classList.toggle('active');
        }
    },

    toggleFlowMode: () => {
        Renderer.showFlow = !Renderer.showFlow;
        const btn = document.getElementById('btn-flow');
        if(btn) {
            btn.innerHTML = Renderer.showFlow ? "🌊 Flow: ON" : "🌊 Flow: OFF";
            btn.classList.toggle('active');
        }
    },

    setCable: (val) => Interaction.cableSize = val,

    clear: (ask = true) => {
        if(!ask || confirm("Clear all components?")) {
            Engine.components = [];
            Engine.wires = [];
            Engine.powerOn = false;
            const btn = document.getElementById('btn-power');
            btn.innerHTML = "🔌 Power ON";
            btn.classList.remove('active');
        }
    },
    
    switchTab: (tabName) => {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        document.getElementById(`tab-${tabName}`).classList.add('active');
        document.getElementById(`btn-tab-${tabName}`).classList.add('active');
    },

    // UPDATED: Render both Scenarios AND Cloud Saves
    renderLevels: () => {
        const container = document.getElementById('level-list-container');
        if(!container) return;
        container.innerHTML = '';
        
        // 1. CLOUD SAVES SECTION
        if(cloudSaves.length > 0) {
            const header = document.createElement('div');
            header.style = "font-size:11px; font-weight:800; color:#2563eb; text-transform:uppercase; margin:10px 0 5px 0;";
            header.innerText = "☁️ MY SAVED CIRCUITS";
            container.appendChild(header);

            cloudSaves.forEach(save => {
                const div = document.createElement('div');
                div.className = 'level-item';
                div.innerHTML = `
                    <div class="level-info">
                        <div class="level-title">${save.circuit_name}</div>
                        <div class="level-desc">${new Date(save.updated_at).toLocaleDateString()}</div>
                    </div>
                    <div class="level-actions">
                        <button class="icon-btn delete-btn" title="Delete Save">🗑️</button>
                    </div>
                `;
                div.onclick = () => App.loadCloudSave(save.id);
                div.querySelector('.delete-btn').onclick = (e) => App.deleteCloudSave(save.id, e);
                container.appendChild(div);
            });
        }

        // 2. SCENARIOS SECTION
        const subHeader = document.createElement('div');
        subHeader.style = "font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase; margin:20px 0 5px 0;";
        subHeader.innerText = "📚 PRESET SCENARIOS";
        container.appendChild(subHeader);

        if(window.LEVELS) {
            Object.keys(window.LEVELS).forEach(key => {
                const lvl = window.LEVELS[key];
                const div = document.createElement('div');
                div.className = 'level-item';
                div.innerHTML = `
                    <div class="level-info">
                        <div class="level-title">${lvl.title}</div>
                        <div class="level-desc">${lvl.desc}</div>
                    </div>
                `;
                div.onclick = () => App.loadLevel(key);
                container.appendChild(div);
            });
        }
    },

    loadLevel: (id) => {
        if(!confirm("Load this scenario? Unsaved work on current board will be lost.")) return;
        const lvl = window.LEVELS[id];
        App.clear(false); 
        const indexToIdMap = new Map(); 
        lvl.comps.forEach((c, index) => {
             const def = ComponentRegistry[c.type];
             if(def) {
                 const newId = c.id || ('c_' + Date.now() + Math.random().toString(16).slice(2) + index);
                 indexToIdMap.set(index, newId); 
                 const newComp = {
                     id: newId, type: c.type, x: c.x, y: c.y, w: def.size.w, h: def.size.h,
                     state: c.state ? JSON.parse(JSON.stringify(c.state)) : { on: false, energized: false, lit: false, fault: c.fault || 'none', label: c.label || def.label, inputs: {}, outputs: {} }
                 };
                 if(c.program) newComp.program = JSON.parse(JSON.stringify(c.program));
                 Engine.components.push(newComp);
             }
        });
        if(lvl.wires) {
            Engine.wires = lvl.wires.map(w => {
                const start = typeof w.startComp === 'number' ? indexToIdMap.get(w.startComp) : (w.startComp || indexToIdMap.get(0));
                const end = typeof w.endComp === 'number' ? indexToIdMap.get(w.endComp) : (w.endComp || indexToIdMap.get(1));
                return { ...w, startComp: start, endComp: end };
            });
        }
    },

    openPropertyModal: (comp) => {
        currentEditComp = comp;
        document.getElementById('prop-label').value = comp.state.label || '';
        document.getElementById('prop-fault').value = comp.state.fault || 'none';
        document.getElementById('prop-modal').style.display = 'flex';
    },

    saveProperty: () => {
        if(currentEditComp) {
            currentEditComp.state.label = document.getElementById('prop-label').value;
            currentEditComp.state.fault = document.getElementById('prop-fault').value;
            document.getElementById('prop-modal').style.display = 'none';
            currentEditComp = null;
        }
    }
};

let currentPLC = null;
let tempLadderState = null;
const SVG_NO = `<svg class="ladder-svg" viewBox="0 0 50 50"><line x1="0" y1="25" x2="15" y2="25"/><line x1="35" y1="25" x2="50" y2="25"/><line x1="15" y1="5" x2="15" y2="45"/><line x1="35" y1="5" x2="35" y2="45"/></svg>`;
const SVG_NC = `<svg class="ladder-svg" viewBox="0 0 50 50"><line x1="0" y1="25" x2="15" y2="25"/><line x1="35" y1="25" x2="50" y2="25"/><line x1="15" y1="5" x2="15" y2="45"/><line x1="35" y1="5" x2="35" y2="45"/><line class="nc-bar" x1="10" y1="45" x2="40" y2="5"/></svg>`;
const SVG_COIL = `<svg class="ladder-svg" viewBox="0 0 50 50"><line x1="0" y1="25" x2="10" y2="25"/><line x1="40" y1="25" x2="50" y2="25"/><path d="M 10 25 C 10 5, 40 5, 40 25 C 40 45, 10 45, 10 25" /></svg>`;
const createDefaultLadder = () => Array(5).fill(null).map(() => ({ contacts: [null, null, null], coil: null }));
function openPLCModal(comp) { currentPLC = comp; const existing = comp.program; if (existing && Array.isArray(existing) && existing.length > 0) { tempLadderState = JSON.parse(JSON.stringify(existing)); } else { tempLadderState = createDefaultLadder(); } document.getElementById('plc-modal').style.display = 'flex'; setTimeout(renderLadderEditor, 10); }
function closePLCModal() { document.getElementById('plc-modal').style.display = 'none'; currentPLC = null; }
window.openPLCModal = openPLCModal;
function renderLadderEditor() { const container = document.getElementById('ladder-container'); if(!container) return; container.innerHTML = ''; tempLadderState.forEach((rung, rIdx) => { const rungDiv = document.createElement('div'); rungDiv.className = 'ladder-rung'; rungDiv.innerHTML = '<div class="power-rail-left"></div>'; const slotsContainer = document.createElement('div'); slotsContainer.className = 'ladder-slots-container'; slotsContainer.innerHTML = '<div class="ladder-wire-line"></div>'; rung.contacts.forEach((contact, cIdx) => { const slot = document.createElement('div'); slot.className = `ladder-slot ${contact ? 'configured' : ''}`; if(contact) { const icon = contact.type === 'NO' ? SVG_NO : SVG_NC; slot.innerHTML = `${icon}<span>${contact.addr}</span>`; } else { slot.style.opacity = "0.5"; } slot.onclick = () => cycleContact(rIdx, cIdx); slotsContainer.appendChild(slot); }); const coil = rung.coil; const coilSlot = document.createElement('div'); coilSlot.className = `ladder-slot ${coil ? 'configured' : ''}`; if(coil) { coilSlot.innerHTML = `${SVG_COIL}<span>${coil.addr}</span>`; } else { coilSlot.innerHTML = `<span style="font-size:9px; color:#94a3b8;">(Coil)</span>`; } coilSlot.onclick = () => cycleCoil(rIdx); slotsContainer.appendChild(coilSlot); rungDiv.appendChild(slotsContainer); rungDiv.appendChild(document.createElement('div')).className = 'power-rail-right'; container.appendChild(rungDiv); }); }
function cycleContact(rIdx, cIdx) { const current = tempLadderState[rIdx].contacts[cIdx]; const inputs = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'I10', 'Q1', 'Q2', 'Q3', 'Q4']; if(!current) { tempLadderState[rIdx].contacts[cIdx] = { type: 'NO', addr: 'I1' }; } else if (current.type === 'NO') { current.type = 'NC'; } else if (current.type === 'NC') { const idx = inputs.indexOf(current.addr); if(idx < inputs.length - 1) { current.type = 'NO'; current.addr = inputs[idx + 1]; } else { tempLadderState[rIdx].contacts[cIdx] = null; } } renderLadderEditor(); }
function cycleCoil(rIdx) { const current = tempLadderState[rIdx].coil; const outputs = ['Q1', 'Q2', 'Q3', 'Q4']; if(!current) { tempLadderState[rIdx].coil = { addr: 'Q1' }; } else { const idx = outputs.indexOf(current.addr); if(idx < outputs.length - 1) { current.addr = outputs[idx + 1]; } else { tempLadderState[rIdx].coil = null; } } renderLadderEditor(); }
function savePLCLogic() { if(!currentPLC || !tempLadderState) return; currentPLC.program = JSON.parse(JSON.stringify(tempLadderState)); closePLCModal(); alert("Logic Uploaded to PLC!"); }
function handleGlobalDoubleClick(e) { const rect = document.getElementById('simCanvas').getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top; const comps = [...Engine.components].reverse(); const clickedComp = comps.find(c => x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h); if (clickedComp) { if(clickedComp.type === 'plc_mini') { openPLCModal(clickedComp); return; } if (Interaction.mode === 'interact' || Interaction.mode === 'move') { App.openPropertyModal(clickedComp); } } }
// Expose App to window so HTML buttons can see it
window.App = App;
window.onload = App.init;