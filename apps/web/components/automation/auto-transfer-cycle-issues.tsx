import { useMemo } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import type { IProject } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";
// components
import { SettingsControlItem } from "@/components/settings/control-item";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";

type Props = {
  handleChange: (formData: Partial<IProject>) => Promise<void>;
};

export const AutoTransferCycleIssues = observer(function AutoTransferCycleIssues(props: Props) {
  const { handleChange } = props;
  const { workspaceSlug } = useParams();
  const { allowPermissions } = useUserPermissions();
  const { currentProjectDetails } = useProject();

  const isAdmin = allowPermissions(
    [EUserPermissions.ADMIN],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug?.toString(),
    currentProjectDetails?.id
  );

  const autoCreateEnabled = useMemo(() => !!currentProjectDetails?.auto_create_cycles, [currentProjectDetails]);
  const isEnabled = useMemo(() => !!currentProjectDetails?.auto_transfer_cycle_issues, [currentProjectDetails]);

  const handleToggle = async () => {
    await handleChange({ auto_transfer_cycle_issues: !isEnabled });
  };

  const isDisabled = !isAdmin || !autoCreateEnabled;

  return (
    <div className="flex flex-col gap-4 border-b border-subtle py-2">
      <div className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-sm bg-layer-2">
          <ArrowRightLeft className="size-4 shrink-0 text-primary" />
        </div>
        <SettingsControlItem
          title="Auto-transfer work items"
          description={
            autoCreateEnabled
              ? "Automatically transfer incomplete work items to the next cycle when the current cycle ends."
              : "Enable auto-create cycles first to use this automation."
          }
          control={<ToggleSwitch value={isEnabled} onChange={handleToggle} size="sm" disabled={isDisabled} />}
        />
      </div>
    </div>
  );
});
