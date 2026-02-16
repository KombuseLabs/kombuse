import * as React from "react";
import { cn } from "../lib/utils";
import { useAutoResizeTextarea } from "../hooks/use-auto-resize-textarea";

interface TextareaProps extends React.ComponentProps<"textarea"> {
  autoResize?: boolean;
  autoResizeMaxHeight?: number | string;
}

function Textarea({
  className,
  autoResize,
  autoResizeMaxHeight,
  ref: externalRef,
  value,
  ...props
}: TextareaProps) {
  const { textareaRef: autoResizeRef } = useAutoResizeTextarea({
    value: String(value ?? ''),
    maxHeight: autoResizeMaxHeight,
    enabled: !!autoResize,
  });

  const mergedRef = React.useCallback(
    (node: HTMLTextAreaElement | null) => {
      autoResizeRef.current = node;
      if (typeof externalRef === 'function') {
        externalRef(node);
      } else if (externalRef) {
        externalRef.current = node;
      }
    },
    [autoResizeRef, externalRef],
  );

  return (
    <textarea
      data-slot="textarea"
      ref={autoResize ? mergedRef : externalRef as React.Ref<HTMLTextAreaElement>}
      value={value}
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base font-sans shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        autoResize && "resize-none",
        className
      )}
      {...props}
    />
  );
}

export { Textarea, type TextareaProps };
