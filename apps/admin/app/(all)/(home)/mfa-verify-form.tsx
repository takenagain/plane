/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
// plane internal packages
import { API_BASE_URL } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { AuthService } from "@plane/services";
import { Input, Spinner } from "@plane/ui";
// components
import { Banner } from "@/components/common/banner";
import { FormHeader } from "@/components/instance/form-header";
import { AuthHeader } from "./auth-header";

const authService = new AuthService();

/**
 * Minimal admin login MFA challenge. Mirrors the native-form-POST + redirect
 * pattern used by `InstanceSignInForm`, posting the TOTP / recovery code to the
 * shared `auth/mfa/verify/` endpoint. Hardware-key (WebAuthn) admin login is not
 * covered by this minimal mirror — see frontend integration notes.
 */
export function InstanceMfaVerifyForm() {
  const searchParams = useSearchParams();
  const errorMessage = searchParams.get("error_message") || undefined;
  const nextPath = searchParams.get("next_path") || undefined;

  const [csrfToken, setCsrfToken] = useState<string | undefined>(undefined);
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (csrfToken === undefined)
      authService.requestCSRFToken().then((data) => data?.csrf_token && setCsrfToken(data.csrf_token));
  }, [csrfToken]);

  const isButtonDisabled = isSubmitting || !code.trim() || (!useRecovery && code.trim().length !== 6);

  return (
    <>
      <AuthHeader />
      <div className="mt-10 flex w-full flex-grow flex-col items-center justify-center py-6">
        <div className="relative flex w-full max-w-[22.5rem] flex-col gap-6">
          <FormHeader
            heading="Two-step verification"
            subHeading="Enter the code from your authenticator app to finish signing in."
          />
          <form
            className="space-y-4"
            method="POST"
            action={`${API_BASE_URL}/auth/mfa/verify/`}
            onSubmit={() => setIsSubmitting(true)}
            onError={() => setIsSubmitting(false)}
          >
            {errorMessage && <Banner type="error" message={errorMessage} />}
            <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
            {nextPath && <input type="hidden" name="next_path" value={nextPath} />}

            <div className="w-full space-y-1">
              <label className="text-13 font-medium text-tertiary" htmlFor={useRecovery ? "recovery_code" : "code"}>
                {useRecovery ? "Recovery code" : "Authentication code"} <span className="text-danger-primary">*</span>
              </label>
              <Input
                className="w-full border border-subtle !bg-surface-1 placeholder:text-placeholder"
                id={useRecovery ? "recovery_code" : "code"}
                name={useRecovery ? "recovery_code" : "code"}
                type="text"
                inputSize="md"
                inputMode={useRecovery ? "text" : "numeric"}
                placeholder={useRecovery ? "xxxx-xxxx" : "123456"}
                value={code}
                onChange={(e) => setCode(useRecovery ? e.target.value : e.target.value.replace(/\D/g, "").slice(0, 6))}
                autoComplete="one-time-code"
                autoFocus
              />
            </div>

            <div className="py-2">
              <Button type="submit" size="xl" className="w-full" disabled={isButtonDisabled}>
                {isSubmitting ? <Spinner height="20px" width="20px" /> : "Verify"}
              </Button>
            </div>

            <button
              type="button"
              onClick={() => {
                setUseRecovery((prev) => !prev);
                setCode("");
              }}
              className="text-12 text-tertiary hover:text-secondary"
            >
              {useRecovery ? "Use an authentication code" : "Use a recovery code"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
