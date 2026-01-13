#!/bin/bash

echo "Starting GitHub push process..."

# Verify GITHUB_TOKEN is set
if [ -z "$GITHUB_TOKEN" ]; then
  echo "Error: GITHUB_TOKEN environment variable is not set."
  echo "Please add your GitHub token to Replit Secrets with the key 'GITHUB_TOKEN'."
  exit 1
fi

# Clean up any existing temp repo
rm -rf temp_repo
mkdir -p temp_repo

echo "Copying project files..."
# Copy all needed files to temp directory
cp -r client server shared attached_assets temp_repo/ 2>/dev/null || true
cp *.json *.ts *.js *.md PRODUCT_REQUIREMENTS.md temp_repo/ 2>/dev/null || true
rm -f temp_repo/push_to_github.sh

# Navigate to the temporary repository
cd temp_repo

echo "Setting up Git repository..."
# Initialize a new Git repository
git init
git config user.name "larryb-vsb"
git config user.email "github-user@example.com"

# Add all files
git add .

# Check if there are any files to commit
if git diff --cached --quiet; then
  echo "No changes to commit. Exiting."
  cd ..
  rm -rf temp_repo
  exit 0
fi

# Commit changes
git commit -m "Update Merchant Management System code from Replit"

# Set the GitHub repository
# Change this to your actual repository
REPO_OWNER="larryb-vsb"
REPO_NAME="MMS"

echo "Using repository: $REPO_OWNER/$REPO_NAME"

# Configure token authentication for this session using the token directly in the URL
git remote add origin "https://${GITHUB_TOKEN}@github.com/$REPO_OWNER/$REPO_NAME.git"

# Disable interactive prompts
export GIT_ASKPASS="true"
export GIT_TERMINAL_PROMPT=0

# Test connection by getting remote info
echo "Testing GitHub connection..."
REMOTE_INFO=$(git ls-remote origin 2>&1)
if [[ $REMOTE_INFO == *"not found"* || $REMOTE_INFO == *"Repository not found"* || $REMOTE_INFO == *"Authentication failed"* ]]; then
  echo "Error: Unable to access repository. Please check your token and repository name."
  echo "Detailed error: $REMOTE_INFO"
  cd ..
  rm -rf temp_repo
  exit 1
fi

echo "Pushing to GitHub repository: $REPO_OWNER/$REPO_NAME"
# Push to GitHub with token authentication, force push to overwrite remote content
git push -f origin main

# Check if push was successful
if [ $? -eq 0 ]; then
  echo "Code pushed to GitHub successfully!"
else
  echo "Error: Failed to push to GitHub. Please check your repository settings and token permissions."
  echo "Make sure your token has 'repo' access for private repositories."
  echo "If the repository doesn't exist, create it on GitHub first."
fi

# Clean up
cd ..
rm -rf temp_repo