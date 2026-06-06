// ============================================
// Scraper Layer - Browser-side scraping with CORS Proxy
// ============================================

const Scraper = {
    BASE_URL: "https://www.welcometopranking.com/baseball/",
    
    // 프록시 목록 (개인용 Google Apps Script 프록시 우선)
    PROXIES: [
        "https://script.google.com/macros/s/AKfycbwuWoHDtYdGjoKcFI154Qzs4xsTVdgvUnlZoFTCQ4sqrfpEhpv19Px4snfQVo4mzJleRQ/exec?url=",
        "https://api.allorigins.win/raw?url=",
        "https://corsproxy.io/?",
        "https://api.codetabs.com/v1/proxy?quest=",
        "https://thingproxy.freeboard.io/fetch/",
        "https://cors-anywhere.herokuapp.com/"
    ],

    onProgress: null,

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * CloudFlare 차단 페이지 등 비정상 응답인지 검사
     */
    isBlockedResponse(html) {
        if (!html || html.length < 200) return true;
        
        const blockedSignals = [
            'cf-browser-verification',
            'cf_chl_opt',
            'challenge-platform',
            'Just a moment',
            'Checking your browser',
            'Enable JavaScript and cookies',
            'Attention Required',
            'Access denied',
            'Error 1005',
            'Error 1006',
            'Error 1015',
            '<title>403',
            '<title>503',
        ];
        
        const htmlLower = html.toLowerCase();
        return blockedSignals.some(signal => htmlLower.includes(signal.toLowerCase()));
    },

    /**
     * 응답 HTML에 실제 랭킹 테이블이 있는지 빠르게 확인
     */
    hasRankingTable(html) {
        return html.includes('type01') && 
               (html.includes('<tbody') || html.includes('<TBODY')) &&
               (html.includes('<td') || html.includes('<TD'));
    },

    async fetchPage(url) {
        let lastError = null;
        
        for (let i = 0; i < this.PROXIES.length; i++) {
            const proxy = this.PROXIES[i];
            try {
                const proxyUrl = proxy + encodeURIComponent(url);
                const resp = await fetch(proxyUrl, {
                    signal: AbortSignal.timeout(12000) // 12초 타임아웃
                });
                
                if (!resp.ok) {
                    lastError = new Error(`HTTP ${resp.status} from proxy ${i+1}`);
                    continue;
                }

                const html = await resp.text();
                
                // 차단된 응답인지 확인
                if (this.isBlockedResponse(html)) {
                    console.warn(`[Scraper] Proxy ${i+1} returned blocked/empty response, trying next...`);
                    lastError = new Error(`Proxy ${i+1} blocked`);
                    continue;
                }
                
                // 랭킹 테이블이 있는 정상 응답인지 확인
                if (!this.hasRankingTable(html)) {
                    console.warn(`[Scraper] Proxy ${i+1} response has no ranking table, trying next...`);
                    lastError = new Error(`Proxy ${i+1} no table`);
                    continue;
                }
                
                return html;
            } catch (e) {
                console.warn(`[Scraper] Proxy ${i+1} failed:`, e.message);
                lastError = e;
            }
        }
        
        throw new Error(`모든 프록시 서버가 실패했습니다. 잠시 후 다시 시도해주세요.\n(${lastError?.message || 'Unknown error'})`);
    },

    parseTable(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // 테이블 구조 검증
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

                const nameText = cells[1].textContent.trim().split('\n')[0].trim();
                const teamText = cells[2].textContent.trim();
                
                const name = nameText.split('(')[0].trim();
                const team = teamText || (nameText.includes('(') ? nameText.match(/\((.*?)\)/)?.[1] : '');
                
                const scoreText = cells[3].textContent.trim().replace(',', '');
                const score = parseFloat(scoreText);

                if (name && name.length >= 2 && !isNaN(score)) {
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
        const chunkSize = 15; // 5에서 15로 늘려 동시 수집량 증가

        for (let i = 1; i <= maxPages; i += chunkSize) {
            const promises = [];
            for (let j = 0; j < chunkSize && (i + j) <= maxPages; j++) {
                const pg = i + j;
                const url = `${this.BASE_URL}?p=chart&searchType=MONTHLY&searchDate=${searchDate}&position=${position}&page=${pg}`;
                promises.push(this.fetchPage(url).then(html => ({ pg, html })).catch(e => {
                    console.error(`[Scraper] ${label} page ${pg} error:`, e.message);
                    return { pg, error: e };
                }));
            }

            const results = await Promise.all(promises);
            let noMoreData = false;

            results.sort((a, b) => a.pg - b.pg);

            for (const res of results) {
                if (res.error) {
                    // 1페이지 에러는 치명적 → throw
                    if (res.pg === 1) throw res.error;
                    // 그 외 페이지는 건너뛰기
                    console.warn(`[Scraper] ${label} page ${res.pg} skipped due to error`);
                    continue;
                }

                const { players, isStructureValid, hasRank1 } = this.parseTable(res.html);

                if (res.pg === 1) {
                    // 1페이지에서 구조 검증
                    if (!isStructureValid) {
                        throw new Error(`${label} 랭킹 테이블을 찾을 수 없습니다. 사이트가 변경되었을 수 있습니다.`);
                    }
                    if (Object.keys(players).length > 0 && !hasRank1) {
                        // Rank 1이 없지만 데이터는 있는 경우 → 경고만 하고 계속 진행
                        console.warn(`[Scraper] ${label}: Rank 1 missing on page 1, but data exists. Continuing...`);
                    }
                    if (Object.keys(players).length === 0) {
                        throw new Error(`${label} 데이터가 비어 있습니다. 해당 월의 데이터가 아직 없을 수 있습니다.`);
                    }
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
            throw new Error(`수집된 선수가 한 명도 없습니다. 프록시 서버 문제일 수 있으니 잠시 후 다시 시도해주세요.`);
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
