#!/bin/bash
# ============================================================================
# Production Stuck Files Cleanup Wrapper
# ============================================================================
# Simple wrapper to remove files stuck in validating phase
#
# Usage:
#   ./scripts/cleanup-stuck-files.sh preview          # Preview files to delete
#   ./scripts/cleanup-stuck-files.sh execute admin    # Execute deletion
#   ./scripts/cleanup-stuck-files.sh preview 48       # Custom threshold (48 hours)
#   ./scripts/cleanup-stuck-files.sh execute admin 48 # Execute with custom threshold
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

MODE=$1
USERNAME=$2
HOURS=${3:-24}  # Default to 24 hours if not specified

# Function to show usage
show_usage() {
  echo -e "${BLUE}Usage:${NC}"
  echo "  $0 preview [hours]                    # Preview stuck files (default: 24 hours)"
  echo "  $0 execute <username> [hours]         # Delete stuck files"
  echo ""
  echo -e "${BLUE}Examples:${NC}"
  echo "  $0 preview                            # Preview files stuck 24+ hours"
  echo "  $0 preview 48                         # Preview files stuck 48+ hours"
  echo "  $0 execute admin                      # Delete as 'admin' user"
  echo "  $0 execute john.doe 12                # Delete files stuck 12+ hours"
  echo ""
  exit 1
}

# Check if mode is provided
if [ -z "$MODE" ]; then
  echo -e "${RED}Error: Mode required${NC}"
  show_usage
fi

# Validate mode
if [ "$MODE" != "preview" ] && [ "$MODE" != "execute" ]; then
  echo -e "${RED}Error: Invalid mode '$MODE'${NC}"
  echo "Mode must be 'preview' or 'execute'"
  show_usage
fi

# Check username for execute mode
if [ "$MODE" == "execute" ] && [ -z "$USERNAME" ]; then
  echo -e "${RED}Error: Username required for execute mode${NC}"
  show_usage
fi

# Check if production database URL is set
if [ -z "$NEON_PROD_DATABASE_URL" ]; then
  echo -e "${RED}Error: NEON_PROD_DATABASE_URL environment variable not set${NC}"
  echo "This script requires production database access."
  exit 1
fi

# Build the command
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TS_SCRIPT="$SCRIPT_DIR/remove-stuck-files.ts"

if [ ! -f "$TS_SCRIPT" ]; then
  echo -e "${RED}Error: Script not found: $TS_SCRIPT${NC}"
  exit 1
fi

# Show what we're doing
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
if [ "$MODE" == "preview" ]; then
  echo -e "${GREEN}PREVIEW MODE${NC} - Safe, read-only query"
  echo -e "Threshold: ${YELLOW}${HOURS} hours${NC}"
else
  echo -e "${YELLOW}EXECUTE MODE${NC} - Will delete stuck files"
  echo -e "Username: ${YELLOW}${USERNAME}${NC}"
  echo -e "Threshold: ${YELLOW}${HOURS} hours${NC}"
fi
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Run the TypeScript script
if [ "$MODE" == "preview" ]; then
  tsx "$TS_SCRIPT" preview --hours="$HOURS"
else
  tsx "$TS_SCRIPT" execute --username="$USERNAME" --hours="$HOURS"
fi

exit 0
