// ============================================
// Data Layer - localStorage persistence
// Will migrate to Firebase later
// ============================================

const DataStore = {
    STORAGE_KEY: 'kbo_fantasy_data',

    // Default sample data matching user's spreadsheet structure
    getDefaultData() {
        return {
            teams: [
                {
                    id: 'team_1',
                    name: '상민 프로세스',
                    owner: '상민',
                    players: [
                        { name: '김주원', realPos: 'SS', role: 'SS', active: true },
                        { name: '노시환', realPos: '3B', role: '1B', active: true },
                        { name: '박민우', realPos: '2B', role: '2B', active: true },
                        { name: '박건우', realPos: 'RF', role: 'RF', active: true },
                        { name: '노경은', realPos: 'RP', role: '3B', active: true },
                        { name: '김원중', realPos: 'RP', role: 'C', active: true },
                        { name: '안우진', realPos: 'SP', role: 'LF', active: true },
                        { name: '김지찬', realPos: 'CF,2B', role: 'CF', active: true },
                        { name: '김영규', realPos: 'RP', role: 'DH', active: true },
                        { name: '오선우', realPos: '1B,LF,RF', role: 'SP1', active: true },
                        { name: '고승민', realPos: '1B,2B,RF', role: 'SP2', active: true },
                        { name: '임지민', realPos: 'SP,RP', role: 'SP3', active: true },
                        { name: '보울리', realPos: 'SP', role: 'SP4', active: true },
                        { name: '와일스', realPos: 'SP', role: 'SP5', active: true },
                        { name: '신민혁', realPos: 'SP', role: 'RP1', active: true },
                        { name: '박세웅', realPos: 'SP', role: 'RP2', active: true },
                        { name: '허인서', realPos: 'C', role: 'RP3', active: true },
                        { name: '전민재', realPos: 'SS,3B', role: 'RP4', active: true },
                        { name: '홍민기', realPos: 'RP', role: 'RP5', active: true },
                        { name: '서건창', realPos: '1B,2B', role: 'BN1', active: false },
                        { name: '이성규', realPos: '1B,CF,RF', role: 'BN2', active: false },
                        { name: '코아마', realPos: 'SP,RP', role: 'BN3', active: false },
                        { name: '카메론', realPos: 'CF,RF', role: 'BN4', active: false },
                    ]
                },
                {
                    id: 'team_2',
                    name: '빌맙스',
                    owner: '빌',
                    players: []
                },
                {
                    id: 'team_3',
                    name: '경환 영건조',
                    owner: '경환',
                    players: []
                },
                {
                    id: 'team_4',
                    name: '승환 떡살스',
                    owner: '승환',
                    players: []
                },
                {
                    id: 'team_5',
                    name: '천용 오크스',
                    owner: '천용',
                    players: []
                },
                {
                    id: 'team_6',
                    name: '효진 휘집맙스',
                    owner: '효진',
                    players: []
                },
                {
                    id: 'team_7',
                    name: '동진 빅아이돌즈',
                    owner: '동진',
                    players: []
                },
                {
                    id: 'team_8',
                    name: '지훈 정배조',
                    owner: '지훈',
                    players: []
                },
                {
                    id: 'team_9',
                    name: '팀 9',
                    owner: '오너9',
                    players: []
                },
                {
                    id: 'team_10',
                    name: '팀 10',
                    owner: '오너10',
                    players: []
                }
            ],
            // Scores indexed by month (YYYY-MM) → playerName → score
            scores: {
                '2026-03': {
                    // 실제 점수는 스크래퍼가 수집합니다
                }
            },
            currentMonth: '2026-03'
        };
    },

    load() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) {
                return JSON.parse(raw);
            }
        } catch (e) {
            console.error('Failed to load data:', e);
        }
        // Return default data for first-time users
        const defaultData = this.getDefaultData();
        this.save(defaultData);
        return defaultData;
    },

    save(data) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('Failed to save data:', e);
        }
    },

    // Team CRUD
    getTeams() {
        return this.load().teams;
    },

    getTeam(teamId) {
        return this.load().teams.find(t => t.id === teamId);
    },

    addTeam(name, owner) {
        const data = this.load();
        const team = {
            id: 'team_' + Date.now(),
            name,
            owner,
            players: []
        };
        data.teams.push(team);
        this.save(data);
        return team;
    },

    updateTeam(teamId, updates) {
        const data = this.load();
        const team = data.teams.find(t => t.id === teamId);
        if (team) {
            Object.assign(team, updates);
            this.save(data);
        }
        return team;
    },

    deleteTeam(teamId) {
        const data = this.load();
        data.teams = data.teams.filter(t => t.id !== teamId);
        this.save(data);
    },

    // Player management
    addPlayer(teamId, player) {
        const data = this.load();
        const team = data.teams.find(t => t.id === teamId);
        if (team) {
            team.players.push(player);
            this.save(data);
        }
    },

    removePlayer(teamId, playerName) {
        const data = this.load();
        const team = data.teams.find(t => t.id === teamId);
        if (team) {
            team.players = team.players.filter(p => p.name !== playerName);
            this.save(data);
        }
    },

    togglePlayerActive(teamId, playerName) {
        const data = this.load();
        const team = data.teams.find(t => t.id === teamId);
        if (team) {
            const player = team.players.find(p => p.name === playerName);
            if (player) {
                player.active = !player.active;
                this.save(data);
                return player.active;
            }
        }
        return false;
    },

    // Scores
    getScores(month) {
        const data = this.load();
        return data.scores[month] || {};
    },

    getPlayerScore(month, playerName) {
        const scores = this.getScores(month);
        return scores[playerName] || 0;
    },

    getTeamScore(teamId, month) {
        const team = this.getTeam(teamId);
        if (!team) return 0;
        const scores = this.getScores(month);
        return team.players
            .filter(p => p.active)
            .reduce((sum, p) => sum + (scores[p.name] || 0), 0);
    },

    getActivePlayerCount(teamId) {
        const team = this.getTeam(teamId);
        if (!team) return 0;
        return team.players.filter(p => p.active).length;
    },

    // Month management
    getCurrentMonth() {
        return this.load().currentMonth;
    },

    setCurrentMonth(month) {
        const data = this.load();
        data.currentMonth = month;
        this.save(data);
    },

    // Export / Import
    exportData() {
        return JSON.stringify(this.load(), null, 2);
    },

    importData(jsonStr) {
        try {
            const data = JSON.parse(jsonStr);
            if (data.teams && data.scores) {
                this.save(data);
                return true;
            }
        } catch (e) {
            console.error('Import failed:', e);
        }
        return false;
    }
};
