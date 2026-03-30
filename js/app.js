// ============================================
// Main Application Controller
// Firebase 연동 + localStorage 동기화
// ============================================

const App = {
    currentMonth: null,
    currentDetailTeamId: null,
    rosterMonth: null,   // month currently shown in the team detail roster
    isEditingRoster: false, // track edit mode
    useFirebase: false,
    db: null,

    async init() {
        // Detect current real-world month
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        
        if (SEASON_MONTHS.includes(monthKey)) {
            this.currentMonth = monthKey;
            DataStore.setCurrentMonth(monthKey);
        } else {
            this.currentMonth = DataStore.getCurrentMonth();
        }

        this.bindEvents();
        this.refreshDashboard();

        // Try Firebase connection
        await this.initFirebase();
    },

    async initFirebase() {
        if (!FIREBASE_CONFIG.apiKey) {
            console.log('[App] No Firebase config, using localStorage only');
            await this.updateLastUpdated();
            return;
        }

        try {
            firebase.initializeApp(FIREBASE_CONFIG);
            this.db = firebase.firestore();
            this.useFirebase = true;
            console.log('[App] Firebase connected!');
            this.showToast('🔗 서버 연결 완료');

            // Check if Firebase has data
            const teamsSnap = await this.db.collection('teams').get();
            if (teamsSnap.empty) {
                // First time: upload localStorage data to Firebase
                console.log('[App] Firebase is empty, uploading localStorage data...');
                await this.uploadToFirebase();
            } else {
                // Firebase has data: download to localStorage
                console.log('[App] Loading data from Firebase...');
                await this.downloadFromFirebase();
            }

            this.refreshDashboard();

            // Listen for real-time updates
            this.listenFirebase();
        } catch (e) {
            console.error('[App] Firebase init failed:', e);
            this.showToast('⚠️ 서버 연결 실패, 로컬 모드');
        } finally {
            // Show last updated time inside finally to ensure it runs even on error
            await this.updateLastUpdated();
        }
    },

    async uploadToFirebase() {
        const data = DataStore.load();
        const batch = this.db.batch();
        data.teams.forEach((team, i) => {
            const ref = this.db.collection('teams').doc(team.id);
            batch.set(ref, {
                name: team.name,
                roster: team.roster || {},
                order: i
            });
        });
        for (const [month, scores] of Object.entries(data.scores || {})) {
            const ref = this.db.collection('scores').doc(month);
            batch.set(ref, { players: scores });
        }
        await batch.commit();
        console.log('[App] Data uploaded to Firebase');
    },

    async downloadFromFirebase() {
        const data = DataStore.load();
        const teamsSnap = await this.db.collection('teams').orderBy('order').get();
        data.teams = teamsSnap.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name,
            roster: doc.data().roster || {}
        }));
        const scoresSnap = await this.db.collection('scores').get();
        data.scores = {};
        scoresSnap.docs.forEach(doc => {
            data.scores[doc.id] = doc.data().players || {};
        });
        DataStore.save(data);
        console.log('[App] Data downloaded from Firebase');
    },

    listenFirebase() {
        if (!this.useFirebase) return;

        // Listen for team changes
        this.db.collection('teams').onSnapshot((snapshot) => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'modified' || change.type === 'added') {
                    const data = DataStore.load();
                    const teamData = { id: change.doc.id, ...change.doc.data() };
                    const idx = data.teams.findIndex(t => t.id === teamData.id);
                    if (idx >= 0) {
                        data.teams[idx] = teamData;
                    } else {
                        data.teams.push(teamData);
                    }
                    DataStore.save(data);
                } else if (change.type === 'removed') {
                    const data = DataStore.load();
                    data.teams = data.teams.filter(t => t.id !== change.doc.id);
                    DataStore.save(data);
                }
            });
            // Refresh UI
            this.refreshDashboard();
            if (this.currentView === 'teams') this.refreshTeamsGrid();
            if (this.currentDetailTeamId) this.refreshTeamDetail();
        });

        // Listen for score changes
        this.db.collection('scores').onSnapshot((snapshot) => {
            const data = DataStore.load();
            snapshot.docChanges().forEach(change => {
                if (change.type === 'modified' || change.type === 'added') {
                    data.scores[change.doc.id] = change.doc.data().players || {};
                }
            });
            DataStore.save(data);
            this.refreshDashboard();
        });
    },

    // Sync helper: write change to Firebase
    async syncToFirebase(action, ...args) {
        if (!this.useFirebase) return;

        try {
            switch (action) {
                case 'addTeam': {
                    const [team] = args;
                    await this.db.collection('teams').doc(team.id).set({
                        name: team.name, roster: team.roster || {}, order: DataStore.getTeams().length - 1
                    });
                    break;
                }
                case 'updateTeam': {
                    const [teamId, updates] = args;
                    await this.db.collection('teams').doc(teamId).update(updates);
                    break;
                }
                case 'deleteTeam': {
                    const [teamId] = args;
                    await this.db.collection('teams').doc(teamId).delete();
                    break;
                }
                case 'updateRoster': {
                    const [teamId] = args;
                    const team = DataStore.getTeam(teamId);
                    if (team) {
                        await this.db.collection('teams').doc(teamId).update({
                            roster: team.roster || {}
                        });
                    }
                    break;
                }
            }
        } catch (e) {
            console.error('[App] Firebase sync error:', e);
        }
    },

    // ==========================================
    // Event Bindings
    // ==========================================
    bindEvents() {
        document.getElementById('logo-home').addEventListener('click', () => {
            if (this.currentDetailTeamId) this.closeTeamDetail();
        });


        // Team detail modal
        document.getElementById('modal-close').addEventListener('click', () => this.closeTeamDetail());
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target === document.getElementById('modal-overlay')) this.closeTeamDetail();
        });

        // Modal tabs (removed)
        // Add team modal (removed)
        // Team editing (removed)

        // Roster month navigation
        document.getElementById('roster-month-prev').addEventListener('click', () => this.changeRosterMonth(-1));
        document.getElementById('roster-month-next').addEventListener('click', () => this.changeRosterMonth(1));

        // Roster Edit Mode Toggle
        document.getElementById('btn-toggle-roster-edit').addEventListener('click', () => this.toggleRosterEditMode());

        // Copy previous month roster
        document.getElementById('btn-copy-prev-month').addEventListener('click', () => this.copyPrevMonthRoster());

        // Refresh button
        document.getElementById('btn-refresh').addEventListener('click', () => this.refreshScores());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeTeamDetail();
            }
        });
    },

    // ==========================================
    // Score Refresh
    // ==========================================
    async refreshScores() {
        const btn = document.getElementById('btn-refresh');
        btn.classList.add('refreshing');

        // Show progress overlay
        const overlay = document.getElementById('progress-overlay');
        const statusEl = document.getElementById('progress-status');
        const barFill = document.getElementById('progress-bar-fill');
        const percentEl = document.getElementById('progress-percent');

        overlay.classList.add('active');
        barFill.style.width = '0%';
        percentEl.textContent = '0%';
        
        // Find months to update (from March to current month)
        const currentIdx = SEASON_MONTHS.indexOf(this.currentMonth);
        const monthsToFetch = currentIdx >= 0 ? SEASON_MONTHS.slice(0, currentIdx + 1) : [this.currentMonth];
        
        try {
            for (let i = 0; i < monthsToFetch.length; i++) {
                const targetMonth = monthsToFetch[i];
                const monthParts = targetMonth.split('-');
                const monthNum = parseInt(monthParts[1]);
                
                statusEl.textContent = `${monthNum}월 점수 업데이트 중...`;

                // Set up progress callback for this month's scraping
                Scraper.onProgress = (percent, message) => {
                    const stepBase = (i / monthsToFetch.length) * 100;
                    const stepProgress = (percent / monthsToFetch.length);
                    const totalPercent = Math.round(stepBase + stepProgress);
                    
                    barFill.style.width = totalPercent + '%';
                    percentEl.textContent = totalPercent + '%';
                    statusEl.textContent = `[${monthNum}월] ${message}`;
                };

                // Scrape from welcometopranking
                const scores = await Scraper.scrapeAll(parseInt(monthParts[0]), monthNum);
                
                if (Object.keys(scores).length > 0) {
                    // Upload to Firebase
                    if (this.useFirebase) {
                        await Scraper.uploadToFirebase(this.db, scores, targetMonth);
                    }
                    // Update local data
                    const data = DataStore.load();
                    data.scores[targetMonth] = scores;
                    DataStore.save(data);
                }
            }

            // Refresh UI
            this.refreshDashboard();
            if (this.currentDetailTeamId) this.refreshTeamDetail();
            await this.updateLastUpdated();

            statusEl.textContent = `전체 기간 업데이트 완료!`;
            barFill.style.width = '100%';
            percentEl.textContent = '100%';

            // Keep overlay for a moment to show completion
            await new Promise(r => setTimeout(r, 1200));
            this.showToast(`전체 점수 업데이트 완료!`);

        } catch (e) {
            console.error('[App] Refresh failed:', e);
            statusEl.textContent = '오류: ' + e.message;
            await new Promise(r => setTimeout(r, 2000));
            this.showToast('업데이트 실패: ' + e.message);
        } finally {
            overlay.classList.remove('active');
            btn.classList.remove('refreshing');
            barFill.style.width = '0%';
        }
    },

    async updateLastUpdated() {
        const el = document.getElementById('last-updated');
        try {
            if (this.useFirebase) {
                const monthKey = this.currentMonth;
                const doc = await this.db.collection('scores').doc(monthKey).get();
                if (doc.exists && doc.data().updated_at) {
                    const dt = new Date(doc.data().updated_at);
                    const formatted = dt.toLocaleString('ko-KR', {
                        year: 'numeric', month: 'long', day: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    });
                    el.textContent = `마지막 업데이트: ${formatted}`;
                } else {
                    el.textContent = '마지막 업데이트: 데이터 없음';
                }
            } else {
                el.textContent = '마지막 업데이트: 로컬 모드';
            }
        } catch (e) {
            el.textContent = '마지막 업데이트: 확인 불가';
        }
    },

    // ==========================================
    // Dashboard
    // ==========================================
    refreshDashboard() {
        const teams = DataStore.getTeams();
        UI.renderPodium(teams, this.currentMonth);
        UI.renderRankingTable(teams, this.currentMonth);
    },


    // ==========================================
    // Team Detail Modal
    // ==========================================
    openTeamDetail(teamId) {
        this.currentDetailTeamId = teamId;
        this.rosterMonth = this.currentMonth; // start on current score month
        this.isEditingRoster = false; // default to view mode
        const team = DataStore.getTeam(teamId);
        if (!team) return;
        document.getElementById('modal-team-name').textContent = team.name;
        document.getElementById('modal-team-score').textContent =
            DataStore.getTeamScoreStats(teamId, this.currentMonth).current.toFixed(2);
        this.renderRosterMonth();
        document.getElementById('modal-overlay').classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    closeTeamDetail() {
        document.getElementById('modal-overlay').classList.remove('active');
        document.body.style.overflow = '';
        this.currentDetailTeamId = null;
        const manageList = document.getElementById('manage-player-list');
        if (manageList) {
            const prevDivider = manageList.previousElementSibling;
            if (prevDivider && prevDivider.classList.contains('divider')) {
                prevDivider.remove();
            }
            manageList.remove();
        }
    },

    refreshTeamDetail() {
        if (!this.currentDetailTeamId) return;
        const team = DataStore.getTeam(this.currentDetailTeamId);
        if (!team) return;
        document.getElementById('modal-team-name').textContent = team.name;
        document.getElementById('modal-team-score').textContent =
            DataStore.getTeamScoreStats(this.currentDetailTeamId, this.currentMonth).current.toFixed(2);
        this.renderRosterMonth();
    },

    // ==========================================
    // Roster Month Navigation
    // ==========================================
    changeRosterMonth(delta) {
        const idx = SEASON_MONTHS.indexOf(this.rosterMonth);
        const newIdx = Math.max(0, Math.min(SEASON_MONTHS.length - 1, idx + delta));
        this.rosterMonth = SEASON_MONTHS[newIdx];
        this.renderRosterMonth();
    },

    toggleRosterEditMode() {
        this.isEditingRoster = !this.isEditingRoster;
        this.renderRosterMonth();
        if (!this.isEditingRoster) {
            this.showToast('명단이 저장되었습니다');
        }
    },

    renderRosterMonth() {
        if (!this.currentDetailTeamId) return;
        const monthIdx = SEASON_MONTHS.indexOf(this.rosterMonth);
        const monthNum = parseInt(this.rosterMonth.split('-')[1]);

        document.getElementById('roster-month-label').textContent = `${monthNum}월`;
        document.getElementById('roster-month-prev').disabled = (monthIdx === 0);
        document.getElementById('roster-month-next').disabled = (monthIdx === SEASON_MONTHS.length - 1);
        
        const copyRow = document.getElementById('roster-copy-row');
        if (copyRow) {
            copyRow.style.display = (monthIdx === 0 || !this.isEditingRoster) ? 'none' : 'flex';
        }

        const btnEdit = document.getElementById('btn-toggle-roster-edit');
        if (btnEdit) {
            if (this.isEditingRoster) {
                btnEdit.innerHTML = '💾 저장';
                btnEdit.classList.add('btn-primary');
            } else {
                btnEdit.innerHTML = '⚙️ 명단 수정';
                btnEdit.classList.remove('btn-primary');
            }
        }

        const roster = DataStore.getMonthRoster(this.currentDetailTeamId, this.rosterMonth) || {};
        const scores = DataStore.getScores(this.rosterMonth);
        const listEl = document.getElementById('roster-player-list');

        let html = '';
        const readonlyAttr = this.isEditingRoster ? '' : 'readonly';

        SLOT_GROUPS.forEach(group => {
            html += `<div class="roster-group">
                <h4 class="roster-group-title">${group.label}</h4>
                <div class="roster-slot-list">`;
            
            group.slots.forEach(slot => {
                const playerName = roster[slot.key] || '';
                const score = playerName ? DataStore.getPlayerScore(this.rosterMonth, playerName, slot.key) : 0;
                const scoreClass = score > 0 ? 'score-positive' : score < 0 ? 'score-negative' : 'score-zero';
                
                // Show input if editing OR if read-only but player exists
                // If not editing and player is empty, maybe just show '-' but an empty input is fine too for alignment
                html += `
                    <div class="slot-row">
                        <span class="slot-label">${slot.label}</span>
                        <div class="slot-content">
                            <input type="text" class="input slot-input" 
                                placeholder="${this.isEditingRoster ? '선수 이름' : '비어 있음'}" 
                                value="${playerName}"
                                data-slot="${slot.key}"
                                ${readonlyAttr}
                                onblur="App.handleSlotInput(this)"
                                onkeydown="if(event.key==='Enter') this.blur();">
                        </div>
                        ${playerName ? `<span class="slot-score ${scoreClass}">${score.toFixed(2)}</span>` : '<span class="slot-score score-zero">-</span>'}
                    </div>`;
            });
            
            html += `</div></div>`;
        });
        
        listEl.innerHTML = html;
    },

    handleSlotInput(inputEl) {
        if (!this.currentDetailTeamId) return;
        const slotKey = inputEl.dataset.slot;
        const newName = inputEl.value.trim();
        const roster = DataStore.getMonthRoster(this.currentDetailTeamId, this.rosterMonth) || {};
        const oldName = roster[slotKey] || '';

        if (newName === oldName) return; // No change

        DataStore.setSlot(this.currentDetailTeamId, this.rosterMonth, slotKey, newName);
        this.syncToFirebase('updateRoster', this.currentDetailTeamId);
        this.renderRosterMonth();
        this.refreshDashboard(); // Update scores behind modal
        
        if (newName) this.showToast(`${newName} 선수가 등록되었습니다`);
        else this.showToast(`등록 해제되었습니다`);
    },

    copyPrevMonthRoster() {
        if (!this.currentDetailTeamId) return;
        const idx = SEASON_MONTHS.indexOf(this.rosterMonth);
        if (idx <= 0) return;
        const prevMonth = SEASON_MONTHS[idx - 1];
        const prevRoster = DataStore.getMonthRoster(this.currentDetailTeamId, prevMonth) || {};
        const prevCount = Object.keys(prevRoster).filter(k => prevRoster[k]).length;
        
        if (prevCount === 0) {
            this.showToast('이전 달 명단이 비어 있습니다');
            return;
        }
        const monthNum = parseInt(this.rosterMonth.split('-')[1]);
        if (confirm(`${parseInt(prevMonth.split('-')[1])}월 명단(${prevCount}명)을 ${monthNum}월로 복사할까요?\n진행 시 이번 달 등록상태는 덮어씌워집니다.`)) {
            DataStore.setMonthRoster(this.currentDetailTeamId, this.rosterMonth, { ...prevRoster });
            this.syncToFirebase('updateRoster', this.currentDetailTeamId);
            this.renderRosterMonth();
            this.refreshDashboard();
            this.showToast(`${monthNum}월 명단에 ${prevCount}명이 복사되었습니다`);
        }
    },


    // ==========================================
    // Utility
    // ==========================================
    showToast(message) {
        UI.showToast(message);
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
