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
IPV4 = r"(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.])"
# 베스트 사례 185편 중 39편에 남아 있던 초안 찌꺼기
RESIDUE = [r"\(내용 입력\)", r"Tip:\s*사용한 프롬프트", r"이미지 삽입 위치", r"\[이미지\s*\d", r"🖼️\s*\[", r"📸\s*(?:\[|여기)", r"\(캡처\s*\d", r"\[화면\s*\d\]",
           r"본인이 채워", r"넣으면 좋아요", r"여기 링크\]", r"게시판에 올리는 방법", r"업로드 안내", r"추천 이미지", r"알려주세요\.?\s*$",
           r"시행착오를 겪었나요", r"도움이 필요한 부분이 있나요"]
# 공개 설정이면 괜찮은 주소: 알려만 준다
CHECK_PUBLIC = [r"notion\.(so|site)", r"airtable\.com", r"docs\.google\.com", r"drive\.google\.com"]
# 수백 편이 똑같이 달면 틀 흔적이 되는 소제목. 이름만 달랑 있을 때만 막는다("소개: 가계부를 왜" 는 통과)
FIXED_H2 = [r"한\s*줄\s*요약", r"이런 분들?께 도움(돼요|이 돼요)?", r"바쁘시면.*", r"문제\s*상황(\s*\(?Before\)?)?", r"사용한 도구", r"작업\s*과정",
            r"(이 과정에서 배운 )?AI 활용 팁!?", r"앞으로의 계획", r"다른 업무에 적용한다면\??", r"재사용 가능한 프롬프트", r"결과(\s*\(?After\)?)?", r"결과물",
            r"소개", r"진행\s*방법", r"결과와 배운 점", r"배운 점", r"마무리", r"Before vs After"]
LOCALPATH = r"(/Users/[A-Za-z0-9._-]+|/home/[A-Za-z0-9._-]+|[A-Za-z]:\\Users\\[^\\\s]+)"

def main():
    try: sys.stdout.reconfigure(encoding="utf-8")  # Windows 콘솔 한글 깨짐 방지
    except Exception: pass
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("--keyword", default=""); ap.add_argument("--keyword-en", default="")
    ap.add_argument("--author", default=""); ap.add_argument("--images", default="")
    a = ap.parse_args()
    raw = open(a.src, encoding="utf-8").read()
    parts = raw.split("---", 2)
    body = parts[2] if raw.startswith("---") and len(parts) == 3 else raw
    prose_nocode = re.sub(r"```.*?```", "", body, flags=re.S)  # 코드블록(요청 원문·명령)은 제목·찌꺼기 검사에서 뺀다
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
    if not a.keyword:
        print("[주의] 도구 이름을 못 받아서 제목·첫 문단의 검색어 점검은 건너뛰었어요")
    if a.keyword:
        pos = title.find(a.keyword)
        check("제목에 검색어", 0 <= pos <= 20, f"'{a.keyword}' 위치 {pos} (앞 20자 안)")
    warn("제목 길이", 25 <= len(title) <= 45, f"{len(title)}자예요. 검색에 잘 걸리는 제목은 30자 안팎이에요")
    warn("제목 표현", not re.search(r"써보기|써봤|해봤|해보기|후기|미니사례|청강|도전기", title), "'후기·써보기' 같은 말은 검색 상위 글에 드물어요. 경험은 본문의 숫자와 캡처로 보여 주는 게 나아요")
    warn("제목 표현", not re.search(r"20\d\d|완벽 가이드|완벽 정리", title), "연도나 '완벽 가이드' 같은 말은 검색 상위 글에 드물어요")
    check("제목에 기수·시리즈 표기 없음", not re.search(r"\[[^\]]*\d+기[^\]]*\]|\(\d+부\)|#\d+", title), title[:60])
    check("제목 50자 이내", len(title) <= 50, f"{len(title)}자")
    h2s = [h.strip() for h in re.findall(r"^##\s+(.+)$", body, flags=re.M)]
    def bare(h):
        h = re.sub(r"^[^\w가-힣]+|[^\w가-힣)!?]+$", "", h)      # 앞 이모지·번호 기호, 끝 기호 제거
        h = re.sub(r"^\d+[.)]?\s*", "", h).strip()
        return any(re.fullmatch(f, h, flags=re.I) for f in FIXED_H2)
    fixed = [h for h in h2s if bare(h)]
    check("틀 이름만 단 소제목 없음(\"소개: 내용\"처럼 쓰기)", not fixed, f"{fixed[:3]}")
    warn("제목 표현", not re.search(r"\d+\s*주차|과제|사례글", title), "주차·과제 표기는 제목 대신 본문 첫 소제목 아래에 두면 검색에 나아요")
    # 2 첫 150자
    text = re.sub(r"^#.*$", "", body, flags=re.M)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    lead = re.sub(r"\s+", " ", text).strip()[:150]
    check("첫 150자에 숫자", bool(re.search(r"\d", lead)), lead[:80])
    first = re.split(r"(?<=[.!?요다])\s", lead, maxsplit=1)[0]
    if a.keyword:
        warn("첫 문장", a.keyword in first, "첫 문장에 도구 이름이 있으면 검색에 더 잘 걸려요")
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
    warn("이미지", len(imgs) >= 3, f"{len(imgs)}장이에요. 없어도 되는데, 있는 게 더 실감나고 좋겠죠?")
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
    warn("링크 공개 여부", not pub, f"노션·구글 문서 링크가 {len(pub)}개 있어요. 로그인 없이 열리는지 한 번 확인해 주세요" if pub else "없음")
    ips = re.findall(IPV4, body)
    check("서버 IP 0", not ips, f"{ips[:3]}")
    res = [m.group(0) for r in RESIDUE for m in [re.search(r, prose_nocode, flags=re.M)] if m]
    check("초안 찌꺼기 0(자리표시·양식 안내문·발행 메모)", not res, f"{res[:4]}")
    paths = re.findall(LOCALPATH, body)
    check("사용자 이름 든 절대 경로 0", not paths, f"{paths[:3]}")
    # 8 베터모드 형식
    tables = [ln for ln in body.splitlines() if ln.strip().startswith("|") and ln.count("|") >= 4]
    check("3열 이상 표 없음(목록으로)", not tables, f"표 줄 {len(tables)}개")
    tilde = re.findall(r"\d\s*~\s*\d", body)
    check("숫자 범위에 물결표 없음", not tilde, f"{tilde[:3]} (말로: 2주에서 4주)")
    bold_bad = re.findall(r"\*\*[\"'`(\[]|[\"'`)\]%원달러]\*\*(?=[가-힣])", body)
    check("볼드 경계에 문장부호·기호 없음", not bold_bad, f"{len(bold_bad)}건")
    h1 = re.findall(r"^#\s", prose_nocode, flags=re.M)
    check("H1은 하나", len(h1) <= 1, f"{len(h1)}개")
    # 8-1 분량·소제목 (구글 상위 300페이지: 2,000자 미만 개인 글은 1~3위 없음, 중앙값 4,100자, H2 5~7개)
    prose = re.sub(r"```.*?```", "", body, flags=re.S); prose = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", prose); prose = re.sub(r"^#.*$", "", prose, flags=re.M)
    nchar = len(re.sub(r"\s", "", prose))
    warn("글 길이", nchar >= 2000, f"{nchar:,}자예요. 2,000자 밑이면 검색에 거의 안 잡혀요. 기록에 더 있으면 채우고, 없으면 이대로 내도 돼요")
    warn("글 길이 목표", nchar >= 2500, f"{nchar:,}자예요. 3,000자쯤이면 검색에 더 유리해요. 기록에 더 있으면 채워요")
    h2s = re.findall(r"^##\s+(.+)$", body, flags=re.M)
    warn("소제목 수", 5 <= len(h2s) <= 7, f"{len(h2s)}개예요. 5~7개가 읽기 좋아요")
    if a.keyword:
        kw_h2 = [h for h in h2s if a.keyword in h or (a.keyword_en and a.keyword_en.lower() in h.lower())]
        warn("소제목에 도구 이름", len(kw_h2) >= 2, f"도구 이름이 든 소제목이 {len(kw_h2)}개예요. 두 개쯤 있으면 검색에 좋아요")
    # 9 모바일 가독성
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip() and not p.strip().startswith(("#", "-", "*", ">", "|", "```", "!", "<")) and not re.match(r"\d+[.)]\s", p.strip())]
    long_p = [p for p in paras if len(p) > 260]
    check("260자 넘는 문단 없음", not long_p, f"{len(long_p)}개 (첫 문단 {len(long_p[0]) if long_p else 0}자)")
    h2_pos = [m.start() for m in re.finditer(r"^##\s", body, flags=re.M)] + [len(body)]
    gaps = [h2_pos[i + 1] - h2_pos[i] for i in range(len(h2_pos) - 1)] if len(h2_pos) > 1 else []
    # 분량 2,500~4,000자 규칙과 맞추려면 섹션 하나가 raw 1,300자(코드블록·공백 포함)까지는 괜찮다. 폰 4장 분량.
    warn("소제목 간격", all(g <= 1300 for g in gaps) if gaps else False, f"소제목 사이가 가장 긴 곳이 {max(gaps) if gaps else 0}자예요. 1,300자 넘으면 소제목을 하나 더 두면 읽기 편해요")
    code_long = [m for m in re.findall(r"```[^\n]*\n(.*?)```", body, flags=re.S) if len([ln for ln in m.split("\n") if ln.strip()]) > 8]
    check("코드블록 8줄 이하(AI 출력은 5줄, 사람이 본다)", not code_long, f"긴 코드블록 {len(code_long)}개")
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
    warn("이미지 비율", not wide, f"폰에서 읽기 어려운 넓은 이미지가 {len(wide)}개예요 {wide[:2]}. 캡처라면 괜찮아요")
    print()
    if fails:
        print(f"막힌 항목 {len(fails)}개: " + ", ".join(fails)); sys.exit(1)
    print("자동 게이트 통과. 사람이 볼 것: 온토픽, 막힌 지점 1개, 재현 프롬프트/순서, 숫자마다 출처, 이미지 속 경로·개인정보.")
    sys.exit(0)

if __name__ == "__main__":
    main()
