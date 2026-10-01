#!/bin/bash

# write-post installer for Mac/Linux - Multi-tool support

REPO_URL="${WRITE_POST_REPO_URL:-https://raw.githubusercontent.com/chat-prompt/write-post/main}"
SKILL_FILES=(
    "SKILL.md"
    "VERSION"
    "references/devlog-guide.md"
    "references/best-cases-185.md"
    "references/google-top300.md"
    "references/seo-geo-brief.md"
    "references/rules.md"
    "references/post-templates.md"
    "references/voice-default.md"
    "references/_diagram.css"
    "references/tpl-compare.html"
    "references/tpl-two-roles.html"
    "references/eli5-template.html"
    "scripts/fetch-member-posts.mjs"
    "scripts/voice-profile.mjs"
    "scripts/find-tags.mjs"
    "scripts/scan-session.mjs"
    "scripts/check-gate.py"
    "scripts/check-ai-tell.py"
    "scripts/blur-region.py"
    "scripts/capture-card.mjs"
    "scripts/preview-mobile.mjs"
    "scripts/copy-post.mjs"
    "scripts/gen-image.mjs"
    "scripts/capture-url.mjs"
    "scripts/check-update.mjs"
)

# 무입력 설치: install_mac.sh [claude|codex|gemini|opencode|antigravity|all, 쉼표 구분] [global|project]
# 또는 환경변수 WP_TOOLS, WP_SCOPE. AI 에이전트가 대신 설치할 때 쓴다(메뉴를 묻지 않는다).
ARG_TOOLS="$(echo "${1:-${WP_TOOLS:-}}" | tr '[:upper:]' '[:lower:]' | tr -d ' ')"
ARG_SCOPE="$(echo "${2:-${WP_SCOPE:-}}" | tr '[:upper:]' '[:lower:]' | tr -d ' ')"
if [ -n "$ARG_SCOPE" ] && [ "$ARG_SCOPE" != "global" ] && [ "$ARG_SCOPE" != "project" ]; then
    echo "설치 위치는 global 또는 project 여야 해요: '$ARG_SCOPE'" >&2; exit 1
fi

# 메뉴는 터미널에서만 물을 수 있다. 에이전트나 파이프에서 인자 없이 돌리면 바로 안내하고 끝낸다.
if [ -z "$ARG_TOOLS" ] || [ -z "$ARG_SCOPE" ]; then
    if ! { : </dev/tty; } 2>/dev/null; then
        echo "터미널이 아니라 메뉴를 물을 수 없어요. 도구와 위치를 인자로 주세요. 예: install_mac.sh claude global  (도구: claude, codex, gemini, opencode, antigravity, all)" >&2
        exit 1
    fi
fi

# Step 1: Select scope (global or project)
if [ -n "$ARG_SCOPE" ]; then
    scope_choice=$([ "$ARG_SCOPE" = "project" ] && echo 2 || echo 1)
else
echo "설치 위치를 선택하세요:"
echo "1) 전역 설치 (모든 프로젝트에서 사용)"
echo "2) 프로젝트 설치 (현재 폴더에서만 사용)"
read -p "선택 (1/2): " scope_choice </dev/tty
fi

if [ "$scope_choice" = "1" ]; then
    SCOPE="global"
    SCOPE_LABEL="전역"
else
    SCOPE="project"
    SCOPE_LABEL="프로젝트"
fi

# Step 2: Select tools
if [ -n "$ARG_TOOLS" ]; then
    tool_choice=$(echo "$ARG_TOOLS" | sed -e 's/all/6/' -e 's/claude/1/g' -e 's/opencode/2/g' -e 's/codex/3/g' -e 's/gemini/4/g' -e 's/antigravity/5/g')
    # 하나라도 못 알아들으면 멈춘다(claude,banana 같은 오타)
    for item in $(echo "$tool_choice" | tr ',' ' '); do
        case "$item" in 1|2|3|4|5|6) ;; *) echo "설치할 도구를 못 알아들었어요: '$item'. claude, codex, gemini, opencode, antigravity, all 중에서 적어 주세요." >&2; exit 1 ;; esac
    done
else
echo ""
echo "어떤 도구에 설치할까요?"
echo "1) Claude Code"
echo "2) OpenCode"
echo "3) Codex CLI"
echo "4) Gemini CLI"
echo "5) Antigravity"
echo "6) 전체"
read -p "선택 (1-6, 쉼표로 구분 가능): " tool_choice </dev/tty
fi

# Parse tool selections
declare -a TOOLS_TO_INSTALL
case ",$tool_choice," in *,6,*) tool_choice=6 ;; esac   # all이 섞여 있으면 전체
if [ "$tool_choice" = "6" ]; then
    TOOLS_TO_INSTALL=("claude" "opencode" "codex" "gemini" "antigravity")
else
    IFS=',' read -ra CHOICES <<< "$tool_choice"
    for choice in "${CHOICES[@]}"; do
        choice=$(echo "$choice" | xargs)
        case $choice in
            1) TOOLS_TO_INSTALL+=("claude") ;;
            2) TOOLS_TO_INSTALL+=("opencode") ;;
            3) TOOLS_TO_INSTALL+=("codex") ;;
            4) TOOLS_TO_INSTALL+=("gemini") ;;
            5) TOOLS_TO_INSTALL+=("antigravity") ;;
        esac
    done
fi

# Function to install a tool
install_tool() {
    local tool=$1
    local scope=$2
    local target_dir label
    
    # Path and label lookup (case statement for path resolution)
    case "$tool" in
        "claude")
            label="Claude Code"
            if [ "$scope" = "global" ]; then
                target_dir="$HOME/.claude/skills/write-post"
            else
                target_dir=".claude/skills/write-post"
            fi
            ;;
        "opencode")
            label="OpenCode"
            if [ "$scope" = "global" ]; then
                target_dir="$HOME/.config/opencode/skills/write-post"
            else
                target_dir=".opencode/skills/write-post"
            fi
            ;;
        "codex")
            label="Codex CLI"
            if [ "$scope" = "global" ]; then
                target_dir="$HOME/.codex/skills/write-post"
            else
                target_dir=".codex/skills/write-post"
            fi
            ;;
        "gemini")
            label="Gemini CLI"
            if [ "$scope" = "global" ]; then
                target_dir="$HOME/.gemini/skills/write-post"
            else
                target_dir=".gemini/skills/write-post"
            fi
            ;;
        "antigravity")
            label="Antigravity"
            if [ "$scope" = "global" ]; then
                target_dir="$HOME/.gemini/antigravity/skills/write-post"
            else
                target_dir=".agent/skills/write-post"
            fi
            ;;
    esac
    
    # 폴더를 통째로 지우지 않는다(node_modules, 멤버가 둔 파일 보존). 우리가 관리하는 파일만 새로 받는다.
    if ! mkdir -p "$target_dir/references" "$target_dir/scripts"; then
        echo "폴더를 만들 수 없어요(쓰기 권한 확인): $target_dir" >&2; exit 1
    fi
    for f in "${SKILL_FILES[@]}"; do rm -f "$target_dir/$f"; done
    
    for f in "${SKILL_FILES[@]}"; do
        if ! curl -fsSL "$REPO_URL/.claude/skills/write-post/$f" -o "$target_dir/$f"; then
            echo "ERROR: Failed to download $f for $label" >&2
            exit 1
        fi
    done
    
    # 어디서 받았는지 남긴다. 스킬이 시작할 때 이걸 보고 새 버전을 알린다.
    local tools_json="" t
    for t in "${TOOLS_TO_INSTALL[@]}"; do tools_json="$tools_json\"$t\","; done
    tools_json="[${tools_json%,}]"
    printf '{ "repo_url": "%s", "tools": %s, "scope": "%s", "installed_at": "%s" }\n' "$REPO_URL" "$tools_json" "$scope" "$(date +%Y-%m-%dT%H:%M:%S)" > "$target_dir/install.json"
    echo "✓ $label: $target_dir (${#SKILL_FILES[@]}개 파일)"
}

# Step 3: Install selected tools
echo ""
echo "설치 중..."
if [ ${#TOOLS_TO_INSTALL[@]} -eq 0 ]; then
    echo "설치할 도구를 못 알아들었어요: '${ARG_TOOLS:-$tool_choice}'. claude, codex, gemini, opencode, antigravity, all 중에서 적어 주세요." >&2
    exit 1
fi
for tool in "${TOOLS_TO_INSTALL[@]}"; do
    install_tool "$tool" "$SCOPE"
done

# Cleanup: Remove old installation paths
if [ "$SCOPE" = "global" ]; then
    [ -f "$HOME/.claude/commands/write-post.md" ] && rm "$HOME/.claude/commands/write-post.md" && echo "  (Cleaned up old file: ~/.claude/commands/write-post.md)"
else
    [ -f ".claude/commands/write-post.md" ] && rm ".claude/commands/write-post.md" && echo "  (Cleaned up old file: .claude/commands/write-post.md)"
fi

# Step 4: Show completion message
echo ""
echo "write-post $SCOPE_LABEL 설치 완료!"
echo "설치된 도구: $(IFS=', '; echo "${TOOLS_TO_INSTALL[*]}")"
echo "사용법: /write-post"
