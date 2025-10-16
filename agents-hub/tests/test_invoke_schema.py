from app.schemas.invoke import ConfigMetadata, InvokeConfig, InvokeRequest


def test_invoke_config_expands_hierarchical_overrides() -> None:
    config = InvokeConfig(
        overrides={
            "finops.model_tiers.preferred": "turbo",
            "routing": {"max_iters": 3},
        }
    )

    assert config.overrides == {
        "finops": {"model_tiers": {"preferred": "turbo"}},
        "routing": {"max_iters": 3},
    }


def test_invoke_request_populates_request_id_when_missing() -> None:
    request = InvokeRequest()
    metadata = request.config.metadata

    assert metadata is not None
    assert isinstance(metadata.request_id, str)
    assert metadata.request_id

    explicit = InvokeRequest(config=InvokeConfig(metadata=ConfigMetadata(request_id=None)))
    assert explicit.config.metadata is not None
    assert isinstance(explicit.config.metadata.request_id, str)
    assert explicit.config.metadata.request_id
