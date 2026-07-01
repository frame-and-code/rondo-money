import { API_BASE_URL } from '@/lib/api';

// Start page (F0.5). A real landing/dashboard comes with the screens in Phase 3; for now
// this proves the App Router renders and surfaces the env-driven API base URL.
// Left intentionally unstyled — styling is Tailwind + shadcn/ui (F0.6), not hand-written CSS.
export default function HomePage() {
  return (
    <main>
      <h1>Fin Flow AI</h1>
      <p>Каркас приложения · Фаза 0 (F0.5).</p>
      <p>
        API: <code>{API_BASE_URL}</code>
      </p>
    </main>
  );
}
