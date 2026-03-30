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
                activeCount: DataStore.getActivePlayerCount(t.id, month)
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
