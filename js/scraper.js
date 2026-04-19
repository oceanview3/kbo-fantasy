// ============================================
// Scraper Layer - Browser-side scraping with CORS Proxy
// ============================================

const Scraper = {
    BASE_URL: "https://www.welcometopranking.com/baseball/",
    
    // Stable proxies
    PROXIES: [
        "https://api.codetabs.com/v1/proxy?quest=",
        "https://corsproxy.io/?",
        "https://api.allorigins.win/raw?url="
    ],

    onProgress: null,

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    async fetchPage(url) {
        let lastError = null;
        for (const proxy of this.PROXIES) {
            try {
                const proxyUrl = proxy + encodeURIComponent(url);
                const resp = await fetch(proxyUrl);
                if (resp.ok) {
                    return await resp.text();
                }
            } catch (e) {
                lastError = e;
            }
        }
        throw lastError || new Error(`Fetch failed for ${url}`);
    },

    parseTable(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Structural Validation: Check for ranking table markers
        // The site uses <table class="type01"> and <thead> with "Rank"
        const table = doc.querySelector('table.type01');
        const headers = Array.from(doc.querySelectorAll('th')).map(th => th.textContent.trim().toLowerCase());
        const isStructureValid = !!table && (headers.includes('rank') || headers.includes('순위'));

        const rows = doc.querySelectorAll('tbody tr');
        const players = {};
        let hasRank1 = false;

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 4) return;

            try {
                const rankText = cells[0].textContent.trim();
                if (rankText === '1') hasRank1 = true;

                // Name and potential team in parentheses
                const nameText = cells[1].textContent.trim().split('\n')[0].trim();
                const teamText = cells[2].textContent.trim();
                
                // Cleanup name if it contains team or other artifacts
                const name = nameText.split('(')[0].trim();
                const team = teamText || (nameText.includes('(') ? nameText.match(/\((.*?)\)/)?.[1] : '');
                
                const scoreText = cells[3].textContent.trim().replace(',', '');
                const score = parseFloat(scoreText);

                if (name && name.length >= 2 && !isNaN(score)) {
                    // Unique key: "Name (Team)"
                    const key = team ? `${name} (${team})` : name;
                    players[key] = score;
                }
            } catch (e) {
                // Skip invalid rows
            }
        });

        return { players, isStructureValid, hasRank1 };
    },

    async _scrapeConcurrently(position, maxPages, searchDate, progressBase, progressMax, label) {
        const allPlayers = {};
        const chunkSize = 5;

        for (let i = 1; i <= maxPages; i += chunkSize) {
            const promises = [];
            for (let j = 0; j < chunkSize && (i + j) <= maxPages; j++) {
                const pg = i + j;
                const url = `${this.BASE_URL}?p=chart&searchType=MONTHLY&searchDate=${searchDate}&position=${position}&page=${pg}`;
                promises.push(this.fetchPage(url).then(html => ({ pg, html })).catch(e => {
                    console.error(`[Scraper] ${label} page ${pg} error:`, e);
                    return { pg, error: e };
                }));
            }

            const results = await Promise.all(promises);
            let noMoreData = false;

            results.sort((a, b) => a.pg - b.pg);

            for (const res of results) {
                if (res.error) {
                    if (res.pg === 1) throw res.error;
                    break;
                }

                const { players, isStructureValid, hasRank1 } = this.parseTable(res.html);

                if (res.pg === 1) {
                    if (!isStructureValid) throw new Error("사이트 구조 변동 감지 (Table Header missing)");
                    if (Object.keys(players).length > 0 && !hasRank1) throw new Error("데이터 연속성 오류 (Rank 1 missing)");
                }

                const beforeCount = Object.keys(allPlayers).length;
                Object.assign(allPlayers, players);
                const afterCount = Object.keys(allPlayers).length;
                const newCount = afterCount - beforeCount;

                if (Object.keys(players).length === 0 || (newCount === 0 && res.pg > 1)) {
                    noMoreData = true;
                }
            }

            const currentCount = Object.keys(allPlayers).length;
            const currentPg = Math.min(i + chunkSize - 1, maxPages);
            const progress = progressBase + Math.min(progressMax, (currentPg / maxPages) * progressMax);
            
            this.reportProgress(progress, `${label} ${currentCount}명 수집 (~${currentPg}페이지)...`);

            if (noMoreData) break;

            if (i + chunkSize <= maxPages) {
                await this.sleep(300); // short delay between chunks
            }
        }
        return allPlayers;
    },

    async scrapeAll(year, month) {
        const searchDate = `Y${year}M${String(month).padStart(2, '0')}`;
        
        this.reportProgress(0, '타자 랭킹 수집 중...');
        const batters = await this._scrapeConcurrently('T', 30, searchDate, 0, 45, '타자');

        this.reportProgress(50, '투수 랭킹 수집 중...');
        const pitchers = await this._scrapeConcurrently('1', 20, searchDate, 50, 40, '투수');

        const totalCount = Object.keys(batters).length + Object.keys(pitchers).length;
        console.log(`[Scraper] Total: ${Object.keys(batters).length} batters, ${Object.keys(pitchers).length} pitchers (Total: ${totalCount})`);
        
        if (totalCount === 0) {
            throw new Error(`수집된 선수가 한 명도 없습니다. (서버 응답 확인 필요)`);
        }

        return { batters, pitchers };
    },

    async uploadToFirebase(db, scores, monthKey) {
        this.reportProgress(92, 'Firebase에 업로드 중...');

        await db.collection('scores').doc(monthKey).set({
            players: scores,
            updated_at: new Date().toISOString(),
            player_count: Object.keys(scores.batters || {}).length + Object.keys(scores.pitchers || {}).length
        });

        this.reportProgress(100, '완료!');
    },

    reportProgress(percent, message) {
        if (this.onProgress) {
            this.onProgress(percent, message);
        }
        console.log(`[Scraper] ${Math.round(percent)}% - ${message}`);
    }
};
