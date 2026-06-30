# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Local 2FA / MFA service helpers.

This module centralises every piece of MFA business logic that is shared
between the login-flow views (``auth/mfa/*``) and the management views
(``api/users/me/mfa/*``):

- TOTP secret generation / provisioning URI / verification (``pyotp``).
- Recovery-code generation, hashing and single-use consumption.
- WebAuthn registration / authentication ceremonies (``py_webauthn``),
  including the server-side hardware-security-key classification used by
  lockdown mode.
- Redis-backed challenge storage (single-use, short TTL) and a Redis
  per-user attempt counter for brute-force protection.

No private keys are ever received or stored; TOTP secrets are encrypted at
rest with the existing Fernet helper.
"""

# Python imports
import hashlib
import logging
import os
import secrets
from datetime import timedelta
from types import SimpleNamespace

# Django imports
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone

# Third party imports
import pyotp
from webauthn import (
    base64url_to_bytes,
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import (
    aaguid_to_string,
    bytes_to_base64url,
    byteslike_to_bytes,
    decode_credential_public_key,
    parse_attestation_object,
    parse_backup_flags,
    parse_client_data_json,
    parse_registration_credential_json,
)
from webauthn.helpers.exceptions import InvalidRegistrationResponse
from webauthn.helpers.structs import ClientDataType, PublicKeyCredentialType
from webauthn.registration.generate_registration_options import default_supported_pub_key_algs
from webauthn.helpers.structs import (
    AttestationConveyancePreference,
    AuthenticatorAttachment,
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

# Module imports
from plane.license.utils.encryption import decrypt_data, encrypt_data
from plane.license.utils.instance_value import get_configuration_value
from plane.settings.redis import redis_instance

# Number of single-use recovery codes issued per set.
RECOVERY_CODE_COUNT = 10

# Roaming transports that signal a removable hardware authenticator.
ROAMING_TRANSPORTS = {"usb", "nfc", "ble"}

# Redis key namespaces.
_CHALLENGE_PREFIX = "mfa:challenge"
_ATTEMPT_PREFIX = "mfa:verify_attempts"

# Atomic INCR + first-time EXPIRE for the verify-attempt counter, mirroring
# the magic-code provider so concurrent wrong-code requests cannot race past
# the cap.
_INCREMENT_ATTEMPTS_SCRIPT = (
    'local count = redis.call("INCR", KEYS[1]) '
    "if count == 1 then "
    "    redis.call(\"EXPIRE\", KEYS[1], tonumber(ARGV[1])) "
    "end "
    "return count"
)


# ---------------------------------------------------------------------------
# Settings / WebAuthn relying-party configuration
# ---------------------------------------------------------------------------


def get_challenge_ttl():
    return int(getattr(settings, "MFA_CHALLENGE_TTL_SECONDS", 300))


def get_max_verify_attempts():
    return int(getattr(settings, "MFA_MAX_VERIFY_ATTEMPTS", 5))


def _strip_scheme(host):
    if not host:
        return ""
    host = host.split("://", 1)[-1]
    # Drop any path / port.
    host = host.split("/", 1)[0]
    return host.split(":", 1)[0]


logger = logging.getLogger("plane.authentication")


def _expected_origins(origin):
    """Return one or more acceptable WebAuthn origins for verification.

    Self-hosted deployments often terminate TLS at a reverse proxy while
    ``WEB_URL`` still uses ``http://``. Accept both schemes for the same host
    so registration works regardless of which one is configured.
    """
    if not origin:
        return origin
    origins = [origin]
    if origin.startswith("https://"):
        alt = "http://" + origin[len("https://") :]
    elif origin.startswith("http://"):
        alt = "https://" + origin[len("http://") :]
    else:
        return origin
    if alt not in origins:
        origins.append(alt)
    return origins if len(origins) > 1 else origins[0]


def get_webauthn_rp_config():
    """Resolve the WebAuthn relying-party id, name and expected origin.

    Reads instance configuration first (so admins can override per-instance),
    falling back to ``WEB_URL``/settings. The RP-ID is the registrable domain
    (host only); the origin is the full scheme+host[:port].
    """
    (rp_id, rp_name, origin) = get_configuration_value(
        [
            {
                "key": "MFA_WEBAUTHN_RP_ID",
                "default": os.environ.get("MFA_WEBAUTHN_RP_ID", ""),
            },
            {
                "key": "MFA_WEBAUTHN_RP_NAME",
                "default": os.environ.get("MFA_WEBAUTHN_RP_NAME", "Plane"),
            },
            {
                "key": "MFA_WEBAUTHN_ORIGIN",
                "default": os.environ.get("MFA_WEBAUTHN_ORIGIN", ""),
            },
        ]
    )

    web_url = getattr(settings, "WEB_URL", None) or os.environ.get("WEB_URL", "")

    if not origin:
        origin = web_url or "http://localhost:3000"
    if not rp_id:
        rp_id = _strip_scheme(web_url) or "localhost"
    if not rp_name:
        rp_name = "Plane"

    return rp_id, rp_name, origin


# ---------------------------------------------------------------------------
# TOTP
# ---------------------------------------------------------------------------


def generate_totp_secret():
    """Return a fresh Google-Authenticator-compatible base32 secret."""
    return pyotp.random_base32()


def get_totp_provisioning_uri(secret, account_name, issuer_name="Plane"):
    return pyotp.TOTP(secret).provisioning_uri(name=account_name, issuer_name=issuer_name)


def verify_totp(secret, code, valid_window=1):
    """Verify a TOTP code with a ±1 step (±30s) drift window."""
    if not secret or not code:
        return False
    try:
        return bool(pyotp.TOTP(secret).verify(str(code).strip(), valid_window=valid_window))
    except Exception:
        return False


def encrypt_secret(secret):
    return encrypt_data(secret)


def decrypt_secret(secret_encrypted):
    return decrypt_data(secret_encrypted)


# ---------------------------------------------------------------------------
# Recovery codes
# ---------------------------------------------------------------------------


def generate_recovery_codes(count=RECOVERY_CODE_COUNT):
    """Generate ``count`` high-entropy, human-friendly recovery codes.

    Returns the plaintext codes; callers must store only the hashes and show
    the plaintext to the user exactly once.
    """
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no ambiguous chars
    codes = []
    for _ in range(count):
        raw = "".join(secrets.choice(alphabet) for _ in range(10))
        codes.append(f"{raw[:5]}-{raw[5:]}")
    return codes


def hash_recovery_code(code):
    # Normalise so display formatting / casing does not affect verification.
    return make_password(_normalize_recovery_code(code))


def _normalize_recovery_code(code):
    return str(code).strip().upper().replace("-", "").replace(" ", "")


def verify_recovery_code(code, code_hash):
    return check_password(_normalize_recovery_code(code), code_hash)


# ---------------------------------------------------------------------------
# Redis challenge storage (single-use, short TTL)
# ---------------------------------------------------------------------------


def _challenge_key(scope, identifier):
    return f"{_CHALLENGE_PREFIX}:{scope}:{identifier}"


def store_challenge(scope, identifier, challenge_bytes):
    """Persist a ceremony challenge (bytes) in Redis as base64url, single-use."""
    ri = redis_instance()
    ri.set(
        _challenge_key(scope, identifier),
        bytes_to_base64url(challenge_bytes),
        ex=get_challenge_ttl(),
    )


def consume_challenge(scope, identifier):
    """Atomically fetch and delete a stored challenge. Returns bytes or None."""
    ri = redis_instance()
    key = _challenge_key(scope, identifier)
    pipe = ri.pipeline()
    pipe.get(key)
    pipe.delete(key)
    value, _ = pipe.execute()
    if value is None:
        return None
    if isinstance(value, bytes):
        value = value.decode()
    return base64url_to_bytes(value)


# ---------------------------------------------------------------------------
# Redis attempt counter (brute-force protection)
# ---------------------------------------------------------------------------


def _attempt_key(identifier):
    return f"{_ATTEMPT_PREFIX}:{identifier}"


def increment_verify_attempts(identifier, ttl=None):
    """Atomically increment and return the verify-attempt counter."""
    ri = redis_instance()
    if ttl is None:
        ttl = get_challenge_ttl()
    return int(ri.eval(_INCREMENT_ATTEMPTS_SCRIPT, 1, _attempt_key(identifier), int(ttl)))


def reset_verify_attempts(identifier):
    redis_instance().delete(_attempt_key(identifier))


def attempts_exhausted(identifier):
    return increment_verify_attempts(identifier) > get_max_verify_attempts()


# ---------------------------------------------------------------------------
# WebAuthn classification (server-side, R3)
# ---------------------------------------------------------------------------


def classify_authenticator(attachment, transports, device_class, backed_up):
    """Resolve whether a WebAuthn credential is a *hardware security key*.

    Combines the WebAuthn signals (never trusting the client for the final
    boolean): a roaming, cross-platform, single-device, non-backed-up
    credential is a hardware security key (lockdown-eligible); a platform /
    backed-up / multi-device credential is a passkey.
    """
    transports = transports or []
    transport_set = {str(t).lower() for t in transports}
    is_cross_platform = attachment == "cross-platform"
    has_roaming_transport = bool(transport_set & ROAMING_TRANSPORTS)
    is_single_device = (device_class == "single") and not backed_up
    return bool(is_cross_platform and has_roaming_transport and is_single_device)


def _device_type_to_class(credential_device_type):
    """Map py_webauthn ``CredentialDeviceType`` to our ``single|multi`` value."""
    value = getattr(credential_device_type, "value", credential_device_type)
    value = str(value).lower()
    if "multi" in value:
        return "multi"
    if "single" in value:
        return "single"
    return ""


# ---------------------------------------------------------------------------
# WebAuthn registration ceremony
# ---------------------------------------------------------------------------


def build_registration_options(
    user_id,
    user_name,
    user_display_name,
    attachment,
    exclude_credentials=None,
):
    """Generate registration options + the raw challenge bytes.

    ``attachment`` steers the ceremony: ``platform`` for passkeys (discoverable,
    UV required) and ``cross-platform`` for hardware security keys.
    """
    rp_id, rp_name, _origin = get_webauthn_rp_config()

    if attachment == "platform":
        authenticator_selection = AuthenticatorSelectionCriteria(
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        )
    else:
        authenticator_selection = AuthenticatorSelectionCriteria(
            authenticator_attachment=AuthenticatorAttachment.CROSS_PLATFORM,
            resident_key=ResidentKeyRequirement.DISCOURAGED,
            user_verification=UserVerificationRequirement.PREFERRED,
        )

    exclude = []
    for cred_id in exclude_credentials or []:
        try:
            exclude.append(PublicKeyCredentialDescriptor(id=base64url_to_bytes(cred_id)))
        except Exception:
            continue

    options = generate_registration_options(
        rp_id=rp_id,
        rp_name=rp_name,
        user_id=str(user_id).encode("utf-8"),
        user_name=user_name,
        user_display_name=user_display_name or user_name,
        # Prefer no attestation so consumer passkeys and YubiKeys register reliably;
        # AAGUID / device classification still come from authenticator data.
        attestation=AttestationConveyancePreference.NONE,
        authenticator_selection=authenticator_selection,
        exclude_credentials=exclude,
    )
    return options, options.challenge


def _is_attestation_verification_error(exc):
    """True when strict verify failed only on attestation-statement checks."""
    message = str(exc).lower()
    return "attestation" in message


def _verify_registration_trust_on_use(
    credential,
    expected_challenge,
    expected_rp_id,
    expected_origin,
    require_user_verification=False,
):
    """Verify origin/challenge/RP binding without attestation certificate chains.

    Consumer passkeys and YubiKeys often return attestation formats (``packed``,
    ``apple``, …) whose certificate chains cannot be validated in a typical
    self-hosted deployment. For MFA enrollment we only need a bound credential
    public key for future assertions.
    """
    if isinstance(credential, (str, dict)):
        credential = parse_registration_credential_json(credential)

    if bytes_to_base64url(credential.raw_id) != credential.id:
        raise InvalidRegistrationResponse("id and raw_id were not equivalent")

    if credential.type != PublicKeyCredentialType.PUBLIC_KEY:
        raise InvalidRegistrationResponse(
            f'Unexpected credential type "{credential.type}", expected "public-key"'
        )

    response = credential.response
    client_data_bytes = byteslike_to_bytes(response.client_data_json)
    attestation_object_bytes = byteslike_to_bytes(response.attestation_object)

    try:
        client_data = parse_client_data_json(client_data_bytes)
    except Exception as exc:
        raise InvalidRegistrationResponse(
            "clientDataJSON was malformed. See __cause__ for more info"
        ) from exc

    if client_data.type != ClientDataType.WEBAUTHN_CREATE:
        raise InvalidRegistrationResponse(
            f'Unexpected client data type "{client_data.type}", expected "{ClientDataType.WEBAUTHN_CREATE}"'
        )

    if expected_challenge != client_data.challenge:
        raise InvalidRegistrationResponse("Client data challenge was not expected challenge")

    origins = [expected_origin] if isinstance(expected_origin, str) else list(expected_origin)
    if client_data.origin not in origins:
        raise InvalidRegistrationResponse(
            f'Unexpected client data origin "{client_data.origin}", expected one of {origins}'
        )

    try:
        attestation_object = parse_attestation_object(attestation_object_bytes)
    except Exception as exc:
        raise InvalidRegistrationResponse(
            "attestationObject was malformed. See __cause__ for more info"
        ) from exc

    auth_data = attestation_object.auth_data
    expected_rp_id_hash = hashlib.sha256(expected_rp_id.encode("utf-8")).digest()
    if auth_data.rp_id_hash != expected_rp_id_hash:
        raise InvalidRegistrationResponse("Unexpected RP ID hash")

    if not auth_data.flags.up:
        raise InvalidRegistrationResponse(
            "User presence was required, but was not present during attestation"
        )

    if require_user_verification and not auth_data.flags.uv:
        raise InvalidRegistrationResponse(
            "User verification is required but user was not verified during attestation"
        )

    if not auth_data.attested_credential_data:
        raise InvalidRegistrationResponse("Authenticator did not provide attested credential data")

    attested_credential_data = auth_data.attested_credential_data
    if not attested_credential_data.credential_id:
        raise InvalidRegistrationResponse("Authenticator did not provide a credential ID")
    if not attested_credential_data.credential_public_key:
        raise InvalidRegistrationResponse("Authenticator did not provide a credential public key")
    if not attested_credential_data.aaguid:
        raise InvalidRegistrationResponse("Authenticator did not provide an AAGUID")

    decoded_public_key = decode_credential_public_key(attested_credential_data.credential_public_key)
    if decoded_public_key.alg not in default_supported_pub_key_algs:
        raise InvalidRegistrationResponse(
            f'Unsupported credential public key alg "{decoded_public_key.alg}"'
        )

    parsed_backup_flags = parse_backup_flags(auth_data.flags)
    return SimpleNamespace(
        credential_id=attested_credential_data.credential_id,
        credential_public_key=attested_credential_data.credential_public_key,
        sign_count=auth_data.sign_count,
        aaguid=aaguid_to_string(attested_credential_data.aaguid),
        credential_device_type=parsed_backup_flags.credential_device_type,
        credential_backed_up=parsed_backup_flags.credential_backed_up,
    )


def verify_registration(credential, expected_challenge, require_user_verification=False):
    """Verify a registration response. Returns a dict of persisted fields."""
    rp_id, _rp_name, origin = get_webauthn_rp_config()
    origins = _expected_origins(origin)
    try:
        verification = verify_registration_response(
            credential=credential,
            expected_challenge=expected_challenge,
            expected_origin=origins,
            expected_rp_id=rp_id,
            require_user_verification=require_user_verification,
        )
    except InvalidRegistrationResponse as exc:
        if not _is_attestation_verification_error(exc):
            raise
        logger.warning(
            "Strict WebAuthn attestation verification failed (%s); using trust-on-use fallback",
            exc,
        )
        verification = _verify_registration_trust_on_use(
            credential=credential,
            expected_challenge=expected_challenge,
            expected_origin=origins,
            expected_rp_id=rp_id,
            require_user_verification=require_user_verification,
        )

    device_class = _device_type_to_class(getattr(verification, "credential_device_type", None))
    backed_up = bool(getattr(verification, "credential_backed_up", False))

    return {
        "credential_id": bytes_to_base64url(verification.credential_id),
        "public_key": bytes_to_base64url(verification.credential_public_key),
        "sign_count": int(verification.sign_count),
        "aaguid": str(getattr(verification, "aaguid", "") or ""),
        "device_class": device_class,
        "backed_up": backed_up,
    }


# ---------------------------------------------------------------------------
# WebAuthn authentication ceremony
# ---------------------------------------------------------------------------


def build_authentication_options(allow_credentials_descriptors, user_verification="preferred"):
    """Generate authentication options + the raw challenge bytes.

    ``allow_credentials_descriptors`` is a list of dicts with ``credential_id``
    (base64url) and optional ``transports``.
    """
    rp_id, _rp_name, _origin = get_webauthn_rp_config()

    allow_credentials = []
    for desc in allow_credentials_descriptors or []:
        try:
            allow_credentials.append(
                PublicKeyCredentialDescriptor(id=base64url_to_bytes(desc["credential_id"]))
            )
        except Exception:
            continue

    uv_map = {
        "required": UserVerificationRequirement.REQUIRED,
        "preferred": UserVerificationRequirement.PREFERRED,
        "discouraged": UserVerificationRequirement.DISCOURAGED,
    }

    options = generate_authentication_options(
        rp_id=rp_id,
        allow_credentials=allow_credentials,
        user_verification=uv_map.get(user_verification, UserVerificationRequirement.PREFERRED),
    )
    return options, options.challenge


def verify_authentication(
    credential,
    expected_challenge,
    public_key,
    current_sign_count,
    require_user_verification=False,
):
    """Verify an assertion. Returns the new sign count (int)."""
    rp_id, _rp_name, origin = get_webauthn_rp_config()
    verification = verify_authentication_response(
        credential=credential,
        expected_challenge=expected_challenge,
        expected_rp_id=rp_id,
        expected_origin=_expected_origins(origin),
        credential_public_key=base64url_to_bytes(public_key),
        credential_current_sign_count=current_sign_count,
        require_user_verification=require_user_verification,
    )
    return int(verification.new_sign_count)


# ---------------------------------------------------------------------------
# Login-flow gate (partial-auth)
# ---------------------------------------------------------------------------


def is_mfa_enabled_for_user(user):
    """Whether the user has a confirmed second factor (gate source of truth)."""
    from plane.db.models import UserMFA

    return UserMFA.objects.filter(user=user, is_enabled=True).exists()


def is_mfa_enforced_globally():
    """Whether MFA is enabled and enforced for this instance (forced-setup gate)."""
    (mfa_enabled, mfa_enforced) = get_configuration_value(
        [
            {"key": "MFA_ENABLED", "default": os.environ.get("MFA_ENABLED", "1")},
            {"key": "MFA_ENFORCED", "default": os.environ.get("MFA_ENFORCED", "1")},
        ]
    )
    return str(mfa_enabled) == "1" and str(mfa_enforced) == "1"


def is_mfa_setup_required_for_user(user):
    """Whether the user must configure a second factor before using the app."""
    if user is None or not getattr(user, "is_authenticated", True):
        return False
    if getattr(user, "is_bot", False):
        return False
    if not is_mfa_enforced_globally():
        return False
    return not is_mfa_enabled_for_user(user)


def set_pending_mfa(request, user):
    """Store partial-auth state ("password OK, 2FA pending") in the session.

    Crucially ``django.contrib.auth.login()`` is NOT called, so ``request.user``
    stays anonymous and ``_auth_user_id`` is absent — the user is genuinely not
    logged in until the second factor verifies.
    """
    ttl = int(getattr(settings, "MFA_PENDING_TTL_SECONDS", 300))
    request.session["mfa_pending_user_id"] = str(user.id)
    request.session["mfa_pending_until"] = (timezone.now() + timedelta(seconds=ttl)).isoformat()
    request.session.save()


def mfa_login_gate(request, user, next_path, is_app=True):
    """Inject the 2FA challenge between first-factor auth and ``user_login``.

    Returns an ``HttpResponseRedirect`` to the SPA with a ``mfa=required``
    marker when the user has 2FA enabled, otherwise ``None`` (the caller then
    proceeds to finalise the session normally).
    """
    if not is_mfa_enabled_for_user(user):
        return None

    from django.http import HttpResponseRedirect
    from plane.authentication.utils.host import base_host
    from plane.utils.path_validator import get_safe_redirect_url

    set_pending_mfa(request, user)
    url = get_safe_redirect_url(
        base_url=base_host(request=request, is_app=is_app),
        next_path=next_path,
        params={"mfa": "required"},
    )
    return HttpResponseRedirect(url)


def options_to_dict(options):
    """Serialise py_webauthn options to a plain JSON-compatible dict.

    ``options_to_json`` returns the WebAuthn-spec JSON (base64url-encoded
    binary fields) as a string; we return it as a dict so DRF can render it.
    """
    import json

    return json.loads(options_to_json(options))


def extract_credential_id(credential):
    """Pull the credential id (base64url) out of an assertion payload."""
    import json

    if isinstance(credential, (str, bytes)):
        try:
            credential = json.loads(credential)
        except Exception:
            return None
    if isinstance(credential, dict):
        return credential.get("id") or credential.get("rawId")
    return None
