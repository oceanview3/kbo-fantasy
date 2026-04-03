"""
웰컴톱랭킹 KBO 선수 점수 스크래퍼
- 서버사이드 렌더링(SSR) 페이지를 requests + BeautifulSoup으로 파싱
- Firebase Firestore REST API로 실시간 업데이트
"""

import json
import sys
import urllib.request
import urllib.parse
from datetime import datetime
from pathlib import Path
from html.parser import HTMLParser

BASE_URL = "https://www.welcometopranking.com/baseball/"
DATA_DIR = Path(__file__).parent.parent / "data"

FIREBASE_PROJECT_ID = "kbo-fantasy-7616b"
FIRESTORE_URL = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/databases/(default)/documents"


class TableParser(HTMLParser):
    """Simple HTML parser to extract table rows"""
    def __init__(self):
        super().__init__()
        self.in_thead = False
        self.in_tbody = False
        self.in_tr = False
        self.in_td = False
        self.in_th = False
        self.current_row = []
        self.current_cell = ""
        self.rows = []
        self.headers = []
        self.found_type01 = False

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == "table" and attrs_dict.get("class") == "type01":
            self.found_type01 = True
        elif tag == "thead":
            self.in_thead = True
        elif tag == "tbody":
            self.in_tbody = True
        elif tag == "tr" and (self.in_tbody or self.in_thead):
            self.in_tr = True
            self.current_row = []
        elif tag == "td" and self.in_tr:
            self.in_td = True
            self.current_cell = ""
        elif tag == "th" and self.in_tr:
            self.in_th = True
            self.current_cell = ""

    def handle_endtag(self, tag):
        if tag == "thead":
            self.in_thead = False
        elif tag == "tbody":
            self.in_tbody = False
        elif tag == "tr" and self.in_tr:
            self.in_tr = False
            if self.in_tbody and self.current_row:
                self.rows.append(self.current_row)
        elif tag == "td" and self.in_td:
            self.in_td = False
            self.current_row.append(self.current_cell.strip())
        elif tag == "th" and self.in_th:
            self.in_th = False
            self.headers.append(self.current_cell.strip().lower())

    def handle_data(self, data):
        if self.in_td or self.in_th:
            self.current_cell += data


def fetch_page(url):
    """Fetch a page with proper headers"""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        "Referer": "https://www.welcometopranking.com/"
    }
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_ranking_table(html):
    """Parse ranking table from HTML"""
    parser = TableParser()
    parser.feed(html)
    
    # is_valid: Check for table class and rank header
    is_valid = parser.found_type01 and ("rank" in parser.headers or "순위" in parser.headers)
    has_rank_1 = False
    
    players = {}
    for row in parser.rows:
        if len(row) < 4:
            continue
        
        # row[0]=순위, row[1]=선수명, row[2]=구단, row[3]=톱랭킹포인트
        try:
            rank_val = row[0].strip()
            if rank_val == "1":
                has_rank_1 = True
            rank = int(rank_val)
        except ValueError:
            continue
        
        name = row[1].strip().split('\n')[0].strip()
        team = row[2].strip()
        
        try:
            score = float(row[3].strip().replace(',', ''))
        except ValueError:
            score = 0.0
        
        if name and rank > 0:
            key = f"{name} ({team})" if team else name
            players[key] = score
            
    return players, is_valid, has_rank_1


def scrape_position(search_date, position):
    """Scrape all pages for a position"""
    pos_name = "타자" if position == "T" else "투수"
    all_players = {}
    
    for pg in range(1, 40):
        url = (f"{BASE_URL}?p=chart&searchType=MONTHLY"
               f"&searchDate={search_date}&position={position}&page={pg}")
        
        try:
            html = fetch_page(url)
            players, is_valid, has_rank_1 = parse_ranking_table(html)
            
            # Structural validation for Page 1
            if pg == 1:
                if not is_valid:
                    print(f"  [{pos_name}] Page 1: Invalid table structure! (Blocked?)")
                    break
                if players and not has_rank_1:
                    print(f"  [{pos_name}] Page 1: Rank 1 is missing!")
                    break
        except Exception as e:
            print(f"  [{pos_name}] Page {pg} error: {e}")
            break
        
        if not players:
            break
        
        # Check for duplicate data (pagination returning same page)
        new_players = {k: v for k, v in players.items() if k not in all_players}
        if not new_players and pg > 1:
            print(f"  [{pos_name}] Page {pg}: duplicate data, stopping")
            break
        
        all_players.update(players)
        print(f"  [{pos_name}] Page {pg}: {len(new_players)} new players")

        # Continue until truly no new players
        if not players:
            break
    
    print(f"  [{pos_name}] Total: {len(all_players)} players")
    return all_players


def scrape_monthly_scores(year=2026, month=3):
    """Scrape all player scores for a given month"""
    search_date = f"Y{year}M{month:02d}"
    print(f"\n{'='*50}")
    print(f"Scraping {year}년 {month}월 월간 랭킹")
    print(f"{'='*50}")

    all_players = {}

    print("\n[타자 랭킹]")
    batters = scrape_position(search_date, "T")

    print("\n[투수 랭킹]")
    pitchers = scrape_position(search_date, "1")

    print(f"\n총 {len(batters) + len(pitchers)}명 점수 수집 완료")
    return {"batters": batters, "pitchers": pitchers}


def save_scores_local(scores, year, month):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    month_key = f"{year}-{month:02d}"
    filename = DATA_DIR / f"scores_{month_key}.json"
    data = {
        "month": month_key,
        "updated_at": datetime.now().isoformat(),
        "player_count": len(scores.get("batters", {})) + len(scores.get("pitchers", {})),
        "players": scores
    }
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\n로컬 저장: {filename}")


def upload_to_firebase(scores, year, month):
    month_key = f"{year}-{month:02d}"
    doc_url = f"{FIRESTORE_URL}/scores/{month_key}"

    # Structure identical to JS Scraper for consistency
    doc = {
        "fields": {
            "players": {
                "mapValue": {
                    "fields": {
                        "batters": {
                            "mapValue": {
                                "fields": {name: {"doubleValue": score} for name, score in scores.get("batters", {}).items()}
                            }
                        },
                        "pitchers": {
                            "mapValue": {
                                "fields": {name: {"doubleValue": score} for name, score in scores.get("pitchers", {}).items()}
                            }
                        }
                    }
                }
            },
            "updated_at": {
                "stringValue": datetime.now().isoformat()
            },
            "player_count": {
                "integerValue": str(len(scores.get("batters", {})) + len(scores.get("pitchers", {})))
            }
        }
    }

    data = json.dumps(doc, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        doc_url, data=data, method="PATCH",
        headers={"Content-Type": "application/json"}
    )

    try:
        with urllib.request.urlopen(req) as resp:
            if resp.status == 200:
                print(f"\nFirebase upload OK! ({month_key}: {len(scores)} players)")
                return True
    except Exception as e:
        print(f"\nFirebase upload error: {e}")
    return False


def main():
    now = datetime.now()
    year = int(sys.argv[1]) if len(sys.argv) > 1 else now.year
    month = int(sys.argv[2]) if len(sys.argv) > 2 else now.month

    scores = scrape_monthly_scores(year, month)

    if scores:
        save_scores_local(scores, year, month)
        upload_to_firebase(scores, year, month)

        print(f"\n{'='*50}")
        print(f"Top 10")
        print(f"{'='*50}")
        
        # Flatten all players for top 10 display
        all_players = {**scores.get("batters", {}), **scores.get("pitchers", {})}
        sorted_players = sorted(all_players.items(), key=lambda x: x[1], reverse=True)
        
        for i, (name, score) in enumerate(sorted_players[:10], 1):
            print(f"  {i:2d}. {name:12s}  {score:8.2f}")
    else:
        print("No scores collected!")
        sys.exit(1)


if __name__ == "__main__":
    main()
