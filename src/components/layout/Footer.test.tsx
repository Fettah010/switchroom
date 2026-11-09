import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer } from './Footer';
import pkg from '../../../package.json';

describe('Footer', () => {
  it('shows the version injected from package.json', () => {
    render(<Footer />);

    expect(__APP_VERSION__).toBe(pkg.version);
    expect(screen.getByText(`v${pkg.version}`)).toBeInTheDocument();
    expect(screen.getByText(`v${pkg.version}`)).not.toHaveTextContent('0.2.0');
  });
});
