import { AppProviders } from "@app/providers";
import { HomePage } from "@pages/home";

export function App() {
  return (
    <AppProviders>
      <HomePage />
    </AppProviders>
  );
}
