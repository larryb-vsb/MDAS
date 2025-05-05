# Testing Guide for Merchant Management System

This guide explains how to run and write tests for the Merchant Management System.

## Testing Setup

The project uses Jest and React Testing Library for testing. The test configuration includes:

- **Jest**: JavaScript testing framework
- **React Testing Library**: DOM testing utilities for React components
- **User Event**: Simulating user interactions
- **Jest DOM**: Custom Jest matchers for DOM testing
- **Babel**: For transpiling TypeScript and JSX in tests

## Running Tests

To run the tests, use the provided script:

```bash
./run-tests.sh
```

This will run all test files with the `.test.ts` or `.test.tsx` extension in the `client/src/__tests__` directory.

## Test Structure

Tests are organized in the following structure:

```
client/src/__tests__/
├── __mocks__/           # Mock data and handlers
├── utils/               # Test utilities
│   └── test-utils.tsx   # Custom render function with providers
├── Settings.test.tsx    # Tests for Settings page
├── BackupHistoryDialog.test.tsx  # Tests for backup history dialog
└── database.test.ts     # Tests for database module
```

## Writing New Tests

When writing new tests:

1. Create test files with `.test.tsx` or `.test.ts` extension
2. Use the `render` function from `test-utils.tsx` to include necessary providers
3. Mock API requests using Jest's mocking capabilities
4. Assertions should use Jest DOM matchers

Example:

```tsx
import { screen } from '@testing-library/react';
import { render } from './utils/test-utils';
import YourComponent from '@/components/YourComponent';

describe('YourComponent', () => {
  it('renders correctly', () => {
    render(<YourComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

## Mocks

The test setup includes mocks for:

- API requests via `@/lib/queryClient`
- Common UI components (Sidebar, Header, etc.)
- Browser APIs (window.location, IntersectionObserver)

To add new mocks, create mock implementations in the `__mocks__` directory.

## Testing Best Practices

- Test component rendering, user interactions, and state changes
- Mock external dependencies (API calls, complex UI components)
- Write focused tests that target specific functionality
- Use descriptive test and assertion messages
- Ensure tests are independent and don't rely on external state