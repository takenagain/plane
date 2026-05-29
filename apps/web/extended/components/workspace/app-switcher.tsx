import { observer } from "mobx-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useTranslation } from "@plane/i18n";
import { PageIcon, ProjectIcon } from "@plane/propel/icons";
import { cn } from "@plane/utils";
import { useWorkspacePaths } from "@/hooks/use-workspace-paths";

export const WorkspaceAppSwitcher = observer(function WorkspaceAppSwitcher() {
  const { workspaceSlug } = useParams();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { isWikiPath } = useWorkspacePaths();

  if (!workspaceSlug) return null;

  const slug = workspaceSlug.toString();
  const projectsHref = `/${slug}/`;
  const wikiHref = `/${slug}/wiki`;

  const tabs = [
    {
      key: "projects",
      label: t("sidebar.projects"),
      href: projectsHref,
      icon: ProjectIcon,
      isActive: !isWikiPath && !pathname.includes(`/${slug}/settings`),
    },
    {
      key: "wiki",
      label: "Wiki",
      href: wikiHref,
      icon: PageIcon,
      isActive: isWikiPath,
    },
  ];

  return (
    <div className="flex items-center gap-0.5 rounded-md border-[0.5px] border-subtle bg-layer-1 p-0.5">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            "flex items-center gap-1.5 rounded px-2 py-1 text-13 font-medium transition-colors",
            tab.isActive ? "shadow-sm bg-surface-1 text-primary" : "text-secondary hover:text-primary"
          )}
        >
          <tab.icon className="size-4 shrink-0" />
          <span className="hidden sm:inline">{tab.label}</span>
        </Link>
      ))}
    </div>
  );
});
