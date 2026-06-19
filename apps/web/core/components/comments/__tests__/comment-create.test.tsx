import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TCommentsOperations } from "@plane/types";
import { CommentCreate } from "../comment-create";

const liteTextEditorMock = vi.hoisted(() =>
  vi.fn(({ id }: { id: string }) => <div data-testid="lite-text-editor" data-editor-id={id} />)
);

vi.mock("@/components/editor/lite-text", () => ({
  LiteTextEditor: liteTextEditorMock,
}));

vi.mock("@/hooks/store/use-workspace", () => ({
  useWorkspace: () => ({
    getWorkspaceBySlug: () => ({ id: "workspace-1" }),
  }),
}));

const activityOperations = {
  createComment: vi.fn(),
  updateComment: vi.fn(),
  removeComment: vi.fn(),
  uploadCommentAsset: vi.fn(),
  duplicateCommentAsset: vi.fn(),
} as unknown as TCommentsOperations;

describe("CommentCreate", () => {
  beforeEach(() => {
    liteTextEditorMock.mockClear();
  });

  it("disables external value syncing so the editor is not reset while typing", () => {
    render(
      <CommentCreate
        workspaceSlug="acme"
        entityId="issue-1"
        activityOperations={activityOperations}
        projectId="project-1"
      />
    );

    expect(screen.getByTestId("lite-text-editor")).toHaveAttribute("data-editor-id", "add_comment_issue-1");

    const editorProps = liteTextEditorMock.mock.calls[0]?.[0];
    expect(editorProps?.value).toBeNull();
    expect(editorProps?.editable).toBe(true);
  });
});
