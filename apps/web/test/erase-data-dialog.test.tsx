import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EraseDataDialog, type EraseIntent } from '@/components/erase-data-dialog';
import { LocaleProvider } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';
import { en } from '@/i18n/messages/en';

const confirmed = jest.fn();
const cancelled = jest.fn();

function renderDialog(intent: EraseIntent, failed: MessageKey | null = null) {
  return render(
    <LocaleProvider>
      <EraseDataDialog
        intent={intent}
        failed={failed}
        busy={false}
        onConfirm={confirmed}
        onCancel={cancelled}
      />
    </LocaleProvider>,
  );
}

const confirmButton = (intent: EraseIntent) =>
  screen.getByRole('button', {
    name: intent === 'reset' ? en['settings.resetConfirm'] : en['settings.deleteConfirm'],
  });

describe('the dialog that erases everything', () => {
  beforeEach(() => {
    confirmed.mockReset();
    cancelled.mockReset();
  });

  it('refuses to confirm until the phrase is typed out', async () => {
    const user = userEvent.setup();
    renderDialog('reset');

    expect(confirmButton('reset')).toBeDisabled();

    await user.type(screen.getByRole('textbox'), en['settings.resetPhrase']);

    expect(confirmButton('reset')).toBeEnabled();
    await user.click(confirmButton('reset'));
    expect(confirmed).toHaveBeenCalledTimes(1);
  });

  it('asks each action for its own phrase, so one does not unlock the other', async () => {
    const user = userEvent.setup();
    renderDialog('delete');

    await user.type(screen.getByRole('textbox'), en['settings.resetPhrase']);

    expect(en['settings.deletePhrase']).not.toBe(en['settings.resetPhrase']);
    expect(confirmButton('delete')).toBeDisabled();

    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), en['settings.deletePhrase']);

    expect(confirmButton('delete')).toBeEnabled();
  });

  it('forgives the spaces around the phrase and refuses another casing of it', async () => {
    const user = userEvent.setup();
    renderDialog('reset');
    const field = screen.getByRole('textbox');

    await user.type(field, `  ${en['settings.resetPhrase']}  `);
    expect(confirmButton('reset')).toBeEnabled();

    await user.clear(field);
    await user.type(field, en['settings.resetPhrase'].toLowerCase());
    expect(confirmButton('reset')).toBeDisabled();
  });

  it('shows a refusal where the reader is looking, inside itself', () => {
    renderDialog('delete', 'settings.eraseFailedAccount');

    expect(screen.getByRole('alert')).toHaveTextContent(en['settings.eraseFailedAccount']);
  });

  it('closes on cancel without confirming anything', async () => {
    const user = userEvent.setup();
    renderDialog('reset');

    await user.click(screen.getByRole('button', { name: en['settings.eraseCancel'] }));

    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(confirmed).not.toHaveBeenCalled();
  });
});

describe('the phrase the dialog asks for', () => {
  it.each([
    ['reset' as const, en['settings.resetPhrase']],
    ['delete' as const, en['settings.deletePhrase']],
  ])('names the word to type on the %s action', (intent, phrase) => {
    renderDialog(intent);

    expect(screen.getByLabelText(new RegExp(phrase))).toBe(screen.getByRole('textbox'));
  });
});
