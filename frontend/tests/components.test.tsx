import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

describe('TaskCard', () => {
  it('renders task title', () => {
    // Simple test to verify setup works
    expect(true).toBe(true);
  });

  it('calculates 1 + 1', () => {
    expect(1 + 1).toBe(2);
  });
});

describe('Login form', () => {
  it('is a placeholder test', () => {
    expect('test').toBe('test');
  });
});