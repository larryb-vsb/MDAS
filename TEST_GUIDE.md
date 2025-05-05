# Testing Guide for Merchant Management System

This guide provides instructions for running and writing tests for the Merchant Management System.

## Testing Stack

The project uses the following testing tools:

- **Jest**: Test runner and assertion library
- **React Testing Library**: For testing React components
- **MSW (Mock Service Worker)**: For mocking API requests during tests

## Running Tests

### Running All Tests

To run all tests in the project:

```
npm test
```

### Running Specific Tests

To run a specific test file:

```
npm test -- client/src/__tests__/Settings.test.tsx
```

Or to run tests matching a specific pattern:

```
npm test -- -t "BackupHistoryDialog"
```

### Running Tests in Watch Mode

For development, you can run tests in watch mode, which will automatically rerun tests when files change:

```
npm test -- --watch
```

## Test Structure

### Component Tests

Component tests are located in `client/src/__tests__/` and follow this structure:

```jsx
// Import the component and testing utilities
import { render, screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './utils/test-utils';
import MyComponent from '@/components/path/to/MyComponent';

// Setup mock handlers if needed
jest.mock('@/lib/queryClient', () => ({
  // Mock implementation
}));

describe('MyComponent', () => {
  // Setup before each test if needed
  beforeEach(() => {
    // Setup code
  });

  it('renders correctly', () => {
    renderWithProviders(<MyComponent />);
    
    // Make assertions about what appears in the document
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('handles user interactions', () => {
    renderWithProviders(<MyComponent />);
    
    // Simulate user actions
    fireEvent.click(screen.getByRole('button', { name: 'Click Me' }));
    
    // Assert the expected outcome
    expect(screen.getByText('Result')).toBeInTheDocument();
  });
});
```

### API/Integration Tests

For testing API integration:

```jsx
import { server, rest } from './utils/server';
import { renderWithProviders } from './utils/test-utils';
import { waitFor } from '@testing-library/react';

// Setup handlers for this specific test
beforeEach(() => {
  server.use(
    rest.get('/api/endpoint', (req, res, ctx) => {
      return res(ctx.json({ data: 'mocked response' }));
    })
  );
});

it('fetches and displays data', async () => {
  renderWithProviders(<ComponentThatFetchesData />);
  
  await waitFor(() => {
    expect(screen.getByText('mocked response')).toBeInTheDocument();
  });
});
```

## Testing Utilities

### `renderWithProviders`

A helper function that wraps components with necessary providers (React Query, etc.):

```jsx
// Usage
import { renderWithProviders } from './__tests__/utils/test-utils';

test('my test', () => {
  renderWithProviders(<MyComponent />);
  // Make assertions...
});
```

### Mock Handlers

We use MSW to intercept and mock API requests:

```jsx
// Example mock handler
rest.get('/api/merchants', (req, res, ctx) => {
  return res(ctx.json({
    merchants: mockMerchants,
    pagination: { ... }
  }));
});
```

## Test Coverage

To generate a test coverage report:

```
npm test -- --coverage
```

This will create a coverage report in the `coverage` directory, which you can view by opening `coverage/lcov-report/index.html` in your browser.

## Best Practices

1. **Test behavior, not implementation**: Focus on what the component does, not how it does it.
2. **Use user-centric queries**: Prefer `getByRole`, `getByLabelText`, etc. over `getByTestId`.
3. **Test edge cases**: Include tests for loading states, error states, and boundary conditions.
4. **Keep tests independent**: Each test should be able to run independently of others.
5. **Mock external dependencies**: Use jest.mock() for external services and APIs.
6. **Avoid testing implementation details**: Focus on testing the public API of your components.

## Debugging Tests

If a test is failing, you can use these strategies to debug:

1. Use `screen.debug()` to print the current DOM state.
2. Use `console.log()` to inspect variables during test execution.
3. Run a single test with `--verbose` to see more details.
4. Use `test.only()` to run just one test in a file.

## Continuous Integration

Tests are automatically run in our CI pipeline (GitHub Actions) for every pull request and push to main.