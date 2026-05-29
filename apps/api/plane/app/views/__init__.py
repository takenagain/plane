# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from .analytic.advance import (
    AdvanceAnalyticsChartEndpoint,
    AdvanceAnalyticsEndpoint,
    AdvanceAnalyticsStatsEndpoint,
    ProjectTimeLoggedExportEndpoint,
    TimeLoggedExportEndpoint,
)
from .analytic.base import (
    AnalyticsEndpoint,
    AnalyticViewViewset,
    DefaultAnalyticsEndpoint,
    ExportAnalyticsEndpoint,
    ProjectStatsEndpoint,
    SavedAnalyticEndpoint,
)
from .analytic.project_analytics import (
    ProjectAdvanceAnalyticsChartEndpoint,
    ProjectAdvanceAnalyticsEndpoint,
    ProjectAdvanceAnalyticsStatsEndpoint,
)
from .api import ApiTokenEndpoint
from .asset.base import FileAssetEndpoint, FileAssetViewSet, UserAssetsEndpoint
from .asset.v2 import (
    AssetCheckEndpoint,
    AssetRestoreEndpoint,
    DuplicateAssetEndpoint,
    ProjectAssetDownloadEndpoint,
    ProjectAssetEndpoint,
    ProjectBulkAssetEndpoint,
    StaticFileAssetEndpoint,
    UserAssetsV2Endpoint,
    WorkspaceAssetDownloadEndpoint,
    WorkspaceFileAssetEndpoint,
)
from .base import BaseAPIView, BaseViewSet
from .cycle.archive import CycleArchiveUnarchiveEndpoint
from .cycle.base import (
    CycleAnalyticsEndpoint,
    CycleDateCheckEndpoint,
    CycleFavoriteViewSet,
    CycleProgressEndpoint,
    CycleUserPropertiesEndpoint,
    CycleViewSet,
    TransferCycleIssueEndpoint,
)
from .cycle.issue import CycleIssueViewSet
from .error_404 import custom_404_view
from .estimate.base import (
    BulkEstimatePointEndpoint,
    EstimatePointEndpoint,
    ProjectEstimatePointEndpoint,
)
from .exporter.base import ExportIssuesEndpoint
from .external.base import (
    GPTIntegrationEndpoint,
    UnsplashEndpoint,
    WorkspaceGPTIntegrationEndpoint,
)
from .intake.base import (
    IntakeIssueViewSet,
    IntakeViewSet,
    IntakeWorkItemDescriptionVersionEndpoint,
)
from .issue.activity import IssueActivityEndpoint
from .issue.archive import BulkArchiveIssuesEndpoint, IssueArchiveViewSet
from .issue.attachment import (
    IssueAttachmentEndpoint,
    # V2
    IssueAttachmentV2Endpoint,
)
from .issue.base import (
    BulkDeleteIssuesEndpoint,
    DeletedIssuesListViewSet,
    IssueBulkUpdateDateEndpoint,
    IssueDetailEndpoint,
    IssueDetailIdentifierEndpoint,
    IssueListEndpoint,
    IssueMetaEndpoint,
    IssuePaginatedViewSet,
    IssueViewSet,
    ProjectUserDisplayPropertyEndpoint,
)
from .issue.comment import CommentReactionViewSet, IssueCommentViewSet
from .issue.label import BulkCreateIssueLabelsEndpoint, LabelViewSet
from .issue.link import IssueLinkViewSet
from .issue.reaction import IssueReactionViewSet
from .issue.relation import IssueRelationViewSet
from .issue.sub_issue import SubIssuesEndpoint
from .issue.subscriber import IssueSubscriberViewSet
from .issue.version import IssueVersionEndpoint, WorkItemDescriptionVersionEndpoint
from .issue.worklog import WorklogViewSet
from .module.archive import ModuleArchiveUnarchiveEndpoint
from .module.base import (
    ModuleFavoriteViewSet,
    ModuleLinkViewSet,
    ModuleTransferEndpoint,
    ModuleUserPropertiesEndpoint,
    ModuleViewSet,
)
from .module.issue import ModuleIssueViewSet
from .notification.base import (
    MarkAllReadNotificationViewSet,
    NotificationViewSet,
    UnreadNotificationEndpoint,
    UserNotificationPreferenceEndpoint,
)
from .page.base import (
    PageDuplicateEndpoint,
    PageFavoriteViewSet,
    PagesDescriptionViewSet,
    PageViewSet,
)
from .page.version import PageVersionEndpoint
from .project.base import (
    DeployBoardViewSet,
    ProjectArchiveUnarchiveEndpoint,
    ProjectFavoritesViewSet,
    ProjectIdentifierEndpoint,
    ProjectUserViewsEndpoint,
    ProjectViewSet,
)
from .project.invite import (
    ProjectInvitationsViewset,
    ProjectJoinEndpoint,
    UserProjectInvitationsViewset,
)
from .project.member import (
    ProjectMemberPreferenceEndpoint,
    ProjectMemberUserEndpoint,
    ProjectMemberViewSet,
    UserProjectRolesEndpoint,
)
from .search.base import GlobalSearchEndpoint, SearchEndpoint
from .search.issue import IssueSearchEndpoint
from .state.base import IntakeStateEndpoint, StateViewSet
from .timezone.base import TimezoneEndpoint
from .user.base import (
    AccountEndpoint,
    ProfileEndpoint,
    UpdateUserOnBoardedEndpoint,
    UpdateUserTourCompletedEndpoint,
    UserActivityEndpoint,
    UserEndpoint,
    UserSessionEndpoint,
)
from .view.base import (
    IssueViewFavoriteViewSet,
    IssueViewViewSet,
    WorkspaceViewIssuesViewSet,
    WorkspaceViewViewSet,
)
from .webhook.base import (
    WebhookEndpoint,
    WebhookLogsEndpoint,
    WebhookSecretRegenerateEndpoint,
)
from .workspace.base import (
    ExportWorkspaceUserActivityEndpoint,
    UserWorkspaceDashboardEndpoint,
    UserWorkSpacesEndpoint,
    WorkSpaceAvailabilityCheckEndpoint,
    WorkspaceThemeViewSet,
    WorkSpaceViewSet,
)
from .workspace.cycle import WorkspaceCyclesEndpoint
from .workspace.draft import WorkspaceDraftIssueViewSet
from .workspace.estimate import WorkspaceEstimatesEndpoint
from .workspace.favorite import (
    WorkspaceFavoriteEndpoint,
    WorkspaceFavoriteGroupEndpoint,
)
from .workspace.home import WorkspaceHomePreferenceViewSet
from .workspace.invite import (
    UserWorkspaceInvitationsViewSet,
    WorkspaceInvitationsViewset,
    WorkspaceJoinEndpoint,
)
from .workspace.label import WorkspaceLabelsEndpoint
from .workspace.member import (
    WorkspaceMemberUserEndpoint,
    WorkspaceMemberUserViewsEndpoint,
    WorkSpaceMemberViewSet,
    WorkspaceProjectMemberEndpoint,
)
from .workspace.module import WorkspaceModulesEndpoint
from .workspace.quick_link import QuickLinkViewSet
from .workspace.recent_visit import UserRecentVisitViewSet
from .workspace.state import WorkspaceStatesEndpoint
from .workspace.sticky import WorkspaceStickyViewSet
from .workspace.user import (
    UserActivityGraphEndpoint,
    UserIssueCompletedGraphEndpoint,
    UserLastProjectWithWorkspaceEndpoint,
    WorkspaceUserActivityEndpoint,
    WorkspaceUserProfileEndpoint,
    WorkspaceUserProfileIssuesEndpoint,
    WorkspaceUserProfileStatsEndpoint,
    WorkspaceUserPropertiesEndpoint,
)
from .workspace.user_time_analytics import (
    UserTimeAnalyticsChartsEndpoint,
    UserTimeAnalyticsCommentSignalsEndpoint,
    UserTimeAnalyticsExportEndpoint,
    UserTimeAnalyticsRankingsEndpoint,
    UserTimeAnalyticsSummaryEndpoint,
    UserTimeAnalyticsWorklogsEndpoint,
)
from .workspace.user_preference import WorkspaceUserPreferenceViewSet
