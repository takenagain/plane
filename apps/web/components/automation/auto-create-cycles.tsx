import { useMemo } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
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

export const AutoCreateCycles = observer(function AutoCreateCycles(props: Props) {
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

  const isEnabled = useMemo(() => !!currentProjectDetails?.auto_create_cycles, [currentProjectDetails]);

  const handleToggle = async () => {
    if (isEnabled) {
      // Turning off auto-create also disables auto-transfer
      await handleChange({ auto_create_cycles: false, auto_transfer_cycle_issues: false });
    } else {
      await handleChange({ auto_create_cycles: true });
    }
  };

  return (
    <div className="flex flex-col gap-4 border-b border-subtle py-2">
      <div className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-sm bg-layer-2">
          <RefreshCw className="size-4 shrink-0 text-primary" />
        </div>
        <SettingsControlItem
          title="Auto-create cycles"
          description="Automatically create the next two two-week cycles (sprints) when the current cycle ends."
          control={<ToggleSwitch value={isEnabled} onChange={handleToggle} size="sm" disabled={!isAdmin} />}
        />
      </div>
    </div>
  );
});
