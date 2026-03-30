"""Find the movePage function and test page parameter"""
import urllib.request
import re

url = "https://www.welcometopranking.com/baseball/?p=chart&searchType=MONTHLY&searchDate=Y2026M03&position=T"
headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
req = urllib.request.Request(url, headers=headers)
html = urllib.request.urlopen(req).read().decode("utf-8", errors="replace")

# Find movePage function definition
movepage_funcs = re.findall(r'function\s+movePage[^}]+}', html, re.DOTALL)
print(f"movePage functions: {len(movepage_funcs)}")
for f in movepage_funcs:
    print(f"  {f[:300]}")

# Search for movePage in all script blocks
scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
for i, s in enumerate(scripts):
    if 'movePage' in s:
        print(f"\nScript block {i} contains movePage:")
        # Get context around movePage
        idx = s.find('movePage')
        start = max(0, idx - 200)
        end = min(len(s), idx + 500)
        print(f"  ...{s[start:end]}...")

# Check form elements
forms = re.findall(r'<form[^>]*>.*?</form>', html, re.DOTALL | re.IGNORECASE)
print(f"\nForms: {len(forms)}")
for f in forms:
    if 'page' in f.lower():
        print(f"  Form with page: {f[:500]}")

# Check for hidden inputs with page
hidden_inputs = re.findall(r'<input[^>]*name="[^"]*page[^"]*"[^>]*>', html, re.IGNORECASE)
print(f"\nHidden inputs with page: {len(hidden_inputs)}")
for h in hidden_inputs:
    print(f"  {h}")

# Try different page parameters
for param_name in ['page', 'curPage', 'pageNo', 'currentPage', 'nowPage']:
    test_url = f"https://www.welcometopranking.com/baseball/?p=chart&searchType=MONTHLY&searchDate=Y2026M03&position=T&{param_name}=2"
    req2 = urllib.request.Request(test_url, headers=headers)
    html2 = urllib.request.urlopen(req2).read().decode("utf-8", errors="replace")
    
    # Check if page 1 is still active
    if '<strong>1</strong>' in html2 and 'movePage(2)' in html2:
        status = "SAME (page 1)"
    elif '<strong>2</strong>' in html2:
        status = "PAGE 2! (FOUND IT)"
    else:
        status = "UNKNOWN"
    
    print(f"\n{param_name}=2 -> {status}")
