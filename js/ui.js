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

    chartInstance: null,

    // Render bar chart
    renderChart(teams, month) {
        const sorted = teams
            .map(t => {
                const stats = DataStore.getTeamScoreStats(t.id, month);
                return { ...t, score: stats.total };
            })
            .sort((a, b) => b.score - a.score);

        const ctxNode = document.getElementById('ranking-chart');
        if (!ctxNode) return;
        const ctx = ctxNode.getContext('2d');

        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        // Apply Premium Design Gradients based on Rank
        const createGrad = (c1, c2) => {
            const g = ctx.createLinearGradient(0, 0, 0, 300);
            g.addColorStop(0, c1);
            g.addColorStop(1, c2);
            return g;
        };

        const bgColors = sorted.map((_, i) => {
            if (i === 0) return createGrad('rgba(253, 224, 71, 0.9)', 'rgba(217, 119, 6, 0.9)'); // 1st - Gold
            if (i === 1) return createGrad('rgba(203, 213, 225, 0.9)', 'rgba(100, 116, 139, 0.9)'); // 2nd - Silver
            if (i === 2) return createGrad('rgba(253, 186, 116, 0.9)', 'rgba(194, 65, 12, 0.9)'); // 3rd - Bronze
            return createGrad('rgba(56, 189, 248, 0.8)', 'rgba(37, 99, 235, 0.8)'); // Base blue
        });
        
        const borderColors = sorted.map((_, i) => {
            if (i === 0) return 'rgba(253, 224, 71, 1)';
            if (i === 1) return 'rgba(203, 213, 225, 1)';
            if (i === 2) return 'rgba(253, 186, 116, 1)';
            return 'rgba(56, 189, 248, 1)';
        });

        this.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(t => t.name.substring(0, 2)),
                datasets: [{
                    label: '점수',
                    data: sorted.map(t => parseFloat(t.score.toFixed(2))),
                    backgroundColor: bgColors,
                    borderColor: borderColors,
                    borderWidth: 1,
                    borderRadius: 6,
                    barPercentage: 0.6,
                    categoryPercentage: 0.8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 1200,
                    easing: 'easeOutQuart'
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleFont: { size: 13, family: "'Pretendard', sans-serif" },
                        bodyFont: { size: 14, family: "'Pretendard', sans-serif", weight: 'bold' },
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: false,
                        titleColor: 'rgba(148, 163, 184, 1)',
                        callbacks: {
                            title: (ctx) => {
                                // Find full name for tooltip
                                const idx = ctx[0].dataIndex;
                                return sorted[idx].name + " 점수";
                            },
                            label: (context) => '✨ ' + context.raw.toFixed(2) + ' 점'
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        border: { display: false },
                        grid: { 
                            color: 'rgba(255, 255, 255, 0.05)',
                            drawBorder: false
                        },
                        ticks: { 
                            color: 'rgba(148, 163, 184, 0.8)',
                            font: { family: "'Pretendard', sans-serif", size: 11 },
                            padding: 8
                        }
                    },
                    x: {
                        border: { display: false },
                        grid: { display: false, drawBorder: false },
                        ticks: { 
                            color: 'rgba(241, 245, 249, 1)',
                            font: { family: "'Pretendard', sans-serif", size: 13, weight: 'bold' },
                            padding: 6
                        }
                    }
                }
            }
        });
    },

    // Render ranking table (all teams)
    renderRankingTable(teams, month) {
        const tbody = document.getElementById('ranking-tbody');

        const sorted = teams
            .map(t => {
                const stats = DataStore.getTeamScoreStats(t.id, month);
                return {
                    ...t,
                    score: stats.total,
                    current: stats.current,
                    prev: stats.prev
                };
            })
            .sort((a, b) => b.score - a.score);

        // Update headers with month names (Mobile optimization)
        const isMobile = window.innerWidth <= 768;
        const curMonthNum = parseInt(month.split('-')[1]);
        const monthIdx = SEASON_MONTHS.indexOf(month);
        const prevMonthStr = monthIdx > 0 ? SEASON_MONTHS[monthIdx - 1] : null;
        const prevMonthNum = prevMonthStr ? parseInt(prevMonthStr.split('-')[1]) : null;

        const totalHeader = document.getElementById('col-total-score');
        if (totalHeader) totalHeader.textContent = isMobile ? '총점' : '총 누적 점수';

        const curHeader = document.getElementById('col-current-month');
        if (curHeader) {
            curHeader.textContent = isMobile ? `${curMonthNum}월` : `${curMonthNum}월 점수`;
        }

        const prevHeader = document.getElementById('col-prev-month');
        if (prevHeader) {
            if (isMobile) {
                prevHeader.textContent = prevMonthNum ? `${prevMonthNum}월` : '-';
            } else {
                prevHeader.textContent = prevMonthNum ? `${prevMonthNum}월 점수` : '-';
            }
        }

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
                    <td class="score-col"><span class="score-value ${team.current >= 0 ? 'score-positive' : 'score-negative'}">${team.current.toFixed(2)}</span></td>
                    <td class="score-col hidden-mobile"><span class="score-value ${team.prev >= 0 ? 'score-positive' : 'score-negative'}">${team.prev.toFixed(2)}</span></td>
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

    // Render player lookup table
    renderPlayerLookup(players, month) {
        const tbody = document.getElementById('players-tbody');

        if (!players || !players.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6">
                        <div class="empty-state">
                            <div class="empty-icon">🔍</div>
                            <div class="empty-text">검색 결과가 없습니다</div>
                            <div class="empty-desc">조건을 변경해 보세요.</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = players.map(p => {
            const scoreClass = p.score > 0 ? 'score-positive' : p.score < 0 ? 'score-negative' : 'score-zero';
            let posText = p.posType === 'batter' ? '타자' : '투수';
            let posClass = p.posType === 'batter' ? 'active' : 'pitcher';
            if (p.slotKey) {
                if (p.slotKey.startsWith('BN')) { posText = '후보'; posClass = 'bench'; }
                else if (p.slotKey.startsWith('SP')) { posText = '선발'; posClass = 'pitcher'; }
                else if (p.slotKey.startsWith('RP')) { posText = '구원'; posClass = 'pitcher'; }
                else { posText = '타자'; posClass = 'active'; }
            }
            const posBadge = `<span class="roster-chip ${posClass}">${posText}</span>`;
            return `
                <tr>
                    <td class="team-name-cell">${p.name}</td>
                    <td>${p.kTeam || '-'}</td>
                    <td>${p.fTeamName}</td>
                    <td>${posBadge}</td>
                    <td class="score-col"><span class="score-value ${scoreClass}">${p.score.toFixed(2)}</span></td>
                </tr>
            `;
        }).join('');
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
