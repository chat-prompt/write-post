#!/bin/bash

# write-post installer for Mac/Linux - Multi-tool support

REPO_URL="https://raw.githubusercontent.com/chat-prompt/write-post/main"
SKILL_FILES=(
    "SKILL.md"
    "references/devlog-guide.md"
    "references/best-cases-185.md"
    "references/seo-geo-brief.md"
    "references/rules.md"
    "references/post-templates.md"
    "references/voice-default.md"
    "references/_diagram.css"
    "references/tpl-compare.html"
    "references/tpl-two-roles.html"
    "references/eli5-template.html"
    "scripts/fetch-member-posts.mjs"
    "scripts/find-tags.mjs"
    "scripts/check-gate.py"
    "scripts/check-ai-tell.py"
    "scripts/blur-region.py"
    "scripts/capture-card.mjs"
    "scripts/preview-mobile.mjs"
)

# Step 1: Select scope (global or project)
echo "설치 위치를 선택하세요:"
echo "1) 전역 설치 (모든 프로젝트에서 사용)"
echo "2) 프로젝트 설치 (현재 폴더에서만 사용)"
read -p "선택 (1/2): " scope_choice </dev/tty

if [ "$scope_choice" = "1" ]; then
    SCOPE="global"
    SCOPE_LABEL="전역"
else
    SCOPE="project"
    SCOPE_LABEL="프로젝트"
fi

# Step 2: Select tools
echo ""
echo "어떤 도구에 설치할까요?"
echo "1) Claude Code"
echo "2) OpenCode"
echo "3) Codex CLI"
echo "4) Gemini CLI"
echo "5) Antigravity"
echo "6) 전체"
read -p "선택 (1-6, 쉼표로 구분 가능): " tool_choice </dev/tty

# Parse tool selections
declare -a TOOLS_TO_INSTALL
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
    
    [ -d "$target_dir" ] && rm -rf "$target_dir"
    mkdir -p "$target_dir/references" "$target_dir/scripts"
    
    for f in "${SKILL_FILES[@]}"; do
        if ! curl -fsSL "$REPO_URL/.claude/skills/write-post/$f" -o "$target_dir/$f"; then
            echo "ERROR: Failed to download $f for $label" >&2
            exit 1
        fi
    done
    
    echo "✓ $label: $target_dir (${#SKILL_FILES[@]}개 파일)"
}

# Step 3: Install selected tools
echo ""
echo "설치 중..."
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
