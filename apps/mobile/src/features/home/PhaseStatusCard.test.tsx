import { render, screen } from '@testing-library/react-native';

import { PhaseStatusCard } from './PhaseStatusCard';

describe('PhaseStatusCard', () => {
  it('renders the phase title', () => {
    render(<PhaseStatusCard title="Phase 1" status="in-progress" detail="Scaffolding" />);
    expect(screen.getByText('Phase 1')).toBeTruthy();
  });

  it('renders a human-readable status label', () => {
    render(<PhaseStatusCard title="Phase 0" status="done" detail="Decisions recorded" />);
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('exposes an accessibility label combining title, status, and detail', () => {
    render(<PhaseStatusCard title="Phase 2" status="pending" detail="Kotlin core" />);
    expect(screen.getByLabelText('Phase 2. Status: Pending. Kotlin core')).toBeTruthy();
  });
});
