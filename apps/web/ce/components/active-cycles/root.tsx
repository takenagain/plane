/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { ContentWrapper } from "@plane/ui";

export function WorkspaceActiveCyclesRoot() {
  const { t } = useTranslation();

  return (
    <ContentWrapper className="gap-4">
      <p className="text-14 text-tertiary">{t("active_cycles_description")}</p>
    </ContentWrapper>
  );
}
