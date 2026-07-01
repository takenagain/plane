import json
import zipfile

import pytest

from plane.bgtasks.export_task import build_export_manifest, create_zip_file
from plane.db.models import Project, State


@pytest.mark.unit
@pytest.mark.django_db
def test_build_export_manifest_includes_projects_and_files(workspace):
    project = Project.objects.create(
        name="Web",
        identifier="WEB",
        workspace=workspace,
    )
    State.objects.create(name="Todo", color="#000", project=project, workspace=workspace, sequence=1)

    files_metadata = [
        {
            "project_id": str(project.id),
            "path": f"{workspace.slug}-{project.id}.json",
            "issue_count": 3,
        }
    ]
    manifest = build_export_manifest(workspace.slug, "json", [str(project.id)], files_metadata)

    assert manifest["workspace_slug"] == workspace.slug
    assert manifest["format"] == "json"
    assert len(manifest["projects"]) == 1
    assert manifest["projects"][0]["identifier"] == "WEB"
    assert manifest["projects"][0]["state_count"] == 1
    assert manifest["files"] == files_metadata


@pytest.mark.unit
def test_create_zip_file_includes_manifest_entry():
    manifest = {"workspace_slug": "acme", "files": []}
    zip_buffer = create_zip_file([("manifest.json", json.dumps(manifest))])

    with zipfile.ZipFile(zip_buffer, "r") as archive:
        assert "manifest.json" in archive.namelist()
        assert json.loads(archive.read("manifest.json"))["workspace_slug"] == "acme"
