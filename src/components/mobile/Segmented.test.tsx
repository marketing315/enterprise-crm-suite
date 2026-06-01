import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Segmented, ChipGroup } from './Segmented';

const OPTS = [
  { value: '7D', label: '7g' },
  { value: '1M', label: 'Mese', count: 12 },
  { value: '3M', label: '3M', disabled: true },
  { value: '6M', label: '6M' },
] as const;

describe('Segmented', () => {
  it('renderizza tutte le opzioni e marca selezionato con aria-checked', () => {
    render(<Segmented options={OPTS as any} value="1M" onChange={() => {}} ariaLabel="Periodo" />);
    const group = screen.getByRole('radiogroup', { name: 'Periodo' });
    expect(group).toBeInTheDocument();
    const sel = screen.getByRole('radio', { name: 'Mese' });
    expect(sel).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '7g' })).toHaveAttribute('aria-checked', 'false');
  });

  it('onChange viene chiamato al click su opzione non disabilitata', () => {
    const onChange = vi.fn();
    render(<Segmented options={OPTS as any} value="1M" onChange={onChange} ariaLabel="X" />);
    fireEvent.click(screen.getByRole('radio', { name: '6M' }));
    expect(onChange).toHaveBeenCalledWith('6M');
  });

  it('non chiama onChange su opzione disabilitata', () => {
    const onChange = vi.fn();
    render(<Segmented options={OPTS as any} value="1M" onChange={onChange} ariaLabel="X" />);
    const disabled = screen.getByRole('radio', { name: '3M' });
    expect(disabled).toBeDisabled();
    fireEvent.click(disabled);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('mostra count con tabular-nums', () => {
    render(<Segmented options={OPTS as any} value="1M" onChange={() => {}} ariaLabel="X" />);
    const badge = screen.getByText('12');
    expect(badge.className).toMatch(/tabular-nums/);
  });

  it('asTabs cambia role in tablist/tab con aria-selected', () => {
    render(<Segmented options={OPTS as any} value="1M" onChange={() => {}} ariaLabel="X" asTabs />);
    expect(screen.getByRole('tablist', { name: 'X' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Mese' })).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowRight sposta focus alla prossima opzione abilitata (salta disabled)', () => {
    render(<Segmented options={OPTS as any} value="1M" onChange={() => {}} ariaLabel="X" />);
    const mese = screen.getByRole('radio', { name: 'Mese' });
    mese.focus();
    fireEvent.keyDown(mese, { key: 'ArrowRight' });
    // 3M è disabled → focus va a 6M
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '6M' }));
  });

  it('ArrowLeft wrappa da prima a ultima', () => {
    render(<Segmented options={OPTS as any} value="7D" onChange={() => {}} ariaLabel="X" />);
    const first = screen.getByRole('radio', { name: '7g' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '6M' }));
  });

  it('Home/End spostano focus', () => {
    render(<Segmented options={OPTS as any} value="1M" onChange={() => {}} ariaLabel="X" />);
    const mese = screen.getByRole('radio', { name: 'Mese' });
    mese.focus();
    fireEvent.keyDown(mese, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '6M' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '7g' }));
  });

  it('container ha no-scrollbar e overflow-x-auto', () => {
    render(<Segmented options={OPTS as any} value="1M" onChange={() => {}} ariaLabel="X" />);
    const group = screen.getByRole('radiogroup', { name: 'X' });
    expect(group.className).toMatch(/no-scrollbar/);
    expect(group.className).toMatch(/overflow-x-auto/);
  });

  it('ChipGroup è alias di Segmented', () => {
    expect(ChipGroup).toBe(Segmented);
  });

  it('size sm applica classe h-8', () => {
    render(<Segmented options={OPTS as any} value="1M" onChange={() => {}} ariaLabel="X" size="sm" />);
    const btn = screen.getByRole('radio', { name: '7g' });
    expect(btn.className).toMatch(/h-8/);
  });
});
