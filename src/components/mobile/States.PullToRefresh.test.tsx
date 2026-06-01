import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import {
  HeroMetricSkeleton,
  MetricRowSkeleton,
  KpiListSkeleton,
  MobileListSkeleton,
} from './MobileSkeletons';
import { PullToRefresh } from './PullToRefresh';

function withQuery(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('EmptyState', () => {
  it('renderizza titolo, descrizione e role=status', () => {
    render(<EmptyState title="Nessun lead" description="Nessun dato per il periodo" />);
    const root = screen.getByRole('status');
    expect(root).toBeInTheDocument();
    expect(screen.getByText('Nessun lead')).toBeInTheDocument();
    expect(screen.getByText('Nessun dato per il periodo')).toBeInTheDocument();
  });

  it('mostra slot action quando fornito', () => {
    render(
      <EmptyState
        title="Vuoto"
        action={<button type="button">Crea</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Crea' })).toBeInTheDocument();
  });

  it('variante compact riduce padding', () => {
    const { container } = render(<EmptyState title="X" compact />);
    expect(container.firstChild).toHaveClass('py-8');
  });
});

describe('ErrorState', () => {
  it('renderizza con role=alert e bottone retry di default', () => {
    render(withQuery(<ErrorState />));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /riprova/i })).toBeInTheDocument();
  });

  it('hideRetry nasconde il bottone', () => {
    render(withQuery(<ErrorState hideRetry />));
    expect(screen.queryByRole('button', { name: /riprova/i })).toBeNull();
  });

  it('retry invalida le query keys e chiama onRetry', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const onRetry = vi.fn();
    render(
      <QueryClientProvider client={qc}>
        <ErrorState invalidateKeys={[['a'], ['b', 1]]} onRetry={onRetry} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /riprova/i }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy).toHaveBeenCalledWith({ queryKey: ['a'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['b', 1] });
    await waitFor(() => expect(onRetry).toHaveBeenCalled());
  });
});

describe('MobileSkeletons', () => {
  it('HeroMetricSkeleton ha role=status e aria-busy', () => {
    render(<HeroMetricSkeleton />);
    const s = screen.getByRole('status');
    expect(s).toHaveAttribute('aria-busy', 'true');
  });

  it('MetricRowSkeleton renderizza', () => {
    const { container } = render(<MetricRowSkeleton />);
    expect(container.querySelector('[role="status"]')).toBeInTheDocument();
  });

  it('KpiListSkeleton renderizza N righe', () => {
    const { container } = render(<KpiListSkeleton count={4} />);
    // 1 root status + 4 nested MetricRowSkeleton status
    expect(container.querySelectorAll('[role="status"]').length).toBe(5);
  });

  it('MobileListSkeleton renderizza N elementi', () => {
    const { container } = render(<MobileListSkeleton count={3} />);
    const root = container.querySelector('[role="status"]');
    expect(root).toBeInTheDocument();
    // 3 righe interne (div aria-hidden)
    expect(root!.children.length).toBe(3);
  });

  it('skeleton usa motion-safe:animate-pulse', () => {
    const { container } = render(<HeroMetricSkeleton />);
    const bones = container.querySelectorAll('.motion-safe\\:animate-pulse');
    expect(bones.length).toBeGreaterThan(0);
  });
});

describe('PullToRefresh', () => {
  it('renderizza children e non mostra indicatore di default', () => {
    const { container } = render(
      withQuery(
        <PullToRefresh>
          <div>contenuto</div>
        </PullToRefresh>,
      ),
    );
    expect(screen.getByText('contenuto')).toBeInTheDocument();
    // nessun indicatore visibile (showIndicator=false in idle)
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('aria-busy=false in idle', () => {
    const { container } = render(
      withQuery(
        <PullToRefresh>
          <div>x</div>
        </PullToRefresh>,
      ),
    );
    const scroller = container.querySelector('[aria-busy]');
    expect(scroller).toHaveAttribute('aria-busy', 'false');
  });

  it('disabled=true ignora il pointer down', () => {
    const onRefresh = vi.fn();
    const { container } = render(
      withQuery(
        <PullToRefresh disabled onRefresh={onRefresh}>
          <div>x</div>
        </PullToRefresh>,
      ),
    );
    const scroller = container.querySelector('[aria-busy]') as HTMLElement;
    fireEvent.pointerDown(scroller, { clientY: 0, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerMove(scroller, { clientY: 200, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(scroller, { clientY: 200, pointerId: 1, pointerType: 'touch' });
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
