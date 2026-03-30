"""
웰컴톱랭킹 KBO 선수 점수 스크래퍼
- table tbody tr 에서 순위/선수명/팀/점수 추출
- URL 파라미터: position=T(타자), position=1(투수), curPage=N
- Firebase Firestore REST API로 실시간 업데이트
"""

import asyncio
import json
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

from playwright.async_api import async_playwright

BASE_URL = "https://www.welcometopranking.com/baseball/"
DATA_DIR = Path(__file__).parent.parent / "data"

FIREBASE_PROJECT_ID = "kbo-fantasy-7616b"
FIRESTORE_URL = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/databases/(default)/documents"


async def scrape_position(page, search_date, position):
    """
    Scrape all pages for a position type.
    position: 'T' for batters, '1' for pitchers
    """
    pos_name = "타자" if position == "T" else "투수"
    players = {}

    for pg in range(1, 20):
        url = (f"{BASE_URL}?p=chart&searchType=MONTHLY"
               f"&searchDate={search_date}&position={position}&curPage={pg}")

        await page.goto(url, timeout=30000)
        
        # Wait for table rows to appear (up to 10 seconds)
        try:
            await page.wait_for_selector("table tbody tr td", timeout=10000)
        except:
            if pg == 1:
                print(f"  [{pos_name}] Waiting for data... trying longer wait")
                await page.wait_for_timeout(5000)
                # Check again
                count = await page.locator("table tbody tr").count()
                if count == 0:
                    print(f"  [{pos_name}] Still no data after extended wait")
                    break
        
        await page.wait_for_timeout(1000)

        # Get all table rows
        rows = page.locator("table tbody tr")
        row_count = await rows.count()

        if row_count == 0:
            break

        page_count = 0
        for i in range(row_count):
            try:
                row = rows.nth(i)
                cells = row.locator("td")
                cell_count = await cells.count()

                if cell_count < 4:
                    continue

                # Column order: [순위, 선수명, 구단, 톱랭킹포인트, ...]
                rank_text = (await cells.nth(0).inner_text()).strip()
                name_raw = (await cells.nth(1).inner_text()).strip()
                score_text = (await cells.nth(3).inner_text()).strip()

                # Clean name (get first line only)
                name = name_raw.split('\n')[0].strip()

                # Parse rank
                try:
                    rank = int(rank_text)
                except ValueError:
                    continue

                # Parse score
                try:
                    score = float(score_text.replace(',', ''))
                except ValueError:
                    score = 0.0

                if name and rank > 0:
                    players[name] = score
                    page_count += 1

            except Exception:
                continue

        print(f"  [{pos_name}] Page {pg}: {page_count} players")

        if row_count < 20:
            break

    print(f"  [{pos_name}] Total: {len(players)} players")
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

        print("\n[타자 랭킹]")
        batters = await scrape_position(page, search_date, "T")
        all_players.update(batters)

        print("\n[투수 랭킹]")
        pitchers = await scrape_position(page, search_date, "1")
        all_players.update(pitchers)

        await browser.close()

    print(f"\n총 {len(all_players)}명 점수 수집 완료")
    return all_players


def save_scores_local(scores, year, month):
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
    print(f"\n로컬 저장: {filename}")


def upload_to_firebase(scores, year, month):
    month_key = f"{year}-{month:02d}"
    doc_url = f"{FIRESTORE_URL}/scores/{month_key}"

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

    data = json.dumps(doc).encode("utf-8")
    req = urllib.request.Request(
        doc_url, data=data, method="PATCH",
        headers={"Content-Type": "application/json"}
    )

    try:
        with urllib.request.urlopen(req) as resp:
            if resp.status == 200:
                print(f"\n✅ Firebase 업로드 성공! ({month_key}: {len(scores)}명)")
                return True
    except Exception as e:
        print(f"\n❌ Firebase 업로드 에러: {e}")
    return False


async def main():
    now = datetime.now()
    year = int(sys.argv[1]) if len(sys.argv) > 1 else now.year
    month = int(sys.argv[2]) if len(sys.argv) > 2 else now.month

    scores = await scrape_monthly_scores(year, month)

    if scores:
        save_scores_local(scores, year, month)
        upload_to_firebase(scores, year, month)

        print(f"\n{'='*50}")
        print(f"Top 10")
        print(f"{'='*50}")
        sorted_players = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        for i, (name, score) in enumerate(sorted_players[:10], 1):
            print(f"  {i:2d}. {name:12s}  {score:8.2f}")
    else:
        print("No scores collected!")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
