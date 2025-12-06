#!/bin/bash

# Fix NatSpec tags in generated documentation
# 
# Issue: hardhat-docgen (v0.6.0-beta.36) doesn't properly strip NatSpec tags
# like @notice, @dev, @param, @return from the generated markdown output.
# 
# This script post-processes the generated docs to remove these tags,
# leaving only the clean description text.
#
# Usage: npm run fix-docs
# Or run automatically with: npm run docs

echo "Fixing documentation..."

cd "$(dirname "$0")/../docs"

# Remove @notice prefix from all markdown files
find . -name "*.md" -exec sed -i '' 's/^@notice //g' {} \;

# Remove @dev prefix
find . -name "*.md" -exec sed -i '' 's/^@dev //g' {} \;

# Remove @param prefix (standalone, not in tables)
find . -name "*.md" -exec sed -i '' 's/^@param //g' {} \;

# Remove @return prefix
find . -name "*.md" -exec sed -i '' 's/^@return //g' {} \;

echo "✓ Documentation fixed!"
echo "  - Removed @notice tags"
echo "  - Removed @dev tags"
echo "  - Removed @param tags"
echo "  - Removed @return tags"

