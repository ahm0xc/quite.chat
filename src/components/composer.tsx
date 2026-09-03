import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { $getRoot, COMMAND_PRIORITY_HIGH, KEY_ENTER_COMMAND } from "lexical";
import { useEffect } from "react";

import { cn } from "~/lib/utils";

type ComposerProps = {
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  disabled?: boolean;
  onFilesSelected?: (files: Array<File>) => void;
};

const initialConfig = {
  namespace: "QuiteChatComposer",
  theme: {
    paragraph: "m-0",
  },
  onError(error: Error) {
    throw error;
  },
};

function SubmitOnEnterPlugin({ onSubmit }: Pick<ComposerProps, "onSubmit">) {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (event?.shiftKey) return false;

          event?.preventDefault();

          editor.getEditorState().read(() => {
            const value = $getRoot().getTextContent().trim();
            if (!value) return;

            onSubmit(value);
            editor.update(() => $getRoot().clear());
          });

          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor, onSubmit],
  );

  return null;
}

export function Composer({
  onChange,
  onSubmit,
  disabled = false,
  onFilesSelected,
}: ComposerProps) {
  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div
        className={cn(
          "relative min-h-10 flex-1 rounded-md border px-3 py-2 text-base md:text-sm",
          "focus-within:ring-2 focus-within:ring-ring",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          id="message-attachments"
          onChange={(event) => {
            onFilesSelected?.(Array.from(event.target.files ?? []));
            event.currentTarget.value = "";
          }}
        />
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              aria-label="Message"
              className="max-h-32 min-h-5 overflow-y-auto outline-none"
              disabled={disabled}
            />
          }
          placeholder={
            <div className="text-muted-foreground pointer-events-none absolute top-2 left-3">
              Type a message...
            </div>
          }
          ErrorBoundary={({ children }) => children}
        />
        <OnChangePlugin
          onChange={(editorState) => {
            editorState.read(() => onChange($getRoot().getTextContent()));
          }}
        />
        <SubmitOnEnterPlugin onSubmit={onSubmit} />
        <label
          htmlFor="message-attachments"
          className="text-muted-foreground hover:text-foreground absolute right-3 bottom-2 cursor-pointer text-xs"
        >
          Attach
        </label>
      </div>
    </LexicalComposer>
  );
}
