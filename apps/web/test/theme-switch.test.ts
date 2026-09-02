import { switchTheme, THEME_SWITCH_CLASS, THEME_SWITCH_MS } from '@rondo/ui/lib/theme-switch';

const marked = () => document.documentElement.classList.contains(THEME_SWITCH_CLASS);

describe('crossing the colours between two themes', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.documentElement.classList.remove(THEME_SWITCH_CLASS);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks the document while the colours move, and unmarks it after', () => {
    const apply = jest.fn();

    switchTheme(apply);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(marked()).toBe(true);

    jest.advanceTimersByTime(THEME_SWITCH_MS);

    expect(marked()).toBe(false);
  });

  it('lets the last change of a run own the crossing, so a quick second one still moves', () => {
    switchTheme(() => {});
    jest.advanceTimersByTime(THEME_SWITCH_MS / 2);

    switchTheme(() => {});
    jest.advanceTimersByTime(THEME_SWITCH_MS / 2);

    expect(marked()).toBe(true);

    jest.advanceTimersByTime(THEME_SWITCH_MS / 2);

    expect(marked()).toBe(false);
  });
});
