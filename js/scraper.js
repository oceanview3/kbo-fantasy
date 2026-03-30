// ============================================
// Client-side Scraper
// 브라우저에서 직접 웰컴톱랭킹 점수를 스크래핑
// CORS 프록시를 통해 HTML을 가져와서 파싱
// ============================================

const Scraper = {
    CORS_PROXIES: [
        'https://corsproxy.io/?',
        'https://api.allorigins.win/raw?url='
    ],
    BASE_URL: 'https://www.welcometopranking.com/baseball/',
    proxyIndex: 0,

    // Progress callback
    onProgress: null,

    getProxyUrl(targetUrl) {
        const proxy = this.CORS_PROXIES[this.proxyIndex];
        return proxy + encodeURIComponent(targetUrl);
    },

    async fetchPage(url) {
        // Try each proxy until one works
        for (let i = 0; i < this.CORS_PROXIES.length; i++) {
            const proxyIdx = (this.proxyIndex + i) % this.CORS_PROXIES.length;
            const proxy = this.CORS_PROXIES[proxyIdx];
            const proxyUrl = proxy + encodeURIComponent(url);

            try {
                const resp = await fetch(proxyUrl, {
                    headers: { 'Accept': 'text/html' }
                });
                if (resp.ok) {
                    this.proxyIndex = proxyIdx; // Remember working proxy
                    return await resp.text();
                }
            } catch (e) {
                console.warn(`[Scraper] Proxy ${proxyIdx} failed:`, e.message);
            }
        }
        throw new Error('All CORS proxies failed');
    },

    parseTable(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const rows = doc.querySelectorAll('table tbody tr');
        const players = {};

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 4) return;

            try {
                const rankText = cells[0].textContent.trim();
                const rank = parseInt(rankText);
                if (isNaN(rank) || rank <= 0) return;

                const name = cells[1].textContent.trim().split('\n')[0].trim();
                const scoreText = cells[3].textContent.trim().replace(',', '');
                const score = parseFloat(scoreText);

                if (name && name.length >= 2 && !isNaN(score)) {
                    players[name] = score;
                }
            } catch (e) {
                // Skip invalid rows
            }
        });

        return players;
    },

    async scrapeAll(year, month) {
        const searchDate = `Y${year}M${String(month).padStart(2, '0')}`;
        const allPlayers = {};
        let totalPages = 0;
        const estimatedPages = 14; // ~8 batter + ~6 pitcher pages

        // Progress: 0% - start
        this.reportProgress(0, '타자 랭킹 수집 중...');

        // Scrape batters
        for (let pg = 1; pg <= 20; pg++) {
            const url = `${this.BASE_URL}?p=chart&searchType=MONTHLY&searchDate=${searchDate}&position=T&page=${pg}`;

            try {
                const html = await this.fetchPage(url);
                const players = this.parseTable(html);
                const newCount = Object.keys(players).filter(k => !(k in allPlayers)).length;

                if (Object.keys(players).length === 0 || (newCount === 0 && pg > 1)) {
                    break;
                }

                Object.assign(allPlayers, players);
                totalPages++;

                // Progress: 0% ~ 50%
                const pct = Math.min(50, Math.round((totalPages / estimatedPages) * 50));
                this.reportProgress(pct, `타자 ${Object.keys(allPlayers).length}명 수집 (${pg}페이지)...`);

            } catch (e) {
                console.error(`[Scraper] Batter page ${pg} error:`, e);
                if (pg === 1) throw e; // First page must work
                break;
            }

            if (totalPages >= 8) break; // Safety limit
        }

        // Progress: 50%
        this.reportProgress(50, '투수 랭킹 수집 중...');
        const batterCount = Object.keys(allPlayers).length;

        // Scrape pitchers
        for (let pg = 1; pg <= 20; pg++) {
            const url = `${this.BASE_URL}?p=chart&searchType=MONTHLY&searchDate=${searchDate}&position=1&page=${pg}`;

            try {
                const html = await this.fetchPage(url);
                const players = this.parseTable(html);
                const newCount = Object.keys(players).filter(k => !(k in allPlayers)).length;

                if (Object.keys(players).length === 0 || (newCount === 0 && pg > 1)) {
                    break;
                }

                Object.assign(allPlayers, players);
                totalPages++;

                // Progress: 50% ~ 90%
                const pitcherProgress = totalPages - 8; // pages after batters
                const pct = Math.min(90, 50 + Math.round((pitcherProgress / 6) * 40));
                const pitcherCount = Object.keys(allPlayers).length - batterCount;
                this.reportProgress(pct, `투수 ${pitcherCount}명 수집 (${pg}페이지)...`);

            } catch (e) {
                console.error(`[Scraper] Pitcher page ${pg} error:`, e);
                if (pg === 1) throw e;
                break;
            }

            if (totalPages >= 14) break;
        }

        console.log(`[Scraper] Total: ${Object.keys(allPlayers).length} players`);
        return allPlayers;
    },

    async uploadToFirebase(db, scores, monthKey) {
        this.reportProgress(92, 'Firebase에 업로드 중...');

        await db.collection('scores').doc(monthKey).set({
            players: scores,
            updated_at: new Date().toISOString(),
            player_count: Object.keys(scores).length
        });

        this.reportProgress(100, '완료!');
    },

    reportProgress(percent, message) {
        if (this.onProgress) {
            this.onProgress(percent, message);
        }
        console.log(`[Scraper] ${percent}% - ${message}`);
    }
};
