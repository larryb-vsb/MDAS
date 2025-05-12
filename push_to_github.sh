#!/bin/bash

echo "Starting GitHub push process..."

# Clean up any existing temp repo
rm -rf temp_repo
mkdir -p temp_repo

echo "Copying project files..."
# Copy all needed files to temp directory
cp -r client server shared attached_assets temp_repo/
cp *.json *.ts *.js *.md temp_repo/
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

# Commit changes
git commit -m "Update Merchant Management System code from Replit"

# Ask user for the correct GitHub repository name
echo ""
echo "What is your GitHub repository URL? (e.g., https://github.com/username/repo)"
read -p "> " repo_url

# If repo_url is empty, use the default
if [ -z "$repo_url" ]; then
  repo_url="https://github.com/larryb-vsb/MMS.git"
  echo "Using default repository: $repo_url"
else
  echo "Using repository: $repo_url"
fi

# Extract the username/repo part
repo_path=$(echo "$repo_url" | sed -E 's|https://github.com/||' | sed -E 's|\.git$||')

echo "Pushing to GitHub repository: $repo_path"
# Push to GitHub with token authentication
git push -f https://${GITHUB_TOKEN}@github.com/$repo_path.git main

# Check if push was successful
if [ $? -eq 0 ]; then
  echo "Code pushed to GitHub successfully!"
else
  echo "Error: Failed to push to GitHub. Please check your repository URL and token."
fi

# Clean up
cd ..
rm -rf temp_repo