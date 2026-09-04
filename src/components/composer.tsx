import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { PaperclipIcon } from "@phosphor-icons/react/dist/csr/Paperclip";
import { $getRoot, COMMAND_PRIORITY_HIGH, KEY_ENTER_COMMAND } from "lexical";
import * as React from "react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type ComposerProps = {
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  disabled?: boolean;
  canSubmit?: boolean;
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

  React.useEffect(
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

function SubmitButton({
  onSubmit,
  disabled = false,
  canSubmit = false,
}: Pick<ComposerProps, "onSubmit" | "disabled" | "canSubmit">) {
  const [editor] = useLexicalComposerContext();

  return (
    <Button
      type="button"
      size="icon"
      aria-label="Send message"
      className="absolute top-0 right-0 rounded-r-md"
      disabled={disabled || !canSubmit}
      onClick={() => {
        if (disabled || !canSubmit) return;

        editor.getEditorState().read(() => {
          const value = $getRoot().getTextContent();
          onSubmit(value);
          editor.update(() => $getRoot().clear());
        });
      }}
    >
      <ArrowUpIcon />
    </Button>
  );
}

export function Composer({
  onChange,
  onSubmit,
  disabled = false,
  canSubmit = false,
  onFilesSelected,
}: ComposerProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div
        className={cn(
          "relative min-h-9 flex-1 rounded-md border bg-input/50 py-2 pr-12 pl-12 text-base md:text-sm",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          ref={fileInputRef}
          onChange={(event) => {
            onFilesSelected?.(Array.from(event.target.files ?? []));
            event.currentTarget.value = "";
          }}
        />

        <div className="absolute top-0 left-0 flex gap-2">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Attach images"
            title="Attach images"
            disabled={disabled}
            className="rounded-l-md"
            onClick={() => fileInputRef.current?.click()}
          >
            <PaperclipIcon />
          </Button>
        </div>

        <RichTextPlugin
          contentEditable={
            <ContentEditable
              aria-label="Message"
              className="max-h-32 min-h-5 w-full overflow-y-auto outline-none"
              disabled={disabled}
            />
          }
          placeholder={
            <div className="text-muted-foreground pointer-events-none absolute top-2 left-12">
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
        <SubmitButton
          onSubmit={onSubmit}
          disabled={disabled}
          canSubmit={canSubmit}
        />
      </div>
    </LexicalComposer>
  );
}
