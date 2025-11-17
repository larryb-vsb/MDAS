#!/bin/bash

# Configuration
BUGS_FILE="KNOWN_ISSUES.md"

# Check if the bugs file exists, create it if not
if [ ! -f "$BUGS_FILE" ]; then
  touch "$BUGS_FILE"
  echo "Issue #0: Initial Bug Tracker File Created" >> "$BUGS_FILE"
fi

# Function to display the main menu
display_menu() {
  echo "Bug Tracker Menu:"
  echo "1. List Bugs"
  echo "2. Create Bug"
  echo "3. Exit"
  echo -n "Enter your choice: "
}

# Function to list bugs
list_bugs() {
  if [ -s "$BUGS_FILE" ]; then
    cat "$BUGS_FILE"
  else
    echo "No bugs reported yet."
  fi
}

# Function to create a new bug report
create_bug() {
  case "$1" in
    "create")
        echo "Creating new bug report..."
        read -p "Bug title: " title
        read -p "Priority (Low/Medium/High/Critical): " priority
        read -p "Description: " description
        read -p "Create GitHub issue immediately? (y/n): " create_github

        if [ "$create_github" = "y" ] && command -v gh &> /dev/null && [ -n "$GITHUB_TOKEN" ]; then
            # Create GitHub issue first and use its number
            echo "$GITHUB_TOKEN" | gh auth login --with-token
            github_issue=$(gh issue create --repo "larryb-vsb/MMS" --title "[BUG] $title" --body "Priority: $priority\n\n$description" --label "bug" --json number --jq '.number')
            next_issue=$github_issue
            echo "✅ Created GitHub issue #$github_issue"
        else
            # Get next issue number locally
            last_issue=$(grep -o "Issue #[0-9]*" "$BUGS_FILE" | grep -o "[0-9]*" | sort -n | tail -1)
            next_issue=$((last_issue + 1))
        fi

        # Format the new bug report
        new_bug="Issue #$next_issue: $title (Priority: $priority) - $description"

        # Append the new bug to the bugs file
        echo "$new_bug" >> "$BUGS_FILE"
        echo "Bug report created successfully with issue number #$next_issue."
        ;;
    *)
      echo "Invalid option for create_bug function."
      ;;
  esac
}

# Main script logic
while true; do
  display_menu
  read choice

  case $choice in
    1)
      list_bugs
      ;;
    2)
      create_bug "create"
      ;;
    3)
      echo "Exiting..."
      exit 0
      ;;
    *)
      echo "Invalid choice. Please try again."
      ;;
  esac
done