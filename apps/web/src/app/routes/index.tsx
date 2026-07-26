import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "@widgets/app-shell";
import { RequireCapability } from "@entities/user";
import { HomePage } from "@pages/home";
import { NotesListPage } from "@pages/notes-list";
import { NoteDetailPage } from "@pages/note-detail";
import { AdminPage } from "@pages/admin";
import { ApiLabPage } from "@pages/api-lab";

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/notes" element={<NotesListPage />} />
        <Route path="/notes/:noteId" element={<NoteDetailPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route
          path="/lab"
          element={
            <RequireCapability capability="access_api_lab">
              <ApiLabPage />
            </RequireCapability>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
