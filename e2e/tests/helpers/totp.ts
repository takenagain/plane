import { createGuardrails, generateSync } from "otplib";

// E2E seeds use the standard RFC test secret (10 bytes); otplib v13 defaults to 16-byte minimum.
const e2eGuardrails = createGuardrails({ MIN_SECRET_BYTES: 10 });

export function generateE2eTotpCode(secret: string): string {
  return generateSync({ secret, guardrails: e2eGuardrails });
}
