import { AppProviders } from "@app/providers";
import { AppRouter } from "@app/routes";

export function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}
