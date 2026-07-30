import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import type { ReactNode } from "react";
import { AppShell } from "@widgets/app-shell";
import { PageFallback } from "@shared/ui/page-fallback";

const HomePage = lazy(() =>
  import("@pages/home").then((m) => ({ default: m.HomePage })),
);
const NotesListPage = lazy(() =>
  import("@pages/notes-list").then((m) => ({ default: m.NotesListPage })),
);
const NoteDetailPage = lazy(() =>
  import("@pages/note-detail").then((m) => ({ default: m.NoteDetailPage })),
);
const AdminPage = lazy(() =>
  import("@pages/admin").then((m) => ({ default: m.AdminPage })),
);

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route
          path="/"
          element={
            <LazyPage>
              <HomePage />
            </LazyPage>
          }
        />
        <Route
          path="/notes"
          element={
            <LazyPage>
              <NotesListPage />
            </LazyPage>
          }
        />
        <Route
          path="/notes/:noteId"
          element={
            <LazyPage>
              <NoteDetailPage />
            </LazyPage>
          }
        />
        <Route
          path="/admin"
          element={
            <LazyPage>
              <AdminPage />
            </LazyPage>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
