#!/usr/bin/env python3
"""AI 티 검사 (팀 공용판). 사용법: python3 check-ai-tell.py 초안.md

원본: 지피터스 AI 티 제거 가이드 5번 스크립트(2026-08-31). 개인 문체 규칙(어요 비율)은 뺐다.
종료 코드 0 = 통과, 1 = 고칠 것 있음.
"""
import re, sys, statistics

def main():
    try: sys.stdout.reconfigure(encoding="utf-8")  # Windows 콘솔 한글 깨짐 방지
    except Exception: pass
    if len(sys.argv) < 2:
        print("사용법: python3 check-ai-tell.py 초안.md"); sys.exit(2)
    raw = open(sys.argv[1], encoding="utf-8").read()
    parts = raw.split("---", 2)
    b = parts[2] if raw.startswith("---") and len(parts) == 3 else raw
    b = re.sub(r"```.*?```", "", b, flags=re.S)
    b = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", b)
    b = re.sub(r"^>.*$", "", b, flags=re.M)
    t = re.sub(r"^#+ .*$", "", b, flags=re.M)
    t = re.sub(r"<[^>]+>", "", t)
    body = re.sub(r"\s+", " ", t).strip()
    fails = []

    def check(label, val, ok, hint):
        mark = "OK " if ok else "고침"
        print(f"[{mark}] {label}: {val}  ({hint})")
        if not ok: fails.append(label)

    check("줄표(em/en dash)", (t.count("—"), t.count("–")), t.count("—") + t.count("–") == 0, "둘 다 0")
    check("첫째/둘째/셋째", len(re.findall(r"첫째|둘째|셋째", t)), not re.search(r"첫째|둘째|셋째", t), "0")
    ai = ["할 수 있습니다", "것이 중요합니다", "을 통해", "를 통해", "다양한", "효과적으로", "에 있어", "라는 점에서", "정리하면", "결론적으로", "살펴보았습니다"]
    hits = {w: t.count(w) for w in ai if t.count(w)}
    check("AI 단어", hits or 0, not hits, "0")
    abst = {w: t.count(w) for w in ["최고의", "탁월한", "놀라운", "혁신적"] if t.count(w)}
    check("추상 형용사", abst or 0, not abst, "0")
    para = len(re.findall(r"가 아니라|이 아니라", t))
    check("대구법(가 아니라)", para, para <= 3, "3 이하")
    hedge = len(re.findall(r"일 수도|인 것 같|듯합니다|듯해요|물론 .{0,20}지만", t))
    check("헤지", hedge, hedge == 0, "0")
    sents = [s.strip() for s in re.split(r"(?<=[다요죠까])\.\s+|(?<=[!?])\s+", body) if s and len(s.strip()) > 3]
    lens = [len(s) for s in sents]
    if len(lens) >= 3:
        sd = statistics.pstdev(lens)
        same = sum(1 for i in range(len(lens) - 2) if max(lens[i:i + 3]) - min(lens[i:i + 3]) <= 5)
        print(f"[정보] 문장 {len(lens)}개 · 평균 {statistics.mean(lens):.0f}자 · 길이 표준편차 {sd:.1f} (30 아래면 리듬이 균일함)")
        check("비슷한 길이 3연속", same, same <= 3, "3 이하")
    # 습니다체 자체는 괜찮다. 같은 길이(±6자)의 ~니다 문장이 세 개 연속일 때만 잡는다(voice-default 1번).
    ni_run = 0
    for m in re.finditer(r"(?:[^.!?\n]*니다\.\s*){3,}", t):
        ls = [len(s) for s in re.findall(r"[^.!?\n]*니다\.", m.group(0))]
        if any(max(ls[i:i + 3]) - min(ls[i:i + 3]) <= 6 for i in range(len(ls) - 2)): ni_run += 1
    check("같은 길이 ~니다 문장 3연속", ni_run, ni_run == 0, "0")
    aph = re.findall(r"[가-힣A-Za-z']+(?:와|과|은|는)\s[^.\n]{0,20}(?:은|는)\s*다(?:르다|릅니다|른\s*거)|≠", t)
    check("격언 맺음(A와 B는 다르다)", len(aph), len(aph) <= 1, "1 이하")
    pov = re.findall(r"사용자에게\s*(?:정정|알렸|알려|보고|확인을|설명했|물었|되물)|사용자가\s*[\"“'‘][^\"”'’]{1,60}[\"”'’]\s*(?:라고|고)\s*(?:지적|물었|말했|요청했|했습니다|답했)|이유를 물었더니", t)
    check("3인칭·AI 시점(사용자가, 이유를 물었더니)", len(pov), not pov, "0, 작성자가 1인칭으로")
    first = sents[0] if sents else ""
    bad = re.search(r"에 대해|오늘은|알아볼게요|알아보겠|최근 많은|소개합니다", first)
    check("첫 문장", "주제 설명형" if bad else "장면/답으로 시작", not bad, first[:40])
    feel = re.findall(r"(민망|부끄|당황|짜증|답답|뿌듯|설레|억울|허탈|우겼|자신 있게|솔직히|사실은|망했|눈물)", t)
    if feel:
        print(f"[주의] 감정·태도 표현 {len(feel)}개: {sorted(set(feel))}  → 세션의 멤버 말이나 확인 답에 있는 것만 남긴다 (자동으로 못 가른다)")
    print()
    if fails:
        print(f"고칠 것 {len(fails)}개: " + ", ".join(fails)); sys.exit(1)
    print("AI 티 검사 통과"); sys.exit(0)

if __name__ == "__main__":
    main()
