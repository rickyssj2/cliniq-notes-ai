import { beforeEach, describe, expect, it } from "vitest";
import { isDraftDirty, useEditorDraftStore } from "./editor-draft-store";

describe("editorDraftStore", () => {
  beforeEach(() => {
    useEditorDraftStore.getState().clear("note_1");
  });

  it("acknowledgeSave advances base but keeps typed-ahead edits dirty", () => {
    const store = useEditorDraftStore.getState();
    store.hydrate({
      noteId: "note_1",
      baseVersionId: "ver_1",
      content: { sections: { S: "sent", O: "", A: "", P: "" } },
    });
    // User keeps typing while the POST of "sent" is in flight.
    useEditorDraftStore.getState().setSection("note_1", "S", "sent + more");

    useEditorDraftStore
      .getState()
      .acknowledgeSave("note_1", "ver_2", { S: "sent", O: "", A: "", P: "" });

    const draft = useEditorDraftStore.getState().drafts.note_1;
    expect(draft?.baseVersionId).toBe("ver_2");
    expect(draft?.baseSections.S).toBe("sent");
    expect(draft?.sections.S).toBe("sent + more");
    expect(draft?.dirty.S).toBe(true);
    expect(isDraftDirty(draft)).toBe(true);
  });

  it("acknowledgeSave marks fully-caught-up draft clean", () => {
    const store = useEditorDraftStore.getState();
    store.hydrate({
      noteId: "note_1",
      baseVersionId: "ver_1",
      content: { sections: { S: "sent", O: "", A: "", P: "" } },
    });
    useEditorDraftStore.getState().setSection("note_1", "S", "sent v2");

    useEditorDraftStore
      .getState()
      .acknowledgeSave("note_1", "ver_2", { S: "sent v2", O: "", A: "", P: "" });

    expect(isDraftDirty(useEditorDraftStore.getState().drafts.note_1)).toBe(
      false,
    );
  });

  it("acknowledgeSave is a no-op when the tip was already acked (HTTP/WS race)", () => {
    const store = useEditorDraftStore.getState();
    store.hydrate({
      noteId: "note_1",
      baseVersionId: "ver_2",
      content: { sections: { S: "acked", O: "", A: "", P: "" } },
    });
    useEditorDraftStore.getState().setSection("note_1", "S", "typed more");

    useEditorDraftStore
      .getState()
      .acknowledgeSave("note_1", "ver_2", { S: "acked", O: "", A: "", P: "" });

    const draft = useEditorDraftStore.getState().drafts.note_1;
    expect(draft?.sections.S).toBe("typed more");
    expect(draft?.dirty.S).toBe(true);
  });

  it("hydrate never replaces a dirty draft, even when the server tip moved", () => {
    const store = useEditorDraftStore.getState();
    store.hydrate({
      noteId: "note_1",
      baseVersionId: "ver_1",
      content: { sections: { S: "base", O: "", A: "", P: "" } },
    });
    useEditorDraftStore.getState().setSection("note_1", "S", "unsaved work");

    // Refetch after someone else's save must not clobber local edits.
    useEditorDraftStore.getState().hydrate({
      noteId: "note_1",
      baseVersionId: "ver_2",
      content: { sections: { S: "server text", O: "", A: "", P: "" } },
    });

    const draft = useEditorDraftStore.getState().drafts.note_1;
    expect(draft?.sections.S).toBe("unsaved work");
    expect(draft?.baseVersionId).toBe("ver_1");
  });
});
