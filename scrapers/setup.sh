#!/usr/bin/env bash
# One-time setup for the Python scraper service.
# Usage: ./scrapers/setup.sh   (from the repo root or scrapers/)
set -euo pipefail

cd "$(dirname "$0")"

PYTHON="${PYTHON:-python3}"
# Note: if the repo lives on an exFAT/NTFS external drive, macOS litters the
# venv with ._* AppleDouble files that break pip — put the venv on the system
# disk instead, e.g.:  VENV_DIR=~/.venvs/getgrant ./scrapers/setup.sh
VENV_DIR="${VENV_DIR:-$(pwd)/../.venv}"

echo "==> Creating virtualenv ($VENV_DIR)"
"$PYTHON" -m venv "$VENV_DIR"

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

echo "==> Installing Python dependencies"
pip install --upgrade pip
pip install -r requirements.txt

echo "==> Installing Playwright Chromium (used by JS-heavy sources)"
playwright install chromium

echo ""
echo "Done. Activate with:  source $VENV_DIR/bin/activate"
echo "Run all scrapers:     python scrapers/main.py"
echo "Run one source:       python scrapers/main.py --source-id <id>"
echo "By frequency:         python scrapers/main.py --frequency daily|weekly"
echo ""
echo "DATABASE_URL is read from the repo-root .env (or the environment)."
