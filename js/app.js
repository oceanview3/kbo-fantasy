// ============================================
// Main Application Controller
// Firebase 연동 + localStorage 동기화
// ============================================

const App = {
    currentMonth: null,
    currentView: 'dashboard',
    currentDetailTeamId: null,
    useFirebase: false,
    db: null,

    async init() {
        this.currentMonth = DataStore.getCurrentMonth();
        this.bindEvents();
        this.updateMonthDisplay();
        this.refreshDashboard();

        // Try Firebase connection
        await this.initFirebase();
    },

    async initFirebase() {
        if (!FIREBASE_CONFIG.apiKey) {
            console.log('[App] No Firebase config, using localStorage only');
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
            if (this.currentView === 'teams') this.refreshTeamsGrid();

            // Listen for real-time updates
            this.listenFirebase();
        } catch (e) {
            console.error('[App] Firebase init failed:', e);
            this.showToast('⚠️ 서버 연결 실패, 로컬 모드');
        }
    },

    async uploadToFirebase() {
        const data = DataStore.load();

        // Upload teams
        const batch = this.db.batch();
        data.teams.forEach((team, i) => {
            const ref = this.db.collection('teams').doc(team.id);
            batch.set(ref, {
                name: team.name,
                owner: team.owner,
                players: team.players || [],
                order: i
            });
        });

        // Upload scores
        for (const [month, scores] of Object.entries(data.scores || {})) {
            const ref = this.db.collection('scores').doc(month);
            batch.set(ref, { players: scores });
        }

        await batch.commit();
        console.log('[App] Data uploaded to Firebase');
    },

    async downloadFromFirebase() {
        const data = DataStore.load();

        // Download teams
        const teamsSnap = await this.db.collection('teams').orderBy('order').get();
        data.teams = teamsSnap.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name,
            owner: doc.data().owner,
            players: doc.data().players || []
        }));

        // Download scores
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
                        name: team.name, owner: team.owner,
                        players: team.players || [], order: DataStore.getTeams().length - 1
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
                case 'updatePlayers': {
                    const [teamId] = args;
                    const team = DataStore.getTeam(teamId);
                    if (team) {
                        await this.db.collection('teams').doc(teamId).update({
                            players: team.players
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
        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchView(btn.dataset.view));
        });

        document.getElementById('logo-home').addEventListener('click', () => {
            this.switchView('dashboard');
        });

        // Month navigation
        document.getElementById('month-prev').addEventListener('click', () => this.changeMonth(-1));
        document.getElementById('month-next').addEventListener('click', () => this.changeMonth(1));

        // Team detail modal
        document.getElementById('modal-close').addEventListener('click', () => this.closeTeamDetail());
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target === document.getElementById('modal-overlay')) this.closeTeamDetail();
        });

        // Modal tabs
        document.querySelectorAll('.modal-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchModalTab(tab.dataset.tab));
        });

        // Add team modal
        document.getElementById('btn-add-team').addEventListener('click', () => this.openAddTeamModal());
        document.getElementById('add-team-close').addEventListener('click', () => this.closeAddTeamModal());
        document.getElementById('add-team-overlay').addEventListener('click', (e) => {
            if (e.target === document.getElementById('add-team-overlay')) this.closeAddTeamModal();
        });
        document.getElementById('btn-create-team').addEventListener('click', () => this.createTeam());

        // Team editing
        document.getElementById('btn-save-team-info').addEventListener('click', () => this.saveTeamInfo());
        document.getElementById('btn-add-player').addEventListener('click', () => this.addPlayer());
        document.getElementById('btn-delete-team').addEventListener('click', () => this.deleteTeam());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeTeamDetail();
                this.closeAddTeamModal();
            }
        });
    },

    // ==========================================
    // Views
    // ==========================================
    switchView(viewName) {
        this.currentView = viewName;
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === viewName);
        });
        document.querySelectorAll('.view').forEach(view => {
            view.classList.toggle('active', view.id === `view-${viewName}`);
        });
        if (viewName === 'dashboard') this.refreshDashboard();
        if (viewName === 'teams') this.refreshTeamsGrid();
    },

    // ==========================================
    // Dashboard
    // ==========================================
    refreshDashboard() {
        const teams = DataStore.getTeams();
        document.getElementById('dashboard-month').textContent =
            UI.formatMonthShort(this.currentMonth);
        UI.renderPodium(teams, this.currentMonth);
        UI.renderRankingTable(teams, this.currentMonth);
    },

    refreshTeamsGrid() {
        const teams = DataStore.getTeams();
        UI.renderTeamsGrid(teams, this.currentMonth);
    },

    // ==========================================
    // Month Navigation
    // ==========================================
    changeMonth(delta) {
        const [year, month] = this.currentMonth.split('-').map(Number);
        let newMonth = month + delta;
        let newYear = year;
        if (newMonth > 12) { newMonth = 1; newYear++; }
        if (newMonth < 1) { newMonth = 12; newYear--; }
        this.currentMonth = `${newYear}-${String(newMonth).padStart(2, '0')}`;
        DataStore.setCurrentMonth(this.currentMonth);
        this.updateMonthDisplay();
        if (this.currentView === 'dashboard') this.refreshDashboard();
        if (this.currentView === 'teams') this.refreshTeamsGrid();
        if (this.currentDetailTeamId) this.refreshTeamDetail();
    },

    updateMonthDisplay() {
        document.getElementById('month-display').textContent =
            UI.formatMonth(this.currentMonth);
    },

    // ==========================================
    // Team Detail Modal
    // ==========================================
    openTeamDetail(teamId) {
        this.currentDetailTeamId = teamId;
        const team = DataStore.getTeam(teamId);
        if (!team) return;
        UI.renderTeamDetail(team, this.currentMonth);
        this.switchModalTab('roster');
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
        UI.renderTeamDetail(team, this.currentMonth);
        const manageTab = document.querySelector('.modal-tab[data-tab="manage"]');
        if (manageTab && manageTab.classList.contains('active')) {
            UI.renderManagePlayerList(team, this.currentMonth);
        }
    },

    switchModalTab(tabName) {
        document.querySelectorAll('.modal-tab').forEach(t =>
            t.classList.toggle('active', t.dataset.tab === tabName));
        document.querySelectorAll('.modal-tab-content').forEach(c =>
            c.classList.toggle('active', c.id === `tab-content-${tabName}`));
        if (tabName === 'manage' && this.currentDetailTeamId) {
            const team = DataStore.getTeam(this.currentDetailTeamId);
            if (team) UI.renderManagePlayerList(team, this.currentMonth);
        }
    },

    // ==========================================
    // Team CRUD (with Firebase sync)
    // ==========================================
    createTeam() {
        const name = document.getElementById('add-team-name').value.trim();
        const owner = document.getElementById('add-team-owner').value.trim();
        if (!name || !owner) {
            this.showToast('팀 이름과 오너 이름을 입력해주세요');
            return;
        }
        const team = DataStore.addTeam(name, owner);
        this.syncToFirebase('addTeam', team);
        this.closeAddTeamModal();
        this.refreshDashboard();
        this.refreshTeamsGrid();
        this.showToast(`${name} 팀이 생성되었습니다!`);
    },

    saveTeamInfo() {
        if (!this.currentDetailTeamId) return;
        const name = document.getElementById('edit-team-name').value.trim();
        const owner = document.getElementById('edit-team-owner').value.trim();
        if (!name || !owner) {
            this.showToast('이름을 입력해주세요');
            return;
        }
        DataStore.updateTeam(this.currentDetailTeamId, { name, owner });
        this.syncToFirebase('updateTeam', this.currentDetailTeamId, { name, owner });
        this.refreshTeamDetail();
        this.refreshDashboard();
        this.refreshTeamsGrid();
        this.showToast('팀 정보가 저장되었습니다');
    },

    deleteTeam() {
        if (!this.currentDetailTeamId) return;
        const team = DataStore.getTeam(this.currentDetailTeamId);
        if (!team) return;
        if (confirm(`정말 "${team.name}" 팀을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
            DataStore.deleteTeam(this.currentDetailTeamId);
            this.syncToFirebase('deleteTeam', this.currentDetailTeamId);
            this.closeTeamDetail();
            this.refreshDashboard();
            this.refreshTeamsGrid();
            this.showToast(`${team.name} 팀이 삭제되었습니다`);
        }
    },

    // ==========================================
    // Player Management (with Firebase sync)
    // ==========================================
    addPlayer() {
        if (!this.currentDetailTeamId) return;
        const name = document.getElementById('new-player-name').value.trim();
        const position = document.getElementById('new-player-position').value;
        const role = document.getElementById('new-player-role').value;
        if (!name) { this.showToast('선수 이름을 입력해주세요'); return; }
        if (!role) { this.showToast('역할을 선택해주세요'); return; }
        const isBench = role.startsWith('BN');
        DataStore.addPlayer(this.currentDetailTeamId, {
            name, realPos: position || '', role, active: !isBench
        });
        this.syncToFirebase('updatePlayers', this.currentDetailTeamId);
        document.getElementById('new-player-name').value = '';
        document.getElementById('new-player-position').value = '';
        document.getElementById('new-player-role').value = '';
        this.refreshTeamDetail();
        this.refreshDashboard();
        this.showToast(`${name} 선수가 추가되었습니다`);
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
