#!/usr/bin/env python3
"""발행 전 게이트 자동 검사. 사용법:
  python3 check-gate.py AI_CASE_STUDY.md --keyword "챗GPT" --keyword-en "ChatGPT" --author "닉네임"
  (Windows는 python3 대신 python)

자동으로 볼 수 있는 항목만 검사한다. 나머지(온토픽, 막힌 지점, 재현 순서, 숫자 출처)는 사람이 본다.
[막힘]은 고쳐야 넘기고 [주의]는 알려만 준다. 종료 코드 0 = 통과, 1 = 막힘.
"""
import re, sys, argparse, os

# 남이 못 여는 주소: 로컬·포트·토큰·로그인 전용
BLOCK = [
    r"localhost", r"127\.0\.0\.1", r"https?://[^/\s]+:\d{2,5}", r"[?&](token|key|api_key|access_token)=",
    r"ai-study\.gpters\.org", r"ai-toolkit\.gpters\.org", r"[a-z0-9-]+\.slack\.com", r"https?://admin\.", r"/admin(/|\b)",
]
# 공개 설정이면 괜찮은 주소: 알려만 준다
CHECK_PUBLIC = [r"notion\.(so|site)", r"airtable\.com", r"docs\.google\.com", r"drive\.google\.com"]
# 수백 편이 똑같이 달면 틀 흔적이 되는 소제목
FIXED_H2 = [r"한\s*줄\s*요약", r"이런 분들?께", r"바쁘시면", r"문제\s*상황", r"사용한 도구", r"작업\s*과정", r"AI 활용 팁", r"앞으로의 계획", r"다른 업무에 적용", r"재사용 가능한 프롬프트", r"^결과(\s*\(After\))?$"]
LOCALPATH = r"(/Users/[A-Za-z0-9._-]+|/home/[A-Za-z0-9._-]+|C:\\\\Users\\\\[A-Za-z0-9._-]+)"

def main():
    try: sys.stdout.reconfigure(encoding="utf-8")  # Windows 콘솔 한글 깨짐 방지
    except Exception: pass
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("--keyword", default=""); ap.add_argument("--keyword-en", default="")
    ap.add_argument("--author", default=""); ap.add_argument("--images", default="")
    a = ap.parse_args()
    raw = open(a.src, encoding="utf-8").read()
    body = raw.split("---", 2)[2] if raw.startswith("---") else raw
    title = ""
    m = re.search(r"^#\s+(.+)$", body, flags=re.M)
    if m: title = m.group(1).strip()
    fails = []
    def check(label, ok, detail):
        print(f"[{'OK ' if ok else '막힘'}] {label}: {detail}")
        if not ok: fails.append(label)
    def warn(label, ok, detail):
        print(f"[{'OK ' if ok else '주의'}] {label}: {detail}")

    # 1 제목: 키워드가 제목 앞쪽에 있는가, 숫자가 있는가
    if a.keyword:
        pos = title.find(a.keyword)
        check("제목에 검색어", 0 <= pos <= 20, f"'{a.keyword}' 위치 {pos} (앞 20자 안)")
    check("제목에 숫자", bool(re.search(r"\d", title)), title[:60])
    check("제목에 발표자·행사·시리즈 표기 없음", not re.search(r"^\[[^\]]*\]|\([^)]*님[^)]*\)|\(\d+부\)|#\d+|\d+기\s", title), title[:60])
    check("제목 50자 이내", len(title) <= 50, f"{len(title)}자")
    h2s = [h.strip() for h in re.findall(r"^##\s+(.+)$", body, flags=re.M)]
    fixed = [h for h in h2s if any(re.search(f, re.sub(r"^[^\w가-힣]+", "", h)) for f in FIXED_H2)]
    check("틀 소제목 없음(내용으로 쓴 H2)", not fixed, f"{fixed[:3]}")
    # 2 첫 150자
    text = re.sub(r"^#.*$", "", body, flags=re.M)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    lead = re.sub(r"\s+", " ", text).strip()[:150]
    check("첫 150자에 숫자", bool(re.search(r"\d", lead)), lead[:80])
    if a.keyword:
        check("첫 150자에 검색어", a.keyword in lead, "메타 설명 구간")
    if a.keyword_en:
        check("한영 병기(영문 표기 존재)", a.keyword_en.lower() in body.lower(), a.keyword_en)
    # 3 확인일
    check("확인일·발행일이 본문 안에", bool(re.search(r"20\d\d년\s*\d{1,2}월\s*\d{1,2}일|20\d\d[.-]\d{1,2}[.-]\d{1,2}", body)), "'2026년 9월 23일 기준' 같은 절대 날짜")
    # 4 작성자 신호: 이름이 있고, 앞 200자 안에는 없어야
    if a.author:
        check("작성자 신호 있음", a.author in body, a.author)
        check("작성자 신호가 첫 150자 밖", a.author not in lead, "첫 H2 뒤나 하단")
    # 5 이미지
    imgs = re.findall(r"!\[([^\]]*)\]\(([^)]+)\)", body) + re.findall(r'<img[^>]*alt="([^"]*)"[^>]*src="([^"]+)"', body)
    warn("이미지 3장 이상", len(imgs) >= 3, f"{len(imgs)}장 (없어도 발행은 됨, 실제 화면 1장이면 신뢰가 크게 오른다)")
    bad_alt = [alt for alt, _ in imgs if not alt.strip() or re.fullmatch(r"(스크린샷|캡처|이미지|screenshot|image)\s*\d*", alt.strip(), flags=re.I)]
    check("이미지 alt에 핵심 정보", not bad_alt, f"빈 alt·'스크린샷'만 쓴 alt {len(bad_alt)}개")
    # 6 헤지·줄표
    hedge = re.findall(r"일 수도|인 것 같|듯합니다|듯해요", body)
    check("헤지 0", not hedge, f"{len(hedge)}건")
    check("줄표 0", body.count("—") + body.count("–") == 0, f"em {body.count('—')} / en {body.count('–')}")
    # 7 내부 링크·경로
    hits = [b for b in BLOCK if re.search(b, body)]
    check("남이 못 여는 링크 0", not hits, f"걸린 패턴 {len(hits)}개: {hits[:4]}")
    pub = [b for b in CHECK_PUBLIC if re.search(b, body)]
    warn("노션·구글 문서 링크 공개 설정", not pub, f"{len(pub)}종 있음, 공개로 열리는지 확인" if pub else "없음")
    paths = re.findall(LOCALPATH, body)
    check("사용자 이름 든 절대 경로 0", not paths, f"{paths[:3]}")
    # 8 베터모드 형식
    tables = [ln for ln in body.splitlines() if ln.strip().startswith("|") and ln.count("|") >= 4]
    check("3열 이상 표 없음(목록으로)", not tables, f"표 줄 {len(tables)}개")
    tilde = re.findall(r"\d\s*~\s*\d", body)
    check("숫자 범위에 물결표 없음", not tilde, f"{tilde[:3]} (말로: 2주에서 4주)")
    bold_bad = re.findall(r"\*\*[\"'`(\[]|[\"'`)\]%원달러]\*\*(?=[가-힣])", body)
    check("볼드 경계에 문장부호·기호 없음", not bold_bad, f"{len(bold_bad)}건")
    h1 = re.findall(r"^#\s", body, flags=re.M)
    check("H1은 하나", len(h1) <= 1, f"{len(h1)}개")
    # 9 모바일 가독성
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip() and not p.strip().startswith(("#", "-", "*", ">", "|", "```", "!", "<"))]
    long_p = [p for p in paras if len(p) > 260]
    check("260자 넘는 문단 없음", not long_p, f"{len(long_p)}개 (첫 문단 {len(long_p[0]) if long_p else 0}자)")
    h2_pos = [m.start() for m in re.finditer(r"^##\s", body, flags=re.M)] + [len(body)]
    gaps = [h2_pos[i + 1] - h2_pos[i] for i in range(len(h2_pos) - 1)] if len(h2_pos) > 1 else []
    check("H2 사이 900자 이하", all(g <= 900 for g in gaps) if gaps else False, f"H2 {len(h2_pos) - 1}개, 가장 긴 구간 {max(gaps) if gaps else 0}자")
    code_long = [m for m in re.findall(r"```[^\n]*\n(.*?)```", body, flags=re.S) if m.count("\n") > 5]
    check("코드블록 5줄 이하", not code_long, f"긴 코드블록 {len(code_long)}개")
    # 10 이미지 픽셀 크기: 첫 이미지(히어로)는 가로형 허용, 나머지 본문 이미지는 가로/세로 1.6배 이하
    import struct
    base = os.path.dirname(os.path.abspath(a.src))
    wide = []
    for i, (alt, src) in enumerate(imgs):
        pth = src if os.path.isabs(src) else os.path.join(base, src)
        try:
            with open(pth, "rb") as fh:
                head = fh.read(24)
            if head[:8] == b"\x89PNG\r\n\x1a\n":
                wpx, hpx = struct.unpack(">II", head[16:24])
                if i > 0 and wpx > hpx * 1.6:
                    wide.append(f"{os.path.basename(src)} {wpx}x{hpx}")
        except OSError:
            pass
    warn("카드·도식이 폰에서 읽히는 비율(가로≤세로×1.6, 첫 이미지 제외)", not wide, f"넓은 이미지 {len(wide)}개 {wide[:2]} (캡처라면 괜찮다)")
    print()
    if fails:
        print(f"막힌 항목 {len(fails)}개: " + ", ".join(fails)); sys.exit(1)
    print("자동 게이트 통과. 사람이 볼 것: 온토픽, 막힌 지점 1개, 재현 프롬프트/순서, 숫자마다 출처, 이미지 속 경로·개인정보.")
    sys.exit(0)

if __name__ == "__main__":
    main()
