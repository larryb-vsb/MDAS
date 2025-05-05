#!/bin/bash

echo "Running unit tests..."
npx jest --detectOpenHandles

# Capture the exit code
exit_code=$?

if [ $exit_code -eq 0 ]; then
  echo "✅ All tests passed!"
else
  echo "❌ Some tests failed. Exit code: $exit_code"
fi

exit $exit_code