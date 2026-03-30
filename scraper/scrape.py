"""
웰컴톱랭킹 KBO 선수 점수 스크래퍼
- 월간 타자/투수 랭킹을 스크래핑
- Firebase Firestore REST API로 실시간 점수 업데이트
- Playwright로 JavaScript 렌더링 페이지 파싱
"""

import asyncio
import json
import os
import sys
import urllib.request
import urllib.parse
from datetime import datetime
from pathlib import Path

from playwright.async_api import async_playwright

BASE_URL = "https://www.welcometopranking.com/baseball/"
DATA_DIR = Path(__file__).parent.parent / "data"

# Firebase config
FIREBASE_PROJECT_ID = "kbo-fantasy-7616b"
FIRESTORE_URL = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/databases/(default)/documents"


async def scrape_all_players(page, search_date, position_tab="batter"):
    """
    Scrape ALL pages of rankings for a specific tab (batter/pitcher).
    Returns a dict of {player_name: score}
    """
    url = f"{BASE_URL}?p=chart&searchType=MONTHLY&searchDate={search_date}"
    print(f"  Loading: {url}")
    await page.goto(url, wait_until="networkidle", timeout=30000)
    await page.wait_for_timeout(3000)

    # Click pitcher tab if needed
    if position_tab == "pitcher":
        try:
            pitcher_btn = page.locator("a, button, span, div").filter(has_text="투수랭킹")
            if await pitcher_btn.count() > 0:
                await pitcher_btn.first.click()
                await page.wait_for_timeout(2000)
            else:
                # Try alternative selector
                pitcher_btn2 = page.locator("[class*='pitcher'], [data-tab*='pitcher']")
                if await pitcher_btn2.count() > 0:
                    await pitcher_btn2.first.click()
                    await page.wait_for_timeout(2000)
        except Exception as e:
            print(f"  Warning: Could not click pitcher tab: {e}")

    players = {}
    total_rows = 0

    # Scrape all pages
    for pg in range(1, 20):  # Max 20 pages
        if pg > 1:
            # Click page number
            try:
                paging = page.locator(f".paging a, .pagination a, [class*='page'] a")
                found_next = False
                count = await paging.count()
                for idx in range(count):
                    text = (await paging.nth(idx).inner_text()).strip()
                    if text == str(pg):
                        await paging.nth(idx).click()
                        await page.wait_for_timeout(1500)
                        found_next = True
                        break
                if not found_next:
                    break
            except:
                break

        # Extract rows from table
        rows = page.locator("table tbody tr")
        row_count = await rows.count()

        if row_count == 0:
            break

        page_players = 0
        for i in range(row_count):
            row = rows.nth(i)
            cells = row.locator("td")
            cell_count = await cells.count()

            if cell_count < 3:
                continue

            try:
                # The table structure varies - try to extract name and score
                texts = []
                for c in range(min(cell_count, 6)):
                    t = (await cells.nth(c).inner_text()).strip()
                    texts.append(t)

                # Find rank, name, score
                # Common pattern: [rank, name, team, score, ...]
                name = ""
                score = 0.0

                # Try to find name (Korean characters, 2-4 chars)
                for t in texts[1:3]:
                    clean = t.replace('\n', '').strip()
                    if clean and all('\uac00' <= c <= '\ud7a3' or c in 'A-Za-z' for c in clean if c.strip()):
                        name = clean.split('\n')[0].strip()
                        break

                # Try to find score (number with possible decimal and negative)
                for t in texts[2:]:
                    clean = t.replace(',', '').strip()
                    try:
                        score = float(clean)
                        break
                    except:
                        continue

                if name and len(name) >= 2:
                    players[name] = score
                    page_players += 1

            except Exception as e:
                continue

        total_rows += page_players
        print(f"  Page {pg}: {page_players} players")

        if row_count < 15:  # Likely last page
            break

    return players


async def scrape_monthly_scores(year=2026, month=3):
    """Scrape all player scores for a given month"""
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
        batters = await scrape_all_players(page, search_date, "batter")
        all_players.update(batters)
        print(f"  → 타자 {len(batters)}명 수집")

        # Scrape pitchers
        print("\n[투수 랭킹 스크래핑]")
        pitchers = await scrape_all_players(page, search_date, "pitcher")
        all_players.update(pitchers)
        print(f"  → 투수 {len(pitchers)}명 수집")

        await browser.close()

    print(f"\n총 {len(all_players)}명 선수 점수 수집 완료")
    return all_players


def save_scores_local(scores, year, month):
    """Save scores to local JSON file"""
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
    print(f"\n로컬 저장 완료: {filename}")


def upload_to_firebase(scores, year, month):
    """Upload scores to Firebase Firestore via REST API"""
    month_key = f"{year}-{month:02d}"
    doc_url = f"{FIRESTORE_URL}/scores/{month_key}"

    # Build Firestore document fields
    player_fields = {}
    for name, score in scores.items():
        player_fields[name] = {"doubleValue": score}

    doc = {
        "fields": {
            "players": {
                "mapValue": {
                    "fields": player_fields
                }
            },
            "updated_at": {
                "stringValue": datetime.now().isoformat()
            },
            "player_count": {
                "integerValue": str(len(scores))
            }
        }
    }

    # PATCH request to create/update document
    data = json.dumps(doc).encode("utf-8")
    req = urllib.request.Request(
        doc_url,
        data=data,
        method="PATCH",
        headers={"Content-Type": "application/json"}
    )

    try:
        with urllib.request.urlopen(req) as resp:
            if resp.status == 200:
                print(f"\n✅ Firebase 업로드 성공! ({month_key}: {len(scores)}명)")
                return True
            else:
                print(f"\n❌ Firebase 업로드 실패: HTTP {resp.status}")
                return False
    except Exception as e:
        print(f"\n❌ Firebase 업로드 에러: {e}")
        return False


async def main():
    """Main entry point"""
    now = datetime.now()
    year = int(sys.argv[1]) if len(sys.argv) > 1 else now.year
    month = int(sys.argv[2]) if len(sys.argv) > 2 else now.month

    # Scrape
    scores = await scrape_monthly_scores(year, month)

    if scores:
        # Save locally
        save_scores_local(scores, year, month)

        # Upload to Firebase  
        upload_to_firebase(scores, year, month)

        # Print top 10
        print(f"\n{'='*50}")
        print(f"Top 10")
        print(f"{'='*50}")
        sorted_players = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        for i, (name, score) in enumerate(sorted_players[:10], 1):
            print(f"  {i:2d}. {name:12s}  {score:8.2f}")
    else:
        print("No scores collected. Check if the website is accessible.")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
