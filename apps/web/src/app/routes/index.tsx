import { Navigate, Route, Routes } from "react-router";
import { HomePage } from "@pages/home";
import { ApiLabPage } from "@pages/api-lab";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/lab" element={<ApiLabPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
