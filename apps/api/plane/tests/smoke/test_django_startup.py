import importlib
import os
import subprocess
import sys
from pathlib import Path

import pytest
from django.core.management import call_command


@pytest.mark.smoke
@pytest.mark.django_db
def test_wait_for_db_runs_django_startup_checks():
    call_command("wait_for_db")


@pytest.mark.smoke
def test_django_system_checks_pass():
    """Run ``manage.py check`` to catch import errors that prevent API startup.

    This covers the full URL-resolution chain (URL conf → views → serializers)
    and will fail on any ``ImportError`` or ``NameError`` in the import graph.
    """
    call_command("check")


@pytest.mark.smoke
def test_url_configuration_loads():
    """Ensure every URL pattern can be imported without errors.

    A missing view import (e.g. ``ProjectTimeLoggedExportEndpoint``) or an
    undefined name (e.g. ``IssueType``) in a serializer referenced by the URL
    graph will raise here, exactly like ``runserver`` would on startup.
    """
    from django.urls import get_resolver

    resolver = get_resolver()
    # Accessing ``url_patterns`` forces recursive loading of all URL modules.
    patterns = resolver.url_patterns
    assert len(patterns) > 0, "URL configuration should contain at least one route"


@pytest.mark.smoke
def test_app_views_importable():
    """Verify that ``plane.app.views`` can be imported cleanly.

    This is the single import that gates every API view.  If any re-export
    inside ``views/__init__.py`` references a symbol that doesn't exist the
    whole module fails to load — and therefore every request returns 500.
    """
    mod = importlib.import_module("plane.app.views")
    # A minimal sanity check: the module should expose *something*.
    assert dir(mod)


@pytest.mark.smoke
def test_production_models_match_migration_state():
    """Prevent production-only model changes without schema migrations."""
    env = {**os.environ, "DEBUG": "0", "DJANGO_SETTINGS_MODULE": "plane.settings.production"}
    result = subprocess.run(
        [sys.executable, "manage.py", "makemigrations", "--check", "--dry-run"],
        cwd=Path(__file__).resolve().parents[3],
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
