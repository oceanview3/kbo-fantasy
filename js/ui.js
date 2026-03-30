// ============================================
// UI Rendering Functions
// ============================================

const UI = {
    // Format score with color
    formatScore(score) {
        const val = parseFloat(score) || 0;
        const formatted = val.toFixed(2);
        if (val > 0) return `<span class="score-positive">+${formatted}</span>`;
        if (val < 0) return `<span class="score-negative">${formatted}</span>`;
        return `<span class="score-zero">${formatted}</span>`;
    },

    // Render podium (top 3 teams)
    renderPodium(teams, month) {
        const container = document.getElementById('podium-section');
        if (!teams.length) {
            container.innerHTML = '';
            return;
        }

        const sorted = teams
            .map(t => ({ ...t, score: DataStore.getTeamScore(t.id, month) }))
            .sort((a, b) => b.score - a.score);

        const top3 = sorted.slice(0, 3);
        const classes = ['first', 'second', 'third'];
        const medals = ['🥇', '🥈', '🥉'];

        container.innerHTML = top3.map((team, i) => `
            <div class="podium-card ${classes[i]}" data-team-id="${team.id}">
                <div class="podium-rank">${i + 1}</div>
                <div class="podium-team-name">${team.name}</div>
                <div class="podium-owner">${team.owner}</div>
                <div class="podium-score">${team.score.toFixed(2)}</div>
                <div class="podium-score-label">톱랭킹 포인트</div>
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.podium-card').forEach(card => {
            card.addEventListener('click', () => {
                App.openTeamDetail(card.dataset.teamId);
            });
        });
    },

    // Render ranking table (all teams)
    renderRankingTable(teams, month) {
        const tbody = document.getElementById('ranking-tbody');

        const sorted = teams
            .map(t => ({
                ...t,
                score: DataStore.getTeamScore(t.id, month),
                activeCount: DataStore.getActivePlayerCount(t.id)
            }))
            .sort((a, b) => b.score - a.score);

        if (!sorted.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6">
                        <div class="empty-state">
                            <div class="empty-icon">⚾</div>
                            <div class="empty-text">등록된 팀이 없습니다</div>
                            <div class="empty-desc">팀 관리에서 새 팀을 추가해주세요</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = sorted.map((team, i) => {
            const rank = i + 1;
            let badgeClass = 'normal';
            if (rank === 1) badgeClass = 'top1';
            else if (rank === 2) badgeClass = 'top2';
            else if (rank === 3) badgeClass = 'top3';

            return `
                <tr data-team-id="${team.id}">
                    <td class="rank-col"><span class="rank-badge ${badgeClass}">${rank}</span></td>
                    <td><span class="team-name-cell">${team.name}</span></td>
                    <td>${team.owner}</td>
                    <td class="score-col"><span class="score-value ${team.score >= 0 ? 'score-positive' : 'score-negative'}">${team.score.toFixed(2)}</span></td>
                    <td><span class="players-count">${team.activeCount}명 출전</span></td>
                    <td class="detail-col"><span class="detail-arrow">›</span></td>
                </tr>
            `;
        }).join('');

        // Add click handlers
        tbody.querySelectorAll('tr[data-team-id]').forEach(row => {
            row.addEventListener('click', () => {
                App.openTeamDetail(row.dataset.teamId);
            });
        });
    },

    // Render teams grid
    renderTeamsGrid(teams, month) {
        const grid = document.getElementById('teams-grid');

        if (!teams.length) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1">
                    <div class="empty-icon">👥</div>
                    <div class="empty-text">등록된 팀이 없습니다</div>
                    <div class="empty-desc">"새 팀 추가" 버튼으로 팀을 만들어보세요</div>
                </div>
            `;
            return;
        }

        grid.innerHTML = teams.map(team => {
            const score = DataStore.getTeamScore(team.id, month);
            const activePlayers = team.players.filter(p => p.active);
            const benchPlayers = team.players.filter(p => !p.active);

            return `
                <div class="team-card" data-team-id="${team.id}">
                    <div class="team-card-header">
                        <div>
                            <div class="team-card-name">${team.name}</div>
                            <div class="team-card-owner">${team.owner}</div>
                        </div>
                        <div class="team-card-score ${score >= 0 ? 'score-positive' : 'score-negative'}">
                            ${score.toFixed(2)}
                        </div>
                    </div>
                    <div class="team-card-roster">
                        ${activePlayers.slice(0, 8).map(p =>
                            `<span class="roster-chip active">${p.name}</span>`
                        ).join('')}
                        ${activePlayers.length > 8 ? `<span class="roster-chip">+${activePlayers.length - 8}</span>` : ''}
                        ${benchPlayers.length > 0 ? `<span class="roster-chip bench">벤치 ${benchPlayers.length}명</span>` : ''}
                        ${team.players.length === 0 ? `<span class="roster-chip">선수 없음</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // Add click handlers
        grid.querySelectorAll('.team-card').forEach(card => {
            card.addEventListener('click', () => {
                App.openTeamDetail(card.dataset.teamId);
            });
        });
    },

    // Categorize roles
    getRoleCategory(role) {
        const batterRoles = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
        const spRoles = ['SP1', 'SP2', 'SP3', 'SP4', 'SP5'];
        const rpRoles = ['RP1', 'RP2', 'RP3', 'RP4', 'RP5'];
        const benchRoles = ['BN1', 'BN2', 'BN3', 'BN4'];

        if (batterRoles.includes(role)) return 'batter';
        if (spRoles.includes(role)) return 'sp';
        if (rpRoles.includes(role)) return 'rp';
        if (benchRoles.includes(role)) return 'bench';
        return 'batter';
    },

    getRoleLabel(role) {
        const labels = {
            'C': 'C', '1B': '1B', '2B': '2B', '3B': '3B', 'SS': 'SS',
            'LF': 'LF', 'CF': 'CF', 'RF': 'RF', 'DH': 'DH',
            'SP1': '1선발', 'SP2': '2선발', 'SP3': '3선발', 'SP4': '4선발', 'SP5': '5선발',
            'RP1': '1릴리프', 'RP2': '2릴리프', 'RP3': '3릴리프', 'RP4': '4릴리프', 'RP5': '5릴리프',
            'BN1': '후보1', 'BN2': '후보2', 'BN3': '후보3', 'BN4': '후보4'
        };
        return labels[role] || role;
    },

    // Render player rows
    renderPlayerRow(player, month, showActions) {
        const score = DataStore.getPlayerScore(month, player.name);
        const category = this.getRoleCategory(player.role);
        let roleClass = 'batter';
        if (category === 'sp' || category === 'rp') roleClass = 'pitcher';
        if (category === 'bench') roleClass = 'bench-role';

        const actionsHtml = showActions ? `
            <div class="player-actions">
                <button class="player-action-btn ${player.active ? 'toggle-active' : 'toggle-inactive'}"
                        data-action="toggle" data-player="${player.name}" title="${player.active ? '벤치로' : '출전'}">
                    ${player.active ? '✓' : '○'}
                </button>
                <button class="player-action-btn danger" data-action="remove" data-player="${player.name}" title="삭제">
                    ✕
                </button>
            </div>
        ` : '';

        return `
            <div class="player-row">
                <span class="player-role ${roleClass}">${this.getRoleLabel(player.role)}</span>
                <span class="player-name">${player.name}</span>
                <span class="player-position">${player.realPos || ''}</span>
                <span class="player-score ${score >= 0 ? 'score-positive' : 'score-negative'}">${score.toFixed(2)}</span>
                ${actionsHtml}
            </div>
        `;
    },

    // Render team detail modal content
    renderTeamDetail(team, month) {
        const modal = document.getElementById('team-modal');
        document.getElementById('modal-team-name').textContent = team.name;
        document.getElementById('modal-team-owner').textContent = team.owner;

        const totalScore = DataStore.getTeamScore(team.id, month);
        document.getElementById('modal-team-score').textContent = totalScore.toFixed(2);

        // Edit fields
        document.getElementById('edit-team-name').value = team.name;
        document.getElementById('edit-team-owner').value = team.owner;

        // Categorize players
        const batters = team.players.filter(p => this.getRoleCategory(p.role) === 'batter' && p.active);
        const sp = team.players.filter(p => this.getRoleCategory(p.role) === 'sp' && p.active);
        const rp = team.players.filter(p => this.getRoleCategory(p.role) === 'rp' && p.active);
        const bench = team.players.filter(p => !p.active || this.getRoleCategory(p.role) === 'bench');

        // Roster tab
        document.getElementById('roster-batters').innerHTML =
            batters.length ? batters.map(p => this.renderPlayerRow(p, month, false)).join('') :
            '<div class="empty-state"><div class="empty-desc">타자가 없습니다</div></div>';

        document.getElementById('roster-sp').innerHTML =
            sp.length ? sp.map(p => this.renderPlayerRow(p, month, false)).join('') :
            '<div class="empty-state"><div class="empty-desc">선발 투수가 없습니다</div></div>';

        document.getElementById('roster-rp').innerHTML =
            rp.length ? rp.map(p => this.renderPlayerRow(p, month, false)).join('') :
            '<div class="empty-state"><div class="empty-desc">릴리프 투수가 없습니다</div></div>';

        // Bench tab
        document.getElementById('bench-players').innerHTML =
            bench.length ? bench.map(p => this.renderPlayerRow(p, month, false)).join('') :
            '<div class="empty-state"><div class="empty-desc">벤치 선수가 없습니다</div></div>';

        // Manage tab - show all players with actions
        // We use tab-content-manage for the full player list with toggle/remove buttons
    },

    // Render manage tab player list
    renderManagePlayerList(team, month) {
        const manageSection = document.querySelector('#tab-content-manage .manage-section:first-child');
        // The player list with actions will be appended after the add-player section

        // Find or create the player management list container
        let playerListContainer = document.getElementById('manage-player-list');
        if (!playerListContainer) {
            playerListContainer = document.createElement('div');
            playerListContainer.id = 'manage-player-list';
            playerListContainer.className = 'manage-section';
            const manageContent = document.getElementById('tab-content-manage');
            // Insert before the danger zone
            const dangerSection = manageContent.querySelector('.manage-title.danger')?.parentElement;
            if (dangerSection) {
                manageContent.insertBefore(playerListContainer, dangerSection);
                // Add divider
                const divider = document.createElement('hr');
                divider.className = 'divider';
                manageContent.insertBefore(divider, dangerSection);
            } else {
                manageContent.appendChild(playerListContainer);
            }
        }

        playerListContainer.innerHTML = `
            <h3 class="manage-title">선수 목록 (${team.players.length}명)</h3>
            <div class="player-list">
                ${team.players.map(p => this.renderPlayerRow(p, month, true)).join('')}
            </div>
        `;

        // Add event handlers for player actions
        playerListContainer.querySelectorAll('.player-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const playerName = btn.dataset.player;

                if (action === 'toggle') {
                    DataStore.togglePlayerActive(App.currentDetailTeamId, playerName);
                    App.syncToFirebase('updatePlayers', App.currentDetailTeamId);
                    App.refreshTeamDetail();
                    App.refreshDashboard();
                    App.showToast(`${playerName} ${btn.classList.contains('toggle-active') ? '벤치로 이동' : '출전 등록'}`);
                } else if (action === 'remove') {
                    if (confirm(`${playerName} 선수를 삭제하시겠습니까?`)) {
                        DataStore.removePlayer(App.currentDetailTeamId, playerName);
                        App.syncToFirebase('updatePlayers', App.currentDetailTeamId);
                        App.refreshTeamDetail();
                        App.refreshDashboard();
                        App.showToast(`${playerName} 삭제 완료`);
                    }
                }
            });
        });
    },

    // Month formatting
    formatMonth(monthStr) {
        const [year, month] = monthStr.split('-');
        return `${year}년 ${parseInt(month)}월`;
    },

    formatMonthShort(monthStr) {
        const [, month] = monthStr.split('-');
        return `${parseInt(month)}월`;
    },

    // Show toast notification
    showToast(message) {
        const toast = document.getElementById('toast');
        const toastMsg = document.getElementById('toast-message');
        toastMsg.textContent = message;
        toast.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
    }
};
