import { useState } from "react";
import { observer } from "mobx-react";
import { ArrowRightLeft, Search } from "lucide-react";
// plane imports
import { Logo } from "@plane/propel/emoji-icon-picker";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// hooks
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  moduleId: string;
  projectId: string;
  workspaceSlug: string;
};

export const TransferModuleModal = observer(function TransferModuleModal(props: Props) {
  const { isOpen, onClose, moduleId, projectId, workspaceSlug } = props;
  // states
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  // router
  const router = useAppRouter();
  // store hooks
  const { transferModule } = useModule();
  const { workspaceProjectIds, getProjectById } = useProject();

  // derived values — exclude the current project and apply search filter
  const filteredProjectIds = (workspaceProjectIds ?? []).filter((id) => {
    if (id === projectId) return false;
    const project = getProjectById(id);
    if (!project) return false;
    if (searchQuery.trim()) return project.name.toLowerCase().includes(searchQuery.toLowerCase());
    return true;
  });

  const handleClose = () => {
    onClose();
    setSelectedProjectId(null);
    setSearchQuery("");
    setIsTransferring(false);
  };

  const handleTransfer = async () => {
    if (!selectedProjectId) return;
    setIsTransferring(true);
    await transferModule(workspaceSlug, projectId, moduleId, selectedProjectId)
      .then(() => {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Success!",
          message: "Module transferred successfully",
        });
        router.push(`/${workspaceSlug}/projects/${projectId}/modules`);
        handleClose();
      })
      .catch(() => {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: "Failed to transfer module. Please try again.",
        });
      })
      .finally(() => setIsTransferring(false));
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="flex flex-col gap-4 p-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <ArrowRightLeft className="h-5 w-5 shrink-0 text-secondary" />
          <h3 className="text-18 font-medium 2xl:text-20">Transfer module to project</h3>
        </div>
        <p className="text-13 text-secondary">
          Select a target project to transfer this module to. All issues in this module will be moved to the selected
          project.
        </p>

        {/* Search */}
        <div className="relative">
          <Search className="text-custom-text-400 absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-custom-border-200 bg-custom-background-100 text-sm placeholder:text-custom-text-400 focus:border-custom-primary-100 w-full rounded-md border py-2 pr-3 pl-9 outline-none"
          />
        </div>

        {/* Project list */}
        <div className="max-h-60 space-y-0.5 overflow-y-auto">
          {filteredProjectIds.length === 0 ? (
            <p className="py-4 text-center text-13 text-tertiary italic">No other projects available</p>
          ) : (
            filteredProjectIds.map((id) => {
              const project = getProjectById(id);
              if (!project) return null;
              const isSelected = selectedProjectId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedProjectId(id)}
                  className={`text-sm hover:bg-custom-background-80 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                    isSelected ? "bg-custom-background-80" : ""
                  }`}
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center">
                    <Logo logo={project.logo_props} size={16} />
                  </span>
                  <span className="text-custom-text-200 flex-1 truncate">{project.name}</span>
                  {isSelected && <span className="bg-custom-primary-100 h-2 w-2 shrink-0 rounded-full" />}
                </button>
              );
            })
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={handleTransfer}
            disabled={!selectedProjectId || isTransferring}
            loading={isTransferring}
          >
            {isTransferring ? "Transferring..." : "Transfer Module"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
