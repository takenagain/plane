import importlib

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
