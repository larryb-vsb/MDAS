#!/bin/bash

# Clean up any existing temp repo
rm -rf temp_repo

# Clone the repository afresh
git clone https://github.com/larryb-vsb/MMS.git temp_repo

# Copy all files except .git directory to the temporary repository
mkdir -p temp_repo
cp -r client server shared attached_assets transaction_management_changes.md temp_repo/
cp *.json *.ts *.js *.md temp_repo/
rm -f temp_repo/push_to_github.sh

# Navigate to the temporary repository
cd temp_repo

# Set up Git identity
git config user.name "larryb-vsb"
git config user.email "github-user@example.com"

# Add all files
git add .

# Commit changes
git commit -m "Update Merchant Management System code from Replit"

# Push to GitHub with token authentication
git push https://${GITHUB_TOKEN}@github.com/larryb-vsb/MMS.git main

# Clean up
cd ..
rm -rf temp_repo

echo "Code pushed to GitHub successfully!"