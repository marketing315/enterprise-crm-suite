import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BottomSheet } from './BottomSheet';
import { MobileFab } from './MobileFab';

describe('BottomSheet', () => {
  it('non renderizza contenuto se closed', () => {
    render(
      <BottomSheet open={false} onOpenChange={() => {}} title="X">
        <p>hidden body</p>
      </BottomSheet>,
    );
    expect(screen.queryByText('hidden body')).not.toBeInTheDocument();
  });

  it('renderizza title, description, body e footer quando aperto', () => {
    render(
      <BottomSheet
        open
        onOpenChange={() => {}}
        title="Filtri"
        description="Affina ricerca"
        footer={<button>Applica</button>}
      >
        <p>body content</p>
      </BottomSheet>,
    );
    expect(screen.getByText('Filtri')).toBeInTheDocument();
    expect(screen.getByText('Affina ricerca')).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Applica' })).toBeInTheDocument();
  });

  it('mostra handle di default e lo nasconde con showHandle=false', () => {
    const { rerender } = render(
      <BottomSheet open onOpenChange={() => {}} title="X">
        body
      </BottomSheet>,
    );
    expect(document.querySelector('.bg-muted-foreground\\/30')).toBeTruthy();
    rerender(
      <BottomSheet open onOpenChange={() => {}} title="X" showHandle={false}>
        body
      </BottomSheet>,
    );
    expect(document.querySelector('.bg-muted-foreground\\/30')).toBeFalsy();
  });
});

describe('MobileFab', () => {
  it('renderizza con aria-label obbligatoria e icona aria-hidden', () => {
    render(<MobileFab icon={<svg data-testid="ic" />} label="Nuovo contatto" />);
    const btn = screen.getByRole('button', { name: 'Nuovo contatto' });
    expect(btn).toBeInTheDocument();
    // icona wrapper aria-hidden
    expect(btn.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it('garantisce min target ≥44px (AC F1.3)', () => {
    render(<MobileFab icon={<span />} label="X" />);
    const btn = screen.getByRole('button', { name: 'X' });
    expect(btn.className).toMatch(/min-h-\[44px\]/);
    expect(btn.className).toMatch(/min-w-\[44px\]/);
  });

  it('usa press-scale e shadow-fab da F0.3', () => {
    render(<MobileFab icon={<span />} label="X" />);
    const btn = screen.getByRole('button', { name: 'X' });
    expect(btn.className).toMatch(/press-scale/);
    expect(btn.className).toMatch(/shadow-fab/);
  });

  it('è safe-area aware in position bottom-right (default)', () => {
    render(<MobileFab icon={<span />} label="X" />);
    const btn = screen.getByRole('button', { name: 'X' });
    expect(btn.className).toMatch(/safe-area-inset-bottom/);
    expect(btn.className).toMatch(/fixed/);
  });

  it('inline non aggiunge fixed/safe-area', () => {
    render(<MobileFab icon={<span />} label="X" position="inline" />);
    const btn = screen.getByRole('button', { name: 'X' });
    expect(btn.className).not.toMatch(/fixed/);
  });

  it('renderizza extended label accanto all\'icona', () => {
    render(<MobileFab icon={<span />} label="Crea" extendedLabel="Crea contatto" />);
    expect(screen.getByText('Crea contatto')).toBeInTheDocument();
  });

  it('onClick si attiva al click', () => {
    const onClick = vi.fn();
    render(<MobileFab icon={<span />} label="X" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'X' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('rispetta variant neutral', () => {
    render(<MobileFab icon={<span />} label="X" variant="neutral" />);
    const btn = screen.getByRole('button', { name: 'X' });
    expect(btn.className).toMatch(/bg-card/);
  });
});
