"""抓取 Amazon JP 分類 Best Sellers，產出 ec-insight 榜單快照 JSON。

解析策略（Amazon 會出不同版型）：
1. 首選：data-client-recs-list 內嵌 JSON（ASIN＋名次），標題從 /dp/{ASIN} 附近的 img alt 配對
2. 備援：p13n-sc-truncate 標題依序取（舊版型）
"""
import json, re, html, time, urllib.request, datetime

CATEGORIES = {
    "美妝": "beauty",
    "保健": "hpc",
    "居家": "kitchen",
    "3C": "electronics",
    "母嬰": "baby",
    "運動戶外": "sports",
    "食品飲料": "food-beverage",
    "服飾": "fashion",
}
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
LIMIT = 20

def fetch(slug):
    url = f"https://www.amazon.co.jp/gp/bestsellers/{slug}/"
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ja,en;q=0.8"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="ignore")

def parse_recs_json(text):
    m = re.search(r'data-client-recs-list="([^"]+)"', text)
    if not m:
        return []
    data = json.loads(html.unescape(m.group(1)))
    items = []
    for d in data:
        asin = d.get("id", "")
        rank = int(d.get("metadataMap", {}).get("render.zg.rank", 0) or 0)
        i = text.find("/dp/" + asin)
        if i == -1:
            continue
        mm = re.search(r'alt="([^"]{5,300})"', text[i:i + 3000])
        if not mm:
            continue
        items.append({
            "rank": rank,
            "title": html.unescape(mm.group(1)).strip(),
            "url": f"https://www.amazon.co.jp/dp/{asin}",
            "price": None,
        })
        if len(items) >= LIMIT:
            break
    return items

def parse_legacy(text):
    titles = [html.unescape(t.strip()) for t in re.findall(
        r'class="p13n-sc-truncate[^"]*"[^>]*>\s*([^<]{5,200})', text)]
    return [{"rank": i + 1, "title": t, "url": None, "price": None}
            for i, t in enumerate(titles[:LIMIT])]

def main():
    today = datetime.date.today().isoformat()
    out = {"date": today, "source": "amazon-jp", "categories": []}
    for name, slug in CATEGORIES.items():
        try:
            text = fetch(slug)
            items = parse_recs_json(text) or parse_legacy(text)
            status = f"{len(items)} items"
        except Exception as e:
            items, status = [], f"FAILED: {e}"
        out["categories"].append({"category": name, "slug": slug, "items": items})
        print(f"{name}({slug}): {status}")
        time.sleep(2)
    path = f"/Users/abelxchu/Developer/ec-insight/docs/data/rankings/amazon-jp-{today}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("寫入", path)

if __name__ == "__main__":
    main()
