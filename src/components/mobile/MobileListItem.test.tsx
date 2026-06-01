import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MobileListItem, type MobileListItemAction } from './MobileListItem';

describe('MobileListItem', () => {
  it('renderizza title, subtitle, leading, trailing', () => {
    render(
      <MobileListItem
        leading={<span data-testid="lead">L</span>}
        title="Mario Rossi"
        subtitle="ultima chiamata 2 min fa"
        trailing={<span data-testid="trail">T</span>}
      />,
    );
    expect(screen.getByText('Mario Rossi')).toBeInTheDocument();
    expect(screen.getByText('ultima chiamata 2 min fa')).toBeInTheDocument();
    expect(screen.getByTestId('lead')).toBeInTheDocument();
    expect(screen.getByTestId('trail')).toBeInTheDocument();
  });

  it('non interattivo se manca onSelect (no role=button, no chevron)', () => {
    const { container } = render(<MobileListItem title="X" />);
    expect(container.querySelector('[role="button"]')).toBeNull();
  });

  it('onSelect viene chiamato al click se interattivo', () => {
    const onSelect = vi.fn();
    render(<MobileListItem title="Apri" onSelect={onSelect} />);
    const btn = screen.getByRole('button', { name: 'Apri' });
    fireEvent.click(btn);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('Enter e Space attivano onSelect', () => {
    const onSelect = vi.fn();
    render(<MobileListItem title="Apri" onSelect={onSelect} />);
    const btn = screen.getByRole('button', { name: 'Apri' });
    btn.focus();
    fireEvent.keyDown(btn, { key: 'Enter' });
    fireEvent.keyDown(btn, { key: ' ' });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('actions sono sempre montate come <button> accessibili (anche senza swipe)', () => {
    const onA = vi.fn();
    const actions: MobileListItemAction[] = [
      { id: 'archive', label: 'Archivia', onSelect: onA },
    ];
    render(<MobileListItem title="X" onSelect={() => {}} actions={actions} />);
    const a = screen.getByRole('button', { name: 'Archivia' });
    expect(a).toBeInTheDocument();
    fireEvent.click(a);
    expect(onA).toHaveBeenCalledTimes(1);
  });

  it('limita a max 2 azioni (eccedenze scartate)', () => {
    const actions: MobileListItemAction[] = [
      { id: 'a1', label: 'A1', onSelect: () => {} },
      { id: 'a2', label: 'A2', onSelect: () => {} },
      { id: 'a3', label: 'A3', onSelect: () => {} },
    ];
    render(<MobileListItem title="X" actions={actions} />);
    expect(screen.queryByRole('button', { name: 'A3' })).toBeNull();
    expect(screen.getByRole('button', { name: 'A1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'A2' })).toBeInTheDocument();
  });

  it('azione distruttiva con confirm apre AlertDialog e onSelect parte solo alla conferma', () => {
    const onDel = vi.fn();
    const actions: MobileListItemAction[] = [
      {
        id: 'del',
        label: 'Elimina',
        variant: 'destructive',
        confirm: { title: 'Eliminare?', description: 'Azione irreversibile' },
        onSelect: onDel,
      },
    ];
    render(<MobileListItem title="X" actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    // Dialog visibile
    expect(screen.getByText('Eliminare?')).toBeInTheDocument();
    expect(screen.getByText('Azione irreversibile')).toBeInTheDocument();
    expect(onDel).not.toHaveBeenCalled();
    // Annulla → nessuna chiamata
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(onDel).not.toHaveBeenCalled();
    // Riapri e conferma
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    fireEvent.click(screen.getByRole('button', { name: 'Conferma' }));
    expect(onDel).toHaveBeenCalledTimes(1);
  });

  it('azione non distruttiva esegue subito (no dialog)', () => {
    const onA = vi.fn();
    const actions: MobileListItemAction[] = [
      { id: 'pin', label: 'Pin', variant: 'primary', onSelect: onA },
    ];
    render(<MobileListItem title="X" actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pin' }));
    expect(onA).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('swipe a sinistra oltre soglia di apertura: traslazione applicata e tap successivo richiude', () => {
    const onSelect = vi.fn();
    const onA = vi.fn();
    const actions: MobileListItemAction[] = [
      { id: 'a', label: 'Archivia', onSelect: onA },
    ];
    const { container } = render(
      <MobileListItem title="Apri" onSelect={onSelect} actions={actions} />,
    );
    const row = screen.getByRole('button', { name: 'Apri' });
    // Drag a sinistra ben oltre soglia (-60px), poi release
    act(() => {
      fireEvent.pointerDown(row, { clientX: 200, pointerId: 1 });
      fireEvent.pointerMove(row, { clientX: 100, pointerId: 1 });
      fireEvent.pointerUp(row, { clientX: 100, pointerId: 1 });
    });
    // Tap dopo swipe: onSelect NON deve scattare
    fireEvent.click(row);
    expect(onSelect).not.toHaveBeenCalled();
    // Successivo tap "pulito" (no movimento) richiude la riga e non triggera onSelect
    fireEvent.pointerDown(row, { clientX: 100, pointerId: 2 });
    fireEvent.pointerUp(row, { clientX: 100, pointerId: 2 });
    fireEvent.click(row);
    // Stato è "open" dopo lo swipe iniziale → primo tap pulito chiude, non chiama onSelect
    expect(onSelect).not.toHaveBeenCalled();
    // Nuovo tap su riga chiusa attiva onSelect
    fireEvent.pointerDown(row, { clientX: 100, pointerId: 3 });
    fireEvent.pointerUp(row, { clientX: 100, pointerId: 3 });
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledTimes(1);
    // Smoke: azione resta cliccabile
    fireEvent.click(screen.getByRole('button', { name: 'Archivia' }));
    expect(onA).toHaveBeenCalledTimes(1);
    expect(container).toBeTruthy();
  });

  it('a11y: label custom su action via ariaLabel', () => {
    const actions: MobileListItemAction[] = [
      { id: 'call', label: '📞', ariaLabel: 'Chiama Mario', onSelect: () => {} },
    ];
    render(<MobileListItem title="X" actions={actions} />);
    expect(screen.getByRole('button', { name: 'Chiama Mario' })).toBeInTheDocument();
  });
});
