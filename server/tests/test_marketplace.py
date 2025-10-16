from __future__ import annotations

from pathlib import Path

import pytest

from console_mcp_server import marketplace

from .fixtures import SampleMarketplaceEntry, seed_marketplace_entries


@pytest.fixture()
def marketplace_signature() -> str:
    return "210d5e9bacc7c50401c63821be3dc19b1723742e03f5306f8d2aaea0ec7b8b6d"


def test_prepare_marketplace_install_uses_isolated_sandbox(database, tmp_path: Path, marketplace_signature: str) -> None:
    database.bootstrap_database()
    seed_marketplace_entries(
        [
            SampleMarketplaceEntry(
                entry_id="marketplace-help-desk",
                name="Help Desk Coach",
                slug="help-desk-coach",
                summary="Triagem assistida",
                origin="community",
                rating=4.5,
                cost=0.02,
                package_path="config/marketplace/help-desk",
                signature=marketplace_signature,
            )
        ]
    )

    destination = tmp_path / "sandbox"
    bundle = marketplace.prepare_marketplace_install("marketplace-help-desk", destination)

    assert bundle.sandbox_path == destination.resolve()
    assert bundle.manifest_path.parent == destination.resolve()
    assert bundle.manifest_path.read_text(encoding="utf-8").startswith("name: help-desk-coach")
    assert bundle.agent_path is not None
    assert bundle.agent_path.parent == destination.resolve()


def test_prepare_marketplace_install_validates_signature(database, tmp_path: Path) -> None:
    database.bootstrap_database()
    seed_marketplace_entries(
        [
            SampleMarketplaceEntry(
                entry_id="marketplace-invalid",
                name="Help Desk Clone",
                slug="help-desk-clone",
                summary="Clone",
                origin="community",
                rating=4.0,
                cost=0.01,
                package_path="config/marketplace/help-desk",
                signature="deadbeef" * 8,
            )
        ]
    )

    with pytest.raises(marketplace.MarketplaceSignatureError):
        marketplace.prepare_marketplace_install("marketplace-invalid", tmp_path / "sandbox")
