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
        const rows = doc.querySelectorAll('tbody tr');
        const players = {};

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 4) return;

            try {
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

        return players;
    },

    async scrapeAll(year, month) {
        const searchDate = `Y${year}M${String(month).padStart(2, '0')}`;
        const batters = {};
        const pitchers = {};
        let totalPages = 0;

        // Progress: 0% - start
        this.reportProgress(0, '타자 랭킹 수집 중...');

        // Scrape batters - Scrape until no new players (max 30 pages)
        for (let pg = 1; pg <= 30; pg++) {
            const url = `${this.BASE_URL}?p=chart&searchType=MONTHLY&searchDate=${searchDate}&position=T&page=${pg}`;

            try {
                if (pg > 1) await this.sleep(500); 
                const html = await this.fetchPage(url);
                const players = this.parseTable(html);
                
                const beforeCount = Object.keys(batters).length;
                Object.assign(batters, players);
                const afterCount = Object.keys(batters).length;
                const newCount = afterCount - beforeCount;

                totalPages++;
                this.reportProgress(Math.min(45, (pg / 15) * 45), `타자 ${afterCount}명 수집 (${pg}페이지)...`);

                if (Object.keys(players).length === 0 || (newCount === 0 && pg > 1)) {
                    break;
                }
            } catch (e) {
                console.error(`[Scraper] Batter page ${pg} error:`, e);
                if (pg === 1) throw e; 
                break;
            }
        }

        // Progress: 50%
        this.reportProgress(50, '투수 랭킹 수집 중...');

        // Scrape pitchers - Scrape until no new players (max 20 pages)
        for (let pg = 1; pg <= 20; pg++) {
            const url = `${this.BASE_URL}?p=chart&searchType=MONTHLY&searchDate=${searchDate}&position=1&page=${pg}`;

            try {
                await this.sleep(500);
                const html = await this.fetchPage(url);
                const players = this.parseTable(html);
                
                const beforeCount = Object.keys(pitchers).length;
                Object.assign(pitchers, players);
                const afterCount = Object.keys(pitchers).length;
                const newCount = afterCount - beforeCount;

                this.reportProgress(Math.min(90, 50 + (pg / 10) * 40), `투수 ${afterCount}명 수집 (${pg}페이지)...`);

                if (Object.keys(players).length === 0 || (newCount === 0 && pg > 1)) {
                    break;
                }
            } catch (e) {
                console.error(`[Scraper] Pitcher page ${pg} error:`, e);
                if (pg === 1) throw e;
                break;
            }
        }

        const totalCount = Object.keys(batters).length + Object.keys(pitchers).length;
        console.log(`[Scraper] Total: ${Object.keys(batters).length} batters, ${Object.keys(pitchers).length} pitchers (Total: ${totalCount})`);
        
        // Final sanity check: KBO active rosters total around 350+ players (March may have fewer)
        if (totalCount < 280) {
            throw new Error(`수집된 선수(${totalCount}명)가 너무 적습니다. 업데이트가 거부되었습니다. (최소 280명 필요)`);
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
