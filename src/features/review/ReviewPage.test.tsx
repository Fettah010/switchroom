// Component tests for the v0.6.0 client review page.
// The Worker is the authorization authority; these tests mock the share API
// and assert the page presents only safe client-facing metadata and states.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ReviewPage } from './ReviewPage';
import { PreferencesProvider } from '../../app/providers/PreferencesProvider';
import { WorkspaceProvider } from '../../app/providers/WorkspaceProvider';
import { CloudProjectProvider } from '../cloud/CloudProjectContext';
import { PlayerProvider } from '../../app/providers/PlayerProvider';
import { InMemoryWorkspaceRepository } from '../../workspaces/inMemoryWorkspaceRepository';
import type { ShareAccessResponse } from '../../lib/api/shareApi';

const baseAccess: ShareAccessResponse = {
  project: {
    title: 'Session review',
    description: 'Optional client-facing description',
    original: { label: 'Original' },
    edited: { label: 'Edited' },
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  },
  capabilities: { listen: true, feedback: false, downloads: false },
  access: { passwordRequired: false, linkExpiresAt: null },
};

const providers = (ui: React.ReactNode) => (
  <PlayerProvider>
    <PreferencesProvider>
      <WorkspaceProvider customRepository={new InMemoryWorkspaceRepository()}>
        <CloudProjectProvider>{ui}</CloudProjectProvider>
      </WorkspaceProvider>
    </PreferencesProvider>
  </PlayerProvider>
);

function mockFetch(handlers: Record<string, () => Response>): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    for (const [match, handler] of Object.entries(handlers)) {
      if (url.includes(match)) return handler();
    }
    return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'unhandled' } }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  });
}

describe('ReviewPage', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockReset();
  });

  it('renders project metadata and the player once access is resolved', async () => {
    mockFetch({
      '/share/tok1/access': () =>
        new Response(JSON.stringify(baseAccess), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      '/share/tok1/playback/original': () =>
        new Response(
          JSON.stringify({
            url: 'https://example.signed/original',
            expiresAt: Date.now() + 300000,
            mimeType: 'audio/wav',
            sizeBytes: 1000,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      '/share/tok1/playback/edited': () =>
        new Response(
          JSON.stringify({
            url: 'https://example.signed/edited',
            expiresAt: Date.now() + 300000,
            mimeType: 'audio/wav',
            sizeBytes: 1000,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    });

    render(providers(<ReviewPage token="tok1" />));

    expect(screen.getByText('Resolving review link…')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Session review' })).toBeInTheDocument(),
    );
    expect(screen.getByText('Optional client-facing description')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Original' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edited' })).toBeInTheDocument();
  });

  it('shows a password gate when the link is protected', async () => {
    let accessCalls = 0;
    mockFetch({
      '/share/tok2/access': () => {
        accessCalls += 1;
        if (accessCalls === 1) {
          return new Response(
            JSON.stringify({ error: { code: 'PASSWORD_REQUIRED', message: 'Password required' } }),
            { status: 401, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify(baseAccess), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
      '/share/tok2/password': () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });

    render(providers(<ReviewPage token="tok2" />));

    await waitFor(() => expect(screen.getByText('A password is required')).toBeInTheDocument());
    const unlock = screen.getByRole('button', { name: 'Unlock review' });
    expect(unlock).toBeDisabled();

    const input = screen.getByLabelText('Password');
    fireEvent.change(input, { target: { value: 'correct-password' } });

    expect(unlock).not.toBeDisabled();
    fireEvent.submit(unlock.closest('form')!);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Session review' })).toBeInTheDocument(),
    );
    expect(accessCalls).toBe(2);
  });

  it('renders a privacy-safe unavailable state for an unknown link', async () => {
    mockFetch({
      '/share/unknown/access': () =>
        new Response(
          JSON.stringify({ error: { code: 'LINK_UNAVAILABLE', message: 'Link unavailable' } }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        ),
    });

    render(providers(<ReviewPage token="unknown" />));

    await waitFor(() =>
      expect(screen.getByText('This review link is no longer available')).toBeInTheDocument(),
    );
    expect(screen.getByText(/invalid, has been revoked, or has expired/)).toBeInTheDocument();
  });
});
