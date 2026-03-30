// ============================================
// Firebase Configuration & Integration
// ============================================
//
// Setup Instructions:
// 1. Go to https://console.firebase.google.com/
// 2. Create a new project (e.g., "kbo-fantasy")
// 3. Go to Project Settings → General → Your apps → Add web app
// 4. Copy the firebaseConfig object and paste below
// 5. Go to Firestore Database → Create database → Start in test mode
// 6. Done!
// ============================================

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCNCzWlIjU86QA4a9fgdUooQpmGZ6olLus",
    authDomain: "kbo-fantasy-7616b.firebaseapp.com",
    projectId: "kbo-fantasy-7616b",
    storageBucket: "kbo-fantasy-7616b.firebasestorage.app",
    messagingSenderId: "616811017001",
    appId: "1:616811017001:web:27b250463d791bf4e37d38"
};

// ============================================
// Firebase-backed DataStore
// ============================================
const FirebaseStore = {
    db: null,
    _cache: null,
    _listeners: [],
    _initialized: false,

    init() {
        if (!FIREBASE_CONFIG.apiKey) {
            console.warn('[Firebase] No config found. Using localStorage mode.');
            return false;
        }

        try {
            firebase.initializeApp(FIREBASE_CONFIG);
            this.db = firebase.firestore();
            this._initialized = true;
            console.log('[Firebase] Connected successfully');
            return true;
        } catch (e) {
            console.error('[Firebase] Init failed:', e);
            return false;
        }
    },

    isReady() {
        return this._initialized && this.db !== null;
    },

    // ==========================================
    // Real-time listener for all data
    // ==========================================
    listenToData(callback) {
        if (!this.isReady()) return;

        // Listen to teams collection
        this.db.collection('teams').onSnapshot((snapshot) => {
            callback();
        });

        // Listen to scores collection
        this.db.collection('scores').onSnapshot((snapshot) => {
            callback();
        });
    },

    // ==========================================
    // Teams
    // ==========================================
    async getTeams() {
        if (!this.isReady()) return DataStore.getTeams();

        const snapshot = await this.db.collection('teams').orderBy('order', 'asc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async getTeam(teamId) {
        if (!this.isReady()) return DataStore.getTeam(teamId);

        const doc = await this.db.collection('teams').doc(teamId).get();
        if (doc.exists) return { id: doc.id, ...doc.data() };
        return null;
    },

    async addTeam(name, owner) {
        if (!this.isReady()) return DataStore.addTeam(name, owner);

        const teams = await this.getTeams();
        const team = {
            name,
            owner,
            players: [],
            order: teams.length,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        const docRef = await this.db.collection('teams').add(team);
        return { id: docRef.id, ...team };
    },

    async updateTeam(teamId, updates) {
        if (!this.isReady()) return DataStore.updateTeam(teamId, updates);

        await this.db.collection('teams').doc(teamId).update(updates);
        return { id: teamId, ...updates };
    },

    async deleteTeam(teamId) {
        if (!this.isReady()) return DataStore.deleteTeam(teamId);

        await this.db.collection('teams').doc(teamId).delete();
    },

    // ==========================================
    // Players
    // ==========================================
    async addPlayer(teamId, player) {
        if (!this.isReady()) return DataStore.addPlayer(teamId, player);

        await this.db.collection('teams').doc(teamId).update({
            players: firebase.firestore.FieldValue.arrayUnion(player)
        });
    },

    async removePlayer(teamId, playerName) {
        if (!this.isReady()) return DataStore.removePlayer(teamId, playerName);

        const team = await this.getTeam(teamId);
        if (team) {
            const updatedPlayers = team.players.filter(p => p.name !== playerName);
            await this.db.collection('teams').doc(teamId).update({
                players: updatedPlayers
            });
        }
    },

    async togglePlayerActive(teamId, playerName) {
        if (!this.isReady()) return DataStore.togglePlayerActive(teamId, playerName);

        const team = await this.getTeam(teamId);
        if (team) {
            const updatedPlayers = team.players.map(p => {
                if (p.name === playerName) return { ...p, active: !p.active };
                return p;
            });
            await this.db.collection('teams').doc(teamId).update({
                players: updatedPlayers
            });
            const player = updatedPlayers.find(p => p.name === playerName);
            return player ? player.active : false;
        }
        return false;
    },

    // ==========================================
    // Scores
    // ==========================================
    async getScores(month) {
        if (!this.isReady()) return DataStore.getScores(month);

        const doc = await this.db.collection('scores').doc(month).get();
        if (doc.exists) return doc.data().players || {};
        return {};
    },

    async getPlayerScore(month, playerName) {
        const scores = await this.getScores(month);
        return scores[playerName] || 0;
    },

    async getTeamScore(teamId, month) {
        const team = await this.getTeam(teamId);
        if (!team) return 0;
        const scores = await this.getScores(month);
        return team.players
            .filter(p => p.active)
            .reduce((sum, p) => sum + (scores[p.name] || 0), 0);
    },

    async updateScores(month, scoresObj) {
        if (!this.isReady()) return;

        await this.db.collection('scores').doc(month).set({
            players: scoresObj,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    },

    // ==========================================
    // Migration: localStorage → Firebase
    // ==========================================
    async migrateFromLocalStorage() {
        if (!this.isReady()) return;

        const localData = DataStore.load();
        console.log('[Firebase] Migrating localStorage data...');

        // Migrate teams
        for (let i = 0; i < localData.teams.length; i++) {
            const team = localData.teams[i];
            const docRef = this.db.collection('teams').doc(team.id);
            await docRef.set({
                name: team.name,
                owner: team.owner,
                players: team.players || [],
                order: i
            });
        }

        // Migrate scores
        for (const [month, scores] of Object.entries(localData.scores || {})) {
            await this.db.collection('scores').doc(month).set({
                players: scores,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        console.log('[Firebase] Migration complete!');
    }
};
