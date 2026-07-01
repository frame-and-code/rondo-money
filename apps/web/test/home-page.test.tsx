import { render, screen } from '@testing-library/react';

import HomePage from '@/app/page';

// Smoke test (F0.5 DoD): the start page renders. Asserts the app heading and that the
// env-driven API base URL is surfaced — the two things F0.5 actually wires up.
describe('start page', () => {
  it('renders the app heading', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { name: 'Fin Flow AI' })).toBeInTheDocument();
  });

  it('shows the configured API base URL', () => {
    render(<HomePage />);
    expect(screen.getByText('http://localhost:3000')).toBeInTheDocument();
  });
});
