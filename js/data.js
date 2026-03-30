// ============================================
// Data Layer - localStorage persistence
// ============================================

const SEASON_MONTHS = ['2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10'];

// 포지션별 슬롯 정의 (총 23자리)
const SLOT_GROUPS = [
    {
        id: 'batter',
        label: '⚾ 타자',
        slots: [
            { key: 'C',  label: '포수' },
            { key: '1B', label: '1루수' },
            { key: '2B', label: '2루수' },
            { key: '3B', label: '3루수' },
            { key: 'SS', label: '유격수' },
            { key: 'LF', label: '좌익수' },
            { key: 'CF', label: '중견수' },
            { key: 'RF', label: '우익수' },
            { key: 'DH', label: '지명타자' },
        ]
    },
    {
        id: 'sp',
        label: '⚡ 선발 투수',
        slots: [
            { key: 'SP1', label: '1선발' },
            { key: 'SP2', label: '2선발' },
            { key: 'SP3', label: '3선발' },
            { key: 'SP4', label: '4선발' },
            { key: 'SP5', label: '5선발' },
        ]
    },
    {
        id: 'rp',
        label: '🔥 구원 투수',
        slots: [
            { key: 'RP1', label: '1구원' },
            { key: 'RP2', label: '2구원' },
            { key: 'RP3', label: '3구원' },
            { key: 'RP4', label: '4구원' },
            { key: 'RP5', label: '5구원' },
        ]
    },
    {
        id: 'bench',
        label: '🪑 후보',
        slots: [
            { key: 'BN1', label: '후보 1' },
            { key: 'BN2', label: '후보 2' },
            { key: 'BN3', label: '후보 3' },
            { key: 'BN4', label: '후보 4' },
        ]
    }
];

const FIXED_TEAMS = [
    { id: 'team_1', name: '재석 프린스' },
    { id: 'team_2', name: '문기 도어즈' },
    { id: 'team_3', name: '정명 재원맘스' },
    { id: 'team_4', name: '경환 영건즈' },
    { id: 'team_5', name: '승환 떡상스' },
    { id: 'team_6', name: '찬웅 오크스' },
    { id: 'team_7', name: '성민 프로세스' },
    { id: 'team_8', name: '효진 휘집맘스' },
    { id: 'team_9', name: '동진 빅아이톨즈' },
    { id: 'team_10', name: '지훈 정배즈' }
];

const DataStore = {
    STORAGE_KEY: 'kbo_fantasy_data',

    getDefaultData() {
        return {
            teams: [
                {
                    id: 'team_1',
                    name: '재석 프린스',
                    roster: {
                        '2026-03': {
                            'C':   '허인서',
                            '1B':  '노시환',
                            '2B':  '박민우',
                            '3B':  '노경은',
                            'SS':  '김주원',
                            'LF':  '안우진',
                            'CF':  '김지찬',
                            'RF':  '박건우',
                            'DH':  '김영규',
                            'SP1': '오선우',
                            'SP2': '고승민',
                            'SP3': '임지민',
                            'SP4': '보울리',
                            'SP5': '와일스',
                            'RP1': '신민혁',
                            'RP2': '박세웅',
                            'RP3': '김원중',
                            'RP4': '전민재',
                            'RP5': '홍민기',
                            'BN1': '서건창',
                            'BN2': '이성규',
                            'BN3': '코아마',
                            'BN4': '카메론',
                        }
                    }
                },
                { id: 'team_2',  name: '문기 도어즈',     roster: {} },
                { id: 'team_3',  name: '정명 재원맘스',   roster: {} },
                { id: 'team_4',  name: '경환 영건즈',     roster: {} },
                { id: 'team_5',  name: '승환 떡상스',     roster: {} },
                { id: 'team_6',  name: '찬웅 오크스',     roster: {} },
                { id: 'team_7',  name: '성민 프로세스',   roster: {} },
                { id: 'team_8',  name: '효진 휘집맘스',   roster: {} },
                { id: 'team_9',  name: '동진 빅아이톨즈', roster: {} },
                { id: 'team_10', name: '지훈 정배즈',     roster: {} },
            ],
            scores: { '2026-03': {} },
            currentMonth: '2026-03'
        };
    },

    // 구버전 데이터 마이그레이션
    migrate(data) {
        data.teams.forEach(team => {
            if (!team.roster) team.roster = {};
            // 배열 포맷 → 빈 슬롯 오브젝트로 변환 (포지션 정보 없어서 초기화)
            Object.keys(team.roster).forEach(month => {
                if (Array.isArray(team.roster[month])) {
                    team.roster[month] = {};
                }
            });
            // 구버전 필드 제거
            delete team.owner;
            delete team.players;
        });
        return data;
    },

    load() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) {
                const data = JSON.parse(raw);
                this.migrate(data);
                
                // Enforce 10 fixed teams
                const currentTeams = data.teams || [];
                data.teams = FIXED_TEAMS.map(ft => {
                    const existing = currentTeams.find(t => t.id === ft.id);
                    return existing ? { ...existing, name: ft.name } : { id: ft.id, name: ft.name, roster: {} };
                });
                
                return data;
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

    // ── Team CRUD ──────────────────────────────
    getTeams() { return this.load().teams; },
    getTeam(teamId) { return this.load().teams.find(t => t.id === teamId); },

    // ── Roster (슬롯 기반) ──────────────────────
    getMonthRoster(teamId, month) {
        const team = this.getTeam(teamId);
        if (!team || !team.roster) return {};
        const r = team.roster[month];
        if (!r || Array.isArray(r)) return {};
        return r;
    },

    setMonthRoster(teamId, month, rosterObj) {
        const data = this.load();
        const team = data.teams.find(t => t.id === teamId);
        if (team) {
            if (!team.roster) team.roster = {};
            team.roster[month] = rosterObj;
            this.save(data);
        }
    },

    // 단일 슬롯 저장 (빈 문자열이면 슬롯 삭제)
    setSlot(teamId, month, slotKey, playerName) {
        const data = this.load();
        const team = data.teams.find(t => t.id === teamId);
        if (!team) return;
        if (!team.roster) team.roster = {};
        if (!team.roster[month]) team.roster[month] = {};
        if (playerName && playerName.trim()) {
            team.roster[month][slotKey] = playerName.trim();
        } else {
            delete team.roster[month][slotKey];
        }
        this.save(data);
    },

    // ── Scores ────────────────────────────────
    getScores(month) { return this.load().scores[month] || {}; },

    getPlayerScore(month, playerName) {
        return (this.getScores(month)[playerName]) || 0;
    },

    getTeamScore(teamId, month) {
        const roster = this.getMonthRoster(teamId, month);
        const scores = this.getScores(month);
        return Object.values(roster)
            .filter(name => name && name.trim())
            .reduce((sum, name) => sum + (scores[name] || 0), 0);
    },

    getActivePlayerCount(teamId, month) {
        const roster = this.getMonthRoster(teamId, month);
        return Object.values(roster).filter(name => name && name.trim()).length;
    },

    // ── Month ─────────────────────────────────
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
            if (data.teams && data.scores) { this.save(data); return true; }
        } catch (e) { console.error('Import failed:', e); }
        return false;
    }
};
