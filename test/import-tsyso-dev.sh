#!/bin/bash
# Import TSYSO file to development merchant database
# Can be run multiple times - will update existing records
cd "$(dirname "$0")"
NODE_ENV=development npx tsx import-tsyso-direct.js
