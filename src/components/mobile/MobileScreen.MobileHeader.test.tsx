import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileHeader } from './MobileHeader';
import { MobileScreen } from './MobileScreen';

describe('MobileHeader', () => {
  it('renderizza titolo, sottotitolo e azione', () => {
    render(
      <MobileHeader
        title="Pipeline"
        subtitle="Brand Acme"
        action={<button aria-label="Filtri">F</button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Pipeline' })).toBeInTheDocument();
    expect(screen.getByText('Brand Acme')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtri' })).toBeInTheDocument();
  });

  it('è sticky di default con backdrop-blur', () => {
    render(<MobileHeader title="X" />);
    const header = screen.getByRole('banner');
    expect(header.className).toMatch(/sticky/);
    expect(header.className).toMatch(/backdrop-blur/);
    expect(header.className).toMatch(/pt-safe/);
  });

  it('disattiva sticky quando nonSticky=true', () => {
    render(<MobileHeader title="X" nonSticky />);
    expect(screen.getByRole('banner').className).not.toMatch(/sticky/);
  });

  it('sottotitolo cliccabile chiama onSubtitleClick (brand selector)', () => {
    const onClick = vi.fn();
    render(<MobileHeader title="X" subtitle="Brand A" onSubtitleClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Brand A' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('non renderizza l\'area azione se action non passata', () => {
    render(<MobileHeader title="X" />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('MobileScreen', () => {
  it('renderizza header, contenuto e footer negli slot', () => {
    render(
      <MobileScreen
        header={<MobileHeader title="Home" />}
        footer={<div data-testid="footer">F</div>}
      >
        <div data-testid="content">Contenuto</div>
      </MobileScreen>,
    );
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByTestId('content')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  it('usa <main> per il body e applica animazione d\'ingresso di default', () => {
    render(
      <MobileScreen>
        <span>x</span>
      </MobileScreen>,
    );
    const main = screen.getByRole('main');
    expect(main.className).toMatch(/animate-slide-up-fade/);
    expect(main.className).toMatch(/overflow-y-auto/);
    expect(main.className).toMatch(/px-4/);
  });

  it('noEntryAnimation rimuove la classe slide-up-fade (reduced motion safety)', () => {
    render(
      <MobileScreen noEntryAnimation>
        <span>x</span>
      </MobileScreen>,
    );
    expect(screen.getByRole('main').className).not.toMatch(/animate-slide-up-fade/);
  });

  it('footer ha safe-area inferiore', () => {
    render(<MobileScreen footer={<div data-testid="footer">F</div>}>x</MobileScreen>);
    const footer = screen.getByTestId('footer').parentElement!;
    expect(footer.className).toMatch(/pb-safe/);
    expect(footer.className).toMatch(/backdrop-blur/);
  });

  it('layout: flex-col min-h-[100dvh]', () => {
    const { container } = render(<MobileScreen>x</MobileScreen>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/flex-col/);
    expect(root.className).toMatch(/min-h-\[100dvh\]/);
  });
});

describe('MobileScreen + MobileHeader — esempio integrato (AC)', () => {
  it('compongono uno schermo completo con sticky header, contenuto scrollabile e safe-area', () => {
    render(
      <MobileScreen
        header={
          <MobileHeader
            title="Dashboard CEO"
            subtitle="Tutti i brand"
            action={<button aria-label="Periodo">30g</button>}
          />
        }
      >
        <p>KPI</p>
      </MobileScreen>,
    );
    const header = screen.getByRole('banner');
    expect(header.className).toMatch(/sticky/);
    expect(screen.getByText('Dashboard CEO')).toBeInTheDocument();
    expect(screen.getByText('KPI')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Periodo' })).toBeInTheDocument();
  });
});
