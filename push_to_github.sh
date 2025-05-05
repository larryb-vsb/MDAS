#!/bin/bash

# Clone the repository afresh
git clone https://github.com/larryb-vsb/MMS.git temp_repo

# Copy all files except .git directory to the temporary repository
rsync -av --exclude='.git' --exclude='temp_repo' --exclude='push_to_github.sh' . temp_repo/

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