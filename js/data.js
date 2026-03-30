// ============================================
// Data Layer - localStorage persistence
// ============================================

const SEASON_MONTHS = ['2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10'];

const DataStore = {
    STORAGE_KEY: 'kbo_fantasy_data',

    getDefaultData() {
        return {
            teams: [
                {
                    id: 'team_1',
                    name: '상민 프로세스',
                    // roster: { 'YYYY-MM': ['선수이름', ...] }
                    roster: {
                        '2026-03': [
                            '김주원','노시환','박민우','박건우','노경은','김원중',
                            '안우진','김지찬','김영규','오선우','고승민','임지민',
                            '보울리','와일스','신민혁','박세웅','허인서','전민재',
                            '홍민기','서건창','이성규','코아마','카메론'
                        ]
                    }
                },
                { id: 'team_2', name: '빌맙스', roster: {} },
                { id: 'team_3', name: '경환 영건조', roster: {} },
                { id: 'team_4', name: '승환 떡살스', roster: {} },
                { id: 'team_5', name: '천용 오크스', roster: {} },
                { id: 'team_6', name: '효진 휘집맙스', roster: {} },
                { id: 'team_7', name: '동진 빅아이돌즈', roster: {} },
                { id: 'team_8', name: '지훈 정배조', roster: {} },
                { id: 'team_9', name: '팀 9', roster: {} },
                { id: 'team_10', name: '팀 10', roster: {} },
            ],
            // Scores: { 'YYYY-MM': { '선수명': score } }
            scores: {
                '2026-03': {}
            },
            currentMonth: '2026-03'
        };
    },

    // Migrate old data format if needed
    migrate(data) {
        data.teams.forEach(team => {
            // Old format: team.players (array of objects)
            // New format: team.roster (object keyed by month)
            if (team.players && !team.roster) {
                const names = team.players.map(p => p.name || p).filter(Boolean);
                team.roster = { '2026-03': names };
                delete team.players;
            }
            if (!team.roster) team.roster = {};
            // Remove owner if still present
            delete team.owner;
        });
        return data;
    },

    load() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) {
                const data = JSON.parse(raw);
                return this.migrate(data);
            }
        } catch (e) {
            console.error('Failed to load data:', e);
        }
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
    getTeams() { return this.load().teams; },
    getTeam(teamId) { return this.load().teams.find(t => t.id === teamId); },

    addTeam(name) {
        const data = this.load();
        const team = { id: 'team_' + Date.now(), name, roster: {} };
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

    // Player management (month-based)
    getMonthRoster(teamId, month) {
        const team = this.getTeam(teamId);
        if (!team) return [];
        return (team.roster && team.roster[month]) || [];
    },

    setMonthRoster(teamId, month, players) {
        const data = this.load();
        const team = data.teams.find(t => t.id === teamId);
        if (team) {
            if (!team.roster) team.roster = {};
            team.roster[month] = players;
            this.save(data);
        }
    },

    addPlayer(teamId, month, playerName) {
        const roster = this.getMonthRoster(teamId, month);
        if (!roster.includes(playerName)) {
            roster.push(playerName);
            this.setMonthRoster(teamId, month, roster);
            return true;
        }
        return false;
    },

    removePlayer(teamId, month, playerName) {
        const roster = this.getMonthRoster(teamId, month);
        const updated = roster.filter(n => n !== playerName);
        this.setMonthRoster(teamId, month, updated);
    },

    // Scores
    getScores(month) {
        return this.load().scores[month] || {};
    },

    getPlayerScore(month, playerName) {
        return (this.getScores(month)[playerName]) || 0;
    },

    getTeamScore(teamId, month) {
        const roster = this.getMonthRoster(teamId, month);
        const scores = this.getScores(month);
        return roster.reduce((sum, name) => sum + (scores[name] || 0), 0);
    },

    getActivePlayerCount(teamId, month) {
        return this.getMonthRoster(teamId, month).length;
    },

    // Month management
    getCurrentMonth() { return this.load().currentMonth; },
    setCurrentMonth(month) {
        const data = this.load();
        data.currentMonth = month;
        this.save(data);
    },

    exportData() { return JSON.stringify(this.load(), null, 2); },

    importData(jsonStr) {
        try {
            const data = JSON.parse(jsonStr);
            if (data.teams && data.scores) {
                this.save(data);
                return true;
            }
        } catch (e) { console.error('Import failed:', e); }
        return false;
    }
};
