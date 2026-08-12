import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ImageGlyph } from "@/components/editor/slash-menu";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The image node's two pre-image states.

   Server-renderable: both are pure markup driven by props. The upload itself
   is driven by the editor, which passes `progress` down.

   Per §10, the node's authoritative attribute is a Storage *path*, never a
   URL -- a signed URL saved into the document expires. Neither of these
   states holds a URL at all, which is the point at which that rule is easiest
   to keep.
   --------------------------------------------------------------------------- */

export interface ImageDropTargetProps {
  /** Highlights the frame while a file is over it. */
  isOver?: boolean;
  accept?: string;
  maxLabel?: string;
  onChoose?: () => void;
}

export function ImageDropTarget({
  isOver,
  maxLabel = "PNG, JPG or GIF, up to 10 MB",
  onChoose,
}: ImageDropTargetProps) {
  return (
    <div
      data-state={isOver ? "over" : undefined}
      className={cn(
        "flex h-48 flex-col items-center justify-center gap-2.5 rounded-card border border-dashed border-primary-line bg-primary-soft/60 transition-colors duration-state ease-kortex",
        "data-[state=over]:bg-primary-soft",
      )}
    >
      <span className="text-ui font-mid text-ink">Drop an image, or</span>
      <Button size="default" onClick={onChoose}>
        Choose a file
      </Button>
      <span className="text-meta text-muted-foreground">{maxLabel}</span>
    </div>
  );
}

export interface ImageUploadingProps {
  fileName: string;
  /** 0-100. */
  progress: number;
  onCancel?: () => void;
}

export function ImageUploading({
  fileName,
  progress,
  onCancel,
}: ImageUploadingProps) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-3.5 rounded-card border border-border bg-sidebar">
      <span className="text-state-hidden [&_svg]:size-6.5">
        <ImageGlyph />
      </span>

      <div className="flex w-70 flex-col gap-2">
        <Progress value={progress} aria-label={`Uploading ${fileName}`} />
        <div className="flex justify-between">
          <span className="truncate text-meta font-book text-ink-4">
            {fileName}
          </span>
          <span className="flex-none font-mono text-meta text-muted-foreground">
            {Math.round(progress)}%
          </span>
        </div>
      </div>

      <Button variant="link" size="md" onClick={onCancel} className="underline">
        Cancel
      </Button>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The empty document placeholder: a caret, then the invitation.
   --------------------------------------------------------------------------- */

export function EditorPlaceholder() {
  return (
    <p className="flex items-center gap-2 text-body text-muted-foreground">
      <span
        aria-hidden="true"
        className="inline-block h-4.5 w-px flex-none animate-pulse-soft bg-primary"
      />
      <span>
        Write, or press{" "}
        <kbd className="rounded-chip bg-sunken px-1.5 py-0.5 font-mono text-item font-book text-ink-4">
          /
        </kbd>{" "}
        for blocks
      </span>
    </p>
  );
}
