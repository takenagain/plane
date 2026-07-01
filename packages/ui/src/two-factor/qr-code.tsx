/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "../utils";

export interface QRCodeProps {
  /** The server-provided `otpauth://` provisioning URI. The client never generates secrets. */
  value: string;
  size?: number;
  className?: string;
  /** Meaningful alt/description for screen readers (NFR5). Paired with a manual secret elsewhere. */
  ariaLabel?: string;
}

/**
 * Renders a server-provided `otpauth://` URI as a QR code. Always pair this with
 * a visible, copyable manual secret for accessibility (see `<TotpEnroll />`).
 */
export function QRCode({
  value,
  size = 176,
  className,
  ariaLabel = "QR code to add this account to your authenticator app",
}: QRCodeProps) {
  return (
    <div
      className={cn("inline-flex items-center justify-center rounded-md border border-strong bg-white p-3", className)}
      role="img"
      aria-label={ariaLabel}
    >
      <QRCodeSVG value={value} size={size} marginSize={2} />
    </div>
  );
}
