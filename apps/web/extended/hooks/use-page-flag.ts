export type TPageFlagHookArgs = {
  workspaceSlug: string;
};

export type TPageFlagHookReturnType = {
  isMovePageEnabled: boolean;
  isPageSharingEnabled: boolean;
};

export const usePageFlag = (_args: TPageFlagHookArgs): TPageFlagHookReturnType => ({
  isMovePageEnabled: true,
  isPageSharingEnabled: true,
});
