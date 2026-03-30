"""
웰컴톱랭킹 KBO 선수 점수 스크래퍼
- 월간 타자/투수 랭킹을 스크래핑하여 JSON으로 저장
- Playwright를 사용하여 JavaScript 렌더링된 페이지를 파싱
"""

import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path

from playwright.async_api import async_playwright

BASE_URL = "https://www.welcometopranking.com/baseball/"
DATA_DIR = Path(__file__).parent.parent / "data"


async def scrape_ranking_page(page, search_type="MONTHLY", search_date=None, 
                                position_tab="batter", page_num=1):
    """
    Scrape a single page of rankings from welcometopranking.com
    
    Args:
        page: Playwright page object
        search_type: DAILY, WEEKLY, MONTHLY, SEASON
        search_date: e.g. "Y2026M03" for monthly
        position_tab: "batter" or "pitcher"
        page_num: pagination page number
    """
    # Build URL
    url = f"{BASE_URL}?p=chart&searchType={search_type}"
    if search_date:
        url += f"&searchDate={search_date}"
    
    print(f"  Loading: {url}")
    await page.goto(url, wait_until="networkidle", timeout=30000)
    await page.wait_for_timeout(2000)
    
    # Click pitcher tab if needed
    if position_tab == "pitcher":
        pitcher_tab = page.locator("text=투수랭킹")
        if await pitcher_tab.count() > 0:
            await pitcher_tab.click()
            await page.wait_for_timeout(2000)
    
    players = []
    
    # Scrape all pages
    for pg in range(1, 9):  # Max 8 pages
        if pg > 1:
            # Click page number
            paging = page.locator(f".paging a:has-text('{pg}')")
            if await paging.count() > 0:
                await paging.click()
                await page.wait_for_timeout(1500)
            else:
                break
        
        # Extract table data
        rows = page.locator(".ranking_table tbody tr, table.chart_table tbody tr, .chart_wrap table tbody tr")
        row_count = await rows.count()
        
        if row_count == 0:
            # Try alternative selector
            rows = page.locator("table tbody tr")
            row_count = await rows.count()
        
        print(f"  Page {pg}: {row_count} rows found")
        
        for i in range(row_count):
            row = rows.nth(i)
            cells = row.locator("td")
            cell_count = await cells.count()
            
            if cell_count < 4:
                continue
            
            try:
                # Extract rank, name, team, score
                rank_text = (await cells.nth(0).inner_text()).strip()
                name = (await cells.nth(1).inner_text()).strip()
                team = (await cells.nth(2).inner_text()).strip()
                score_text = (await cells.nth(3).inner_text()).strip()
                
                # Clean up
                rank = int(rank_text) if rank_text.isdigit() else 0
                score = float(score_text) if score_text.replace('.', '').replace('-', '').isdigit() else 0
                
                if name and rank > 0:
                    players.append({
                        "rank": rank,
                        "name": name,
                        "team": team,
                        "score": score,
                        "type": position_tab
                    })
            except Exception as e:
                continue
        
        if row_count < 20:  # Less than full page, no more pages
            break
    
    return players


async def scrape_monthly_scores(year=2026, month=3):
    """
    Scrape all player scores for a given month
    """
    search_date = f"Y{year}M{month:02d}"
    print(f"\n{'='*50}")
    print(f"Scraping {year}년 {month}월 월간 랭킹")
    print(f"{'='*50}")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            locale="ko-KR"
        )
        page = await context.new_page()
        
        all_players = {}
        
        # Scrape batters
        print("\n[타자 랭킹 스크래핑]")
        batters = await scrape_ranking_page(
            page, "MONTHLY", search_date, "batter"
        )
        for p_data in batters:
            all_players[p_data["name"]] = p_data["score"]
        print(f"  타자 {len(batters)}명 수집 완료")
        
        # Scrape pitchers
        print("\n[투수 랭킹 스크래핑]")
        pitchers = await scrape_ranking_page(
            page, "MONTHLY", search_date, "pitcher"
        )
        for p_data in pitchers:
            all_players[p_data["name"]] = p_data["score"]
        print(f"  투수 {len(pitchers)}명 수집 완료")
        
        await browser.close()
    
    print(f"\n총 {len(all_players)}명 선수 점수 수집 완료")
    return all_players


def save_scores(scores, year, month):
    """Save scores to JSON file"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    month_key = f"{year}-{month:02d}"
    filename = DATA_DIR / f"scores_{month_key}.json"
    
    data = {
        "month": month_key,
        "updated_at": datetime.now().isoformat(),
        "player_count": len(scores),
        "players": scores
    }
    
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"\n저장 완료: {filename}")
    return filename


def update_all_scores_json():
    """Combine all monthly score files into one all_scores.json"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    all_scores = {}
    for f in sorted(DATA_DIR.glob("scores_*.json")):
        if f.name == "all_scores.json":
            continue
        with open(f, "r", encoding="utf-8") as fp:
            data = json.load(fp)
            all_scores[data["month"]] = data["players"]
    
    output = DATA_DIR / "all_scores.json"
    with open(output, "w", encoding="utf-8") as f:
        json.dump(all_scores, f, ensure_ascii=False, indent=2)
    
    print(f"통합 점수 파일 업데이트: {output}")


async def main():
    """Main entry point"""
    # Parse arguments
    now = datetime.now()
    year = int(sys.argv[1]) if len(sys.argv) > 1 else now.year
    month = int(sys.argv[2]) if len(sys.argv) > 2 else now.month
    
    # Scrape
    scores = await scrape_monthly_scores(year, month)
    
    if scores:
        # Save
        save_scores(scores, year, month)
        update_all_scores_json()
        
        # Print top 10
        print(f"\n{'='*50}")
        print(f"Top 10 (소계)")
        print(f"{'='*50}")
        sorted_players = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        for i, (name, score) in enumerate(sorted_players[:10], 1):
            print(f"  {i:2d}. {name:12s}  {score:8.2f}")
    else:
        print("No scores collected. Check if the website is accessible.")


if __name__ == "__main__":
    asyncio.run(main())
