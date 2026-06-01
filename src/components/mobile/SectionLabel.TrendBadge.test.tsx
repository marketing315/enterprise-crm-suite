import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionLabel } from './SectionLabel';
import { TrendBadge } from './TrendBadge';

describe('SectionLabel', () => {
  it('renderizza children e default tag h2', () => {
    const { container } = render(<SectionLabel>Pipeline</SectionLabel>);
    expect(screen.getByText('Pipeline')).toBeInTheDocument();
    expect(container.querySelector('h2')).not.toBeNull();
  });

  it('applica classi token uppercase + tracking', () => {
    render(<SectionLabel>X</SectionLabel>);
    const el = screen.getByText('X');
    expect(el.className).toMatch(/uppercase/);
    expect(el.className).toMatch(/text-muted-foreground/);
  });

  it('renderizza trailing slot', () => {
    render(<SectionLabel trailing={<button>Vedi tutti</button>}>Lead</SectionLabel>);
    expect(screen.getByRole('button', { name: 'Vedi tutti' })).toBeInTheDocument();
  });

  it('supporta override "as"', () => {
    const { container } = render(<SectionLabel as="h3">Sez</SectionLabel>);
    expect(container.querySelector('h3')).not.toBeNull();
    expect(container.querySelector('h2')).toBeNull();
  });
});

describe('TrendBadge', () => {
  it('positivo: usa colore success + ArrowUp + "+"', () => {
    render(<TrendBadge deltaPct={12.4} />);
    const badge = screen.getByRole('status');
    expect(badge.className).toMatch(/text-success/);
    expect(badge.textContent).toContain('+12.4%');
  });

  it('negativo: usa colore danger + segno meno tipografico', () => {
    render(<TrendBadge deltaPct={-3} />);
    const badge = screen.getByRole('status');
    expect(badge.className).toMatch(/text-danger/);
    expect(badge.textContent).toContain('−3.0%');
  });

  it('zero/null: neutral con em-dash quando null', () => {
    render(<TrendBadge deltaPct={null} />);
    const badge = screen.getByRole('status');
    expect(badge.className).toMatch(/text-muted-foreground/);
    expect(badge.textContent).toContain('—');
  });

  it('intent inverse: down diventa good (success)', () => {
    render(<TrendBadge deltaPct={-10} intent="inverse" />);
    const badge = screen.getByRole('status');
    expect(badge.className).toMatch(/text-success/);
  });

  it('intent inverse: up diventa bad (danger)', () => {
    render(<TrendBadge deltaPct={10} intent="inverse" />);
    const badge = screen.getByRole('status');
    expect(badge.className).toMatch(/text-danger/);
  });

  it('include tabular-nums per allineamento numerico', () => {
    render(<TrendBadge deltaPct={5} />);
    expect(screen.getByRole('status').className).toMatch(/tabular-nums/);
  });

  it('suffix è renderizzato', () => {
    render(<TrendBadge deltaPct={5} suffix="vs mese scorso" />);
    expect(screen.getByText(/vs mese scorso/)).toBeInTheDocument();
  });

  it('aria-label esplicito sovrascrive default', () => {
    render(<TrendBadge deltaPct={5} aria-label="Crescita ricavi" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Crescita ricavi');
  });

  it('compact: niente pill background', () => {
    render(<TrendBadge deltaPct={5} compact />);
    const badge = screen.getByRole('status');
    expect(badge.className).not.toMatch(/bg-success\/10/);
  });
});
