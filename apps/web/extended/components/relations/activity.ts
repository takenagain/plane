import type { TIssueActivity } from "@plane/types";

export const getRelationActivityContent = (activity: TIssueActivity | undefined): string | undefined => {
  if (!activity) return;

  switch (activity.field) {
    case "blocking":
      return activity.old_value === "" ? `marked this work item as blocking ` : `removed the blocking relation to `;
    case "blocked_by":
      return activity.old_value === ""
        ? `marked this work item as being blocked by `
        : `removed the blocking relation to `;
    case "duplicate":
      return activity.old_value === ""
        ? `marked this work item as a duplicate of `
        : `removed the duplicate relation with `;
    case "relates_to":
      return activity.old_value === "" ? `marked this work item as relating to ` : `removed the relation to `;
  }

  return;
};
