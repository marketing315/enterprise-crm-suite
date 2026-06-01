import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HeroMetricCard } from './HeroMetricCard';
import { MetricRow, KpiList } from './MetricRow';

describe('HeroMetricCard', () => {
  it('renderizza label, value, caption', () => {
    render(<HeroMetricCard label="Fatturato" value="€ 124.300" caption="Aprile 2026" />);
    expect(screen.getByText('Fatturato')).toBeInTheDocument();
    expect(screen.getByText('€ 124.300')).toBeInTheDocument();
    expect(screen.getByText('Aprile 2026')).toBeInTheDocument();
  });

  it('value usa tabular-nums e font display 36px', () => {
    render(<HeroMetricCard label="X" value="123" />);
    const v = screen.getByText('123');
    expect(v.className).toMatch(/tabular-nums/);
    expect(v.className).toMatch(/text-\[36px\]/);
  });

  it('non interattiva di default (div, no aria-label)', () => {
    const { container } = render(<HeroMetricCard label="X" value="1" />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('onClick rende button con press-scale e aria-label', () => {
    const onClick = vi.fn();
    render(<HeroMetricCard label="X" value="1" onClick={onClick} ariaLabel="Apri dettaglio" />);
    const btn = screen.getByRole('button', { name: 'Apri dettaglio' });
    expect(btn.className).toMatch(/press-scale/);
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('variante primary applica bg-primary + shadow-hero (token F0.2/F0.3)', () => {
    const { container } = render(<HeroMetricCard label="X" value="1" variant="primary" />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toMatch(/bg-primary/);
    expect(card.className).toMatch(/shadow-hero/);
  });

  it('renderizza TrendBadge quando delta è passato', () => {
    render(<HeroMetricCard label="X" value="1" delta={12.4} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('non renderizza TrendBadge quando delta è null/undefined', () => {
    const { rerender } = render(<HeroMetricCard label="X" value="1" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    rerender(<HeroMetricCard label="X" value="1" delta={null} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('trailing e footer vengono renderizzati', () => {
    render(
      <HeroMetricCard
        label="X"
        value="1"
        trailing={<span>BADGE</span>}
        footer={<span>FOOT</span>}
      />,
    );
    expect(screen.getByText('BADGE')).toBeInTheDocument();
    expect(screen.getByText('FOOT')).toBeInTheDocument();
  });
});

describe('MetricRow', () => {
  it('renderizza title, value, subtitle', () => {
    render(<MetricRow title="Margine" value="24%" subtitle="su lordo" />);
    expect(screen.getByText('Margine')).toBeInTheDocument();
    expect(screen.getByText('24%')).toBeInTheDocument();
    expect(screen.getByText('su lordo')).toBeInTheDocument();
  });

  it('tone positive applica text-success', () => {
    render(<MetricRow title="X" value="1" tone="positive" />);
    expect(screen.getByText('1').className).toMatch(/text-success/);
  });

  it('tone negative applica text-danger', () => {
    render(<MetricRow title="X" value="1" tone="negative" />);
    expect(screen.getByText('1').className).toMatch(/text-danger/);
  });

  it('onClick rende button con chevron', () => {
    const onClick = vi.fn();
    render(<MetricRow title="X" value="1" onClick={onClick} ariaLabel="Apri" />);
    const btn = screen.getByRole('button', { name: 'Apri' });
    expect(btn.className).toMatch(/press-scale/);
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('value ha tabular-nums', () => {
    render(<MetricRow title="X" value="1" />);
    expect(screen.getByText('1').className).toMatch(/tabular-nums/);
  });

  it('delta renderizza TrendBadge compact', () => {
    render(<MetricRow title="X" value="1" delta={-3.2} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('icon viene renderizzata', () => {
    render(<MetricRow title="X" value="1" icon={<svg data-testid="ic" />} />);
    expect(screen.getByTestId('ic')).toBeInTheDocument();
  });
});

describe('KpiList', () => {
  it('renderizza role=list con aria-label di default', () => {
    render(
      <KpiList>
        <MetricRow title="A" value="1" />
        <MetricRow title="B" value="2" />
      </KpiList>,
    );
    expect(screen.getByRole('list', { name: 'Indicatori' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('rispetta ariaLabel personalizzata', () => {
    render(
      <KpiList ariaLabel="KPI finanziari">
        <MetricRow title="A" value="1" />
      </KpiList>,
    );
    expect(screen.getByRole('list', { name: 'KPI finanziari' })).toBeInTheDocument();
  });

  it('gap loose applica space-y-3', () => {
    const { container } = render(
      <KpiList gap="loose">
        <MetricRow title="A" value="1" />
      </KpiList>,
    );
    expect((container.firstElementChild as HTMLElement).className).toMatch(/space-y-3/);
  });
});
