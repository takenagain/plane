import type { RefObject } from "react";
import type { IGanttBlock } from "@plane/types";

type LeftDependencyDraggableProps = {
  block: IGanttBlock;
  ganttContainerRef: RefObject<HTMLDivElement | null>;
};

export function LeftDependencyDraggable(_props: LeftDependencyDraggableProps) {
  return <></>;
}
