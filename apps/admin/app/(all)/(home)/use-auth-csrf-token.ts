/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { AuthService } from "@plane/services";

const authService = new AuthService();

/** Load a Django CSRF token once when an admin auth form mounts. */
export function useAuthCsrfToken(initialToken?: string) {
  const [csrfToken, setCsrfToken] = useState(initialToken ?? "");

  useEffect(() => {
    if (initialToken) return;

    let cancelled = false;
    void authService.requestCSRFToken().then((data) => {
      if (!cancelled && data?.csrf_token) setCsrfToken(data.csrf_token);
    });

    return () => {
      cancelled = true;
    };
  }, [initialToken]);

  return csrfToken;
}
