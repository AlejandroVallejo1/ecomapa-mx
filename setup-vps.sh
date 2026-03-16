#!/bin/bash
# ── EcoMapa MX — Claude Code VPS Setup ──────────────────────────────
# Run this on your fresh Contabo Ubuntu 22.04 VPS as root:
#   bash setup-vps.sh
# ─────────────────────────────────────────────────────────────────────

set -e

echo "══════════════════════════════════════════════════════"
echo "  EcoMapa MX — Claude Code VPS Setup"
echo "══════════════════════════════════════════════════════"

# 1. System updates
echo "[1/6] Updating system packages..."
apt update -y && apt upgrade -y

# 2. Install essentials
echo "[2/6] Installing Node.js 20, git, tmux..."
apt install -y curl git tmux
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

echo "  Node.js: $(node -v)"
echo "  npm: $(npm -v)"

# 3. Install Claude Code
echo "[3/6] Installing Claude Code globally..."
npm install -g @anthropic-ai/claude-code

# 4. Clone the repo
echo "[4/6] Cloning ecomapa-mx..."
cd /root
if [ -d "ecomapa-mx" ]; then
  echo "  Repo already exists, pulling latest..."
  cd ecomapa-mx && git pull
else
  git clone https://github.com/AlejandroVallejo1/ecomapa-mx.git
  cd ecomapa-mx
fi

# 5. Install project dependencies
echo "[5/6] Installing npm dependencies..."
npm install

# 6. Create .env.local
echo "[6/6] Setting up environment..."
cat > .env.local << 'ENVEOF'
OPENAQ_API_KEY=9795f898a3226dfc1d4404dedbd5ff84c45641deb1f4f45afc2a4cdad0480123
AQICN_API_KEY=b213676d2ea5fe4e3fd46b2747805b1a9c674f39
ENVEOF

echo ""
echo "══════════════════════════════════════════════════════"
echo "  SETUP COMPLETE!"
echo "══════════════════════════════════════════════════════"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Authenticate Claude Code:"
echo "     claude auth login"
echo ""
echo "  2. Start a tmux session:"
echo "     tmux new -s claude"
echo ""
echo "  3. Run Claude Code (auto-accept everything):"
echo "     cd /root/ecomapa-mx"
echo "     claude --dangerously-skip-permissions"
echo ""
echo "  4. Detach tmux (keeps running after disconnect):"
echo "     Press: Ctrl+B, then D"
echo ""
echo "  5. Reconnect later from anywhere:"
echo "     ssh root@209.126.87.100"
echo "     tmux attach -t claude"
echo ""
echo "══════════════════════════════════════════════════════"
