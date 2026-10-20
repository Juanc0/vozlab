import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Home from '../src/routes/(app)/+page.svelte';

describe('home route', () => {
  it('renders the placeholder page with the runtime API base URL', () => {
    render(Home, { params: {}, data: { apiBaseUrl: 'https://api.vozlab.example/api/v1' } });

    expect(screen.getByRole('heading', { level: 1, name: 'Graph' })).toBeInTheDocument();
    expect(screen.getByText('https://api.vozlab.example/api/v1')).toBeInTheDocument();
  });

  it('does not imply a live update stream', () => {
    render(Home, { params: {}, data: { apiBaseUrl: 'http://localhost:3000/api/v1' } });

    expect(screen.queryByText(/live/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/realtime/i)).not.toBeInTheDocument();
  });
});
