import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';

const PUBLIC_DIR = resolve(process.cwd(), 'public');

describe('Aho Reo App end-to-end user flow', () => {
  beforeEach(() => {
    // Serve real public/curricula/*.json files through mocked fetch in jsdom
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
        if (url.startsWith('/curricula/')) {
          const content = readFileSync(resolve(PUBLIC_DIR, url.replace(/^\//, '')), 'utf-8');
          return new Response(content, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads default course dynamically, grades macrons, and installs German & French from Studio catalog', async () => {
    render(<App />);

    // Wait for dynamic catalog boot and dismiss onboarding modal
    const startBtn = await screen.findByRole('button', { name: /start learning/i });
    fireEvent.click(startBtn);

    // Step 1 Overview (loaded from /curricula/te-reo-maori-a1.json)
    expect(screen.getByRole('heading', { name: /Lesson 1.1: Self & Identity/i })).toBeInTheDocument();

    // Switch to Lesson 1.3 (which uses macrons: Nō Tāmaki Makaurau ahau)
    const select = screen.getByLabelText(/Choose a lesson/i);
    fireEvent.change(select, { target: { value: 'MRA_W1_M03' } });

    // Jump to Step 5 Practice
    fireEvent.click(screen.getByRole('button', { name: /5\s*Practice/i }));

    // Pattern hint is hidden by default and target-word hint must never appear
    expect(screen.queryByText(/Nō \+ Tāmaki Makaurau \+ ahau/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nō \+ \[Place\] \+ \[Pronoun\]/i)).not.toBeInTheDocument();

    // Clicking "Show hint" reveals only the placeholder pattern
    fireEvent.click(screen.getByRole('button', { name: /Show hint/i }));
    expect(screen.getByText(/Pattern hint: Nō \+ \[Place\] \+ \[Pronoun\]/i)).toBeInTheDocument();
    expect(screen.queryByText(/Nō \+ Tāmaki Makaurau \+ ahau/i)).not.toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Type your sentence in Te Reo Māori/i);
    const checkBtn = screen.getByRole('button', { name: /Check Answer/i });

    // 1. Submit without macrons -> macron diff coaching
    fireEvent.change(input, { target: { value: 'No Tamaki Makaurau ahau' } });
    fireEvent.click(checkBtn);

    await waitFor(() => {
      expect(screen.getByText(/Check your macrons or accent marks/i)).toBeInTheDocument();
    });

    // 2. Fix macrons -> exact verified match
    fireEvent.change(input, { target: { value: 'Nō Tāmaki Makaurau ahau' } });
    fireEvent.click(checkBtn);

    await waitFor(() => {
      expect(screen.getByText(/Sentence verified and scheduled/i)).toBeInTheDocument();
    });

    // 3. Open Studio -> install German dynamically from catalog.json
    fireEvent.click(screen.getByRole('button', { name: /Studio/i }));
    expect(screen.getByRole('heading', { name: /Curriculum Studio/i })).toBeInTheDocument();

    const installGermanBtn = document.getElementById('installCourse_AHO_DEU_A1');
    expect(installGermanBtn).not.toBeNull();
    fireEvent.click(installGermanBtn!);

    await waitFor(() => {
      expect(screen.getByText(/Installed & switched to Deutsch \(German\)!/i)).toBeInTheDocument();
    });

    // 4. Install French dynamically from catalog.json
    const installFrenchBtn = document.getElementById('installCourse_AHO_FRA_A1');
    expect(installFrenchBtn).not.toBeNull();
    fireEvent.click(installFrenchBtn!);

    await waitFor(() => {
      expect(screen.getByText(/Installed & switched to Français \(French\)!/i)).toBeInTheDocument();
    });

    // 5. Return to Learn -> French Lesson 1.1 is now active
    fireEvent.click(screen.getByRole('button', { name: /Learn/i }));
    expect(
      screen.getByRole('heading', { name: /Lesson 1.1: Self & Identity \(Je m'appelle/i }),
    ).toBeInTheDocument();

    // 6. Toggle dark theme
    fireEvent.click(screen.getByRole('button', { name: /Switch to dark theme/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
