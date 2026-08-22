export const ru = {
  'common.themeToggle.trigger': 'Переключить тему',
  'common.themeToggle.light': 'Светлая',
  'common.themeToggle.dark': 'Тёмная',
  'common.themeToggle.system': 'Системная',
  'common.localeSwitcher.ariaLabel': 'Сменить язык',

  'home.subtitle': 'Каркас приложения · Фаза 0 (F0.6).',
  'home.demoTitle': 'Демо компонентов',
  'home.demoDescription': 'shadcn/ui + тема Ocean Breeze',
  'home.buttons.default': 'По умолчанию',
  'home.buttons.secondary': 'Вторичная',
  'home.buttons.outline': 'Контур',
  'home.buttons.ghost': 'Прозрачная',
  'home.buttons.destructive': 'Опасная',
  'home.budgetNameLabel': 'Название бюджета',
  'home.budgetNamePlaceholder': 'Например, «Семейный бюджет»',
  'home.apiLabel': 'API',
  'home.callerLabel': 'Вы вошли как',
  'home.callerLoading': 'проверяем…',
  'home.callerSignedOut': 'вы не вошли',
  'home.callerUnavailable': 'API не ответил',

  'budget.title': 'Бюджет',
  'budget.comingSoon': 'Экран бюджета появится в Фазе 3.',
} as const;

export type MessageKey = keyof typeof ru;
