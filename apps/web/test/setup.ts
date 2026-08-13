import '@testing-library/jest-dom';

import type { ReactNode } from 'react';

// Clerk's widgets subscribe to ClerkProvider context and talk to clerk-js at runtime;
// unit tests cover our markup, not Clerk's. Keep the real module surface (hooks etc.)
// so unmocked exports don't silently become `undefined`, and make every widget the app
// renders inert.
jest.mock('@clerk/nextjs', () => ({
  ...jest.requireActual('@clerk/nextjs'),
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  SignIn: () => null,
  UserButton: () => null,
}));

// Everything below patches gaps in jsdom, so it is guarded on there being a browser-like
// global at all: server-side suites (route handlers — `@jest-environment node`) share this
// file for the module mocks above, and have no `window` to patch.
if (typeof window !== 'undefined') {
  // next-themes reads the OS preference via matchMedia; jsdom doesn't implement it.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  // Radix primitives (dropdown-menu, etc.) use the Pointer Events API and
  // ResizeObserver for positioning; jsdom implements neither.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
}
