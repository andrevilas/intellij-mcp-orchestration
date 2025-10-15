"""Integration-style tests for the FastAPI console server."""

from __future__ import annotations

import importlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from console_mcp_server import notifications as notifications_module
from console_mcp_server import routes as routes_module
from console_mcp_server import secret_validation as secret_validation_module
from console_mcp_server import telemetry as telemetry_module

def resolve_repo_root(start: Path) -> Path:
    for candidate in (start,) + tuple(start.parents):
        manifest = candidate / 'config/console-mcp/servers.example.json'
        if manifest.exists():
            return candidate
    raise RuntimeError('Unable to locate repository root containing config/console-mcp/servers.example.json')


REPO_ROOT = resolve_repo_root(Path(__file__).resolve().parent)
MANIFEST_PATH = REPO_ROOT / 'config/console-mcp/servers.example.json'


def parse_iso(value: str) -> datetime:
    """Normalize ISO timestamps that may include a trailing Z."""

    if value.endswith('Z'):
        value = value[:-1] + '+00:00'
    return datetime.fromisoformat(value)


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> TestClient:
    monkeypatch.setenv('CONSOLE_MCP_SERVERS_PATH', str(MANIFEST_PATH))
    secrets_path = tmp_path / 'secrets.json'
    monkeypatch.setenv('CONSOLE_MCP_SECRETS_PATH', str(secrets_path))
    db_path = tmp_path / 'console.db'
    monkeypatch.setenv('CONSOLE_MCP_DB_PATH', str(db_path))
    assert MANIFEST_PATH.exists()

    import console_mcp_server.config as config_module
    import console_mcp_server.registry as registry_module
    import console_mcp_server.secrets as secrets_module
    import console_mcp_server.secret_validation as secret_validation_module
    import console_mcp_server.database as database_module
    import console_mcp_server.routes as routes_module
    import console_mcp_server.supervisor as supervisor_module
    import console_mcp_server.main as main_module

    config = importlib.reload(config_module)
    registry = importlib.reload(registry_module)
    secrets = importlib.reload(secrets_module)
    secret_validation = importlib.reload(secret_validation_module)
    database = importlib.reload(database_module)
    supervisor = importlib.reload(supervisor_module)
    importlib.reload(routes_module)
    main = importlib.reload(main_module)

    registry.provider_registry = registry.ProviderRegistry(settings=config.get_settings())
    registry.session_registry = registry.SessionRegistry()
    secrets.secret_store = secrets.SecretStore(path=secrets_path)
    secret_validation.secret_store = secrets.secret_store
    secret_validation.provider_registry = registry.provider_registry
    database.reset_state()
    supervisor.process_supervisor.prune(only_finished=False)

    with TestClient(main.app) as test_client:
        yield test_client

    registry.session_registry = registry.SessionRegistry()
    database.reset_state()
    supervisor.process_supervisor.stop_all()
    supervisor.process_supervisor.prune(only_finished=False)


def test_healthz_endpoint_reports_ok(client: TestClient) -> None:
    response = client.get('/api/v1/healthz')

    assert response.status_code == 200
    payload = response.json()
    assert payload['status'] == 'ok'
    assert 'timestamp' in payload


def test_providers_endpoint_uses_example_manifest(client: TestClient) -> None:
    response = client.get('/api/v1/providers')

    assert response.status_code == 200
    payload = response.json()
    provider_ids = {provider['id'] for provider in payload['providers']}

    assert len(payload['providers']) == 4
    assert {'gemini', 'codex', 'glm46', 'claude'} <= provider_ids
    assert all(provider['is_available'] for provider in payload['providers'])


def test_notifications_endpoint_returns_curated_payload(client: TestClient) -> None:
    response = client.get('/api/v1/notifications')

    assert response.status_code == 200
    payload = response.json()
    assert 'notifications' in payload
    assert len(payload['notifications']) >= 1

    sample = payload['notifications'][0]
    assert {'id', 'severity', 'title', 'message', 'timestamp', 'category', 'tags'} <= sample.keys()


def test_notifications_endpoint_handles_empty_sources(
    monkeypatch: pytest.MonkeyPatch, client: TestClient
) -> None:
    monkeypatch.setattr(routes_module, 'list_notifications', lambda: [])

    response = client.get('/api/v1/notifications')
    assert response.status_code == 200

    payload = response.json()
    assert payload == {'notifications': []}


def test_notifications_endpoint_surfaces_errors(
    monkeypatch: pytest.MonkeyPatch, client: TestClient
) -> None:
    def boom() -> list:
        raise RuntimeError('notification backend unavailable')

    monkeypatch.setattr(routes_module, 'list_notifications', boom)

    response = client.get('/api/v1/notifications')
    assert response.status_code == 500
    body = response.json()
    assert body['detail'] == 'notification backend unavailable'


def test_session_provisioning_flow(client: TestClient) -> None:
    list_before = client.get('/api/v1/sessions')
    assert list_before.status_code == 200
    assert list_before.json()['sessions'] == []

    create_response = client.post(
        '/api/v1/providers/gemini/sessions',
        json={'reason': 'Automated test', 'client': 'pytest-suite'},
    )

    assert create_response.status_code == 200
    body = create_response.json()

    assert body['provider']['id'] == 'gemini'
    assert body['session']['provider_id'] == 'gemini'
    assert body['session']['reason'] == 'Automated test'
    assert body['session']['client'] == 'pytest-suite'

    list_after = client.get('/api/v1/sessions')
    assert list_after.status_code == 200

    sessions = list_after.json()['sessions']
    assert any(session['id'] == body['session']['id'] for session in sessions)


def test_secret_crud_flow(client: TestClient, tmp_path: Path) -> None:
    empty_response = client.get('/api/v1/secrets')
    assert empty_response.status_code == 200
    assert empty_response.json() == {'secrets': []}

    missing = client.get('/api/v1/secrets/gemini')
    assert missing.status_code == 404

    create_response = client.put('/api/v1/secrets/gemini', json={'value': 'api-key-123'})
    assert create_response.status_code == 200
    created_payload = create_response.json()
    assert created_payload['provider_id'] == 'gemini'
    assert created_payload['value'] == 'api-key-123'
    assert 'updated_at' in created_payload

    list_after_create = client.get('/api/v1/secrets')
    assert list_after_create.status_code == 200
    summary = list_after_create.json()['secrets']
    assert len(summary) == 1
    gemini_summary = summary[0]
    assert gemini_summary['provider_id'] == 'gemini'
    assert gemini_summary['has_secret'] is True
    assert gemini_summary['updated_at']

    read_response = client.get('/api/v1/secrets/gemini')
    assert read_response.status_code == 200
    assert read_response.json()['value'] == 'api-key-123'

    update_response = client.put('/api/v1/secrets/gemini', json={'value': 'api-key-456'})
    assert update_response.status_code == 200
    assert update_response.json()['value'] == 'api-key-456'

    on_disk = json.loads((tmp_path / 'secrets.json').read_text())
    assert on_disk['secrets']['gemini']['value'] == 'api-key-456'

    delete_response = client.delete('/api/v1/secrets/gemini')
    assert delete_response.status_code == 204

    missing_after_delete = client.get('/api/v1/secrets/gemini')
    assert missing_after_delete.status_code == 404

    list_after_delete = client.get('/api/v1/secrets')
    assert list_after_delete.status_code == 200
    assert list_after_delete.json()['secrets'] == []

    disk_after_delete = json.loads((tmp_path / 'secrets.json').read_text())
    assert disk_after_delete['secrets'] == {}


def test_secret_validation_flow(client: TestClient) -> None:
    create_response = client.put('/api/v1/secrets/gemini', json={'value': 'api-key-123'})
    assert create_response.status_code == 200

    response = client.post('/api/v1/secrets/gemini/test')
    assert response.status_code == 200

    payload = response.json()
    assert payload['provider_id'] == 'gemini'
    assert payload['status'] in {'healthy', 'degraded', 'error'}
    assert isinstance(payload['latency_ms'], int)
    assert payload['latency_ms'] >= 0
    assert 'Gemini MCP' in payload['message']
    assert parse_iso(payload['tested_at'])


def test_secret_validation_missing_secret(client: TestClient) -> None:
    response = client.post('/api/v1/secrets/gemini/test')

    assert response.status_code == 404
    assert response.json()['detail'] == "Secret for provider 'gemini' not found"


def test_secret_validation_unknown_provider(client: TestClient) -> None:
    response = client.post('/api/v1/secrets/unknown/test')

    assert response.status_code == 404
    assert response.json()['detail'] == "Provider 'unknown' not found"


def test_policy_override_crud_flow(client: TestClient) -> None:
    list_response = client.get('/api/v1/policies/overrides')
    assert list_response.status_code == 200
    assert list_response.json() == {'overrides': []}

    create_payload = {
        'id': 'route-ops-balance',
        'route': 'ops/incident',
        'project': 'observability',
        'template_id': 'balanced',
        'max_latency_ms': 1800,
        'max_cost_usd': 1.25,
        'require_manual_approval': True,
        'notes': 'Incident response route requires manual approval.',
    }

    create_response = client.post('/api/v1/policies/overrides', json=create_payload)
    assert create_response.status_code == 201
    created = create_response.json()
    assert created['route'] == 'ops/incident'
    assert created['project'] == 'observability'
    assert created['template_id'] == 'balanced'
    assert created['require_manual_approval'] is True
    created_at = parse_iso(created['created_at'])
    updated_at = parse_iso(created['updated_at'])
    assert updated_at >= created_at

    read_response = client.get('/api/v1/policies/overrides/route-ops-balance')
    assert read_response.status_code == 200
    assert read_response.json()['notes'] == 'Incident response route requires manual approval.'

    update_payload = {
        'route': 'ops/incident',
        'project': 'observability',
        'template_id': 'turbo',
        'max_latency_ms': 1200,
        'max_cost_usd': 2.0,
        'require_manual_approval': False,
        'notes': 'Escalated to turbo after review.',
    }

    update_response = client.put('/api/v1/policies/overrides/route-ops-balance', json=update_payload)
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated['template_id'] == 'turbo'
    assert updated['require_manual_approval'] is False
    assert parse_iso(updated['created_at']) == created_at
    assert parse_iso(updated['updated_at']) > updated_at

    list_after_update = client.get('/api/v1/policies/overrides')
    assert list_after_update.status_code == 200
    overrides = list_after_update.json()['overrides']
    assert len(overrides) == 1
    assert overrides[0]['id'] == 'route-ops-balance'
    assert overrides[0]['template_id'] == 'turbo'

    delete_response = client.delete('/api/v1/policies/overrides/route-ops-balance')
    assert delete_response.status_code == 204

    final_response = client.get('/api/v1/policies/overrides')
    assert final_response.status_code == 200
    assert final_response.json()['overrides'] == []


def test_telemetry_metrics_endpoint_returns_aggregates(client: TestClient) -> None:
    from console_mcp_server import database as database_module

    engine = database_module.bootstrap_database()
    base_ts = datetime(2025, 1, 15, 12, 0, tzinfo=timezone.utc)

    events = [
        {
            'provider_id': 'glm46',
            'tool': 'glm46.chat',
            'route': 'default',
            'tokens_in': 120,
            'tokens_out': 60,
            'duration_ms': 900,
            'status': 'success',
            'cost_estimated_usd': 0.42,
            'metadata': '{}',
            'ts': base_ts.isoformat(),
            'source_file': 'glm46/sample.jsonl',
            'ingested_at': base_ts.isoformat(),
        },
        {
            'provider_id': 'gemini',
            'tool': 'gemini.chat',
            'route': 'balanced',
            'tokens_in': 80,
            'tokens_out': 40,
            'duration_ms': 1500,
            'status': 'error',
            'cost_estimated_usd': 0.25,
            'metadata': '{}',
            'ts': (base_ts + timedelta(minutes=10)).isoformat(),
            'source_file': 'gemini/sample.jsonl',
            'ingested_at': (base_ts + timedelta(minutes=1)).isoformat(),
        },
    ]

    with engine.begin() as connection:
        for index, event in enumerate(events, start=1):
            connection.execute(
                text(
                    """
                    INSERT INTO telemetry_events (
                        provider_id,
                        tool,
                        route,
                        tokens_in,
                        tokens_out,
                        duration_ms,
                        status,
                        cost_estimated_usd,
                        metadata,
                        ts,
                        source_file,
                        line_number,
                        ingested_at
                    ) VALUES (
                        :provider_id,
                        :tool,
                        :route,
                        :tokens_in,
                        :tokens_out,
                        :duration_ms,
                        :status,
                        :cost_estimated_usd,
                        :metadata,
                        :ts,
                        :source_file,
                        :line_number,
                        :ingested_at
                    )
                    """
                ),
                {**event, 'line_number': index},
            )

    response = client.get('/api/v1/telemetry/metrics')
    assert response.status_code == 200

    payload = response.json()
    assert payload['total_runs'] == 2
    assert payload['total_tokens_in'] == 200
    assert payload['total_tokens_out'] == 100
    assert payload['total_cost_usd'] == pytest.approx(0.67)
    assert payload['avg_latency_ms'] == pytest.approx((900 + 1500) / 2)
    assert payload['success_rate'] == pytest.approx(0.5)
    assert parse_iso(payload['start']) == base_ts
    assert parse_iso(payload['end']) == base_ts + timedelta(minutes=10)

    providers = {item['provider_id']: item for item in payload['providers']}
    assert providers['glm46']['run_count'] == 1
    assert providers['glm46']['success_rate'] == pytest.approx(1.0)
    assert providers['gemini']['success_rate'] == pytest.approx(0.0)

    filtered = client.get(
        '/api/v1/telemetry/metrics',
        params={
            'start': (base_ts + timedelta(minutes=5)).isoformat(),
            'end': (base_ts + timedelta(minutes=15)).isoformat(),
            'provider_id': 'gemini',
        },
    )
    assert filtered.status_code == 200

    filtered_payload = filtered.json()
    assert filtered_payload['total_runs'] == 1
    assert filtered_payload['providers'][0]['provider_id'] == 'gemini'


def test_telemetry_heatmap_endpoint_returns_daily_buckets(client: TestClient) -> None:
    from console_mcp_server import database as database_module

    engine = database_module.bootstrap_database()
    base_ts = datetime(2025, 4, 2, 9, 0, tzinfo=timezone.utc)

    events = [
        {
            'provider_id': 'glm46',
            'tool': 'glm46.chat',
            'route': 'default',
            'tokens_in': 150,
            'tokens_out': 70,
            'duration_ms': 950,
            'status': 'success',
            'cost_estimated_usd': 0.5,
            'metadata': '{}',
            'ts': base_ts.isoformat(),
            'source_file': 'glm46/2025-04-02.jsonl',
            'ingested_at': base_ts.isoformat(),
        },
        {
            'provider_id': 'glm46',
            'tool': 'glm46.chat',
            'route': 'default',
            'tokens_in': 110,
            'tokens_out': 60,
            'duration_ms': 880,
            'status': 'error',
            'cost_estimated_usd': 0.3,
            'metadata': '{}',
            'ts': (base_ts + timedelta(hours=2)).isoformat(),
            'source_file': 'glm46/2025-04-02.jsonl',
            'ingested_at': (base_ts + timedelta(minutes=10)).isoformat(),
        },
        {
            'provider_id': 'gemini',
            'tool': 'gemini.chat',
            'route': 'balanced',
            'tokens_in': 90,
            'tokens_out': 40,
            'duration_ms': 720,
            'status': 'success',
            'cost_estimated_usd': 0.22,
            'metadata': '{}',
            'ts': (base_ts + timedelta(days=1)).isoformat(),
            'source_file': 'gemini/2025-04-03.jsonl',
            'ingested_at': (base_ts + timedelta(days=1, minutes=5)).isoformat(),
        },
    ]

    with engine.begin() as connection:
        for index, event in enumerate(events, start=1):
            connection.execute(
                text(
                    """
                    INSERT INTO telemetry_events (
                        provider_id,
                        tool,
                        route,
                        tokens_in,
                        tokens_out,
                        duration_ms,
                        status,
                        cost_estimated_usd,
                        metadata,
                        ts,
                        source_file,
                        line_number,
                        ingested_at
                    ) VALUES (
                        :provider_id,
                        :tool,
                        :route,
                        :tokens_in,
                        :tokens_out,
                        :duration_ms,
                        :status,
                        :cost_estimated_usd,
                        :metadata,
                        :ts,
                        :source_file,
                        :line_number,
                        :ingested_at
                    )
                    """
                ),
                {**event, 'line_number': index},
            )

    response = client.get('/api/v1/telemetry/heatmap')
    assert response.status_code == 200

    payload = response.json()
    buckets = {(entry['day'], entry['provider_id']): entry['run_count'] for entry in payload['buckets']}
    assert buckets[(base_ts.date().isoformat(), 'glm46')] == 2
    assert buckets[((base_ts + timedelta(days=1)).date().isoformat(), 'gemini')] == 1

    filtered = client.get(
        '/api/v1/telemetry/heatmap',
        params={'provider_id': 'gemini', 'start': (base_ts + timedelta(days=1)).isoformat()},
    )
    assert filtered.status_code == 200

    filtered_payload = filtered.json()
    assert all(entry['provider_id'] == 'gemini' for entry in filtered_payload['buckets'])


def test_telemetry_timeseries_endpoint_returns_daily_metrics(
    telemetry_dataset, client: TestClient
) -> None:
    base_ts = telemetry_dataset[0].ts
    start = (base_ts - timedelta(days=2)).isoformat()
    end = (base_ts + timedelta(days=2)).isoformat()

    response = client.get(
        '/api/v1/telemetry/timeseries',
        params={'start': start, 'end': end},
    )
    assert response.status_code == 200

    payload = response.json()
    items = payload['items']
    assert len(items) == 4

    by_provider_day = {
        (item['provider_id'], item['day']): item for item in items
    }

    gem_day = '2025-04-10'
    gem_entry = by_provider_day[('gemini', gem_day)]
    assert gem_entry['run_count'] == 1
    assert gem_entry['tokens_in'] == 1800
    assert gem_entry['cost_usd'] == pytest.approx(1.75, rel=1e-6)

    gem_next_day = '2025-04-11'
    gem_next_entry = by_provider_day[('gemini', gem_next_day)]
    assert gem_next_entry['run_count'] == 1
    assert gem_next_entry['cost_usd'] == pytest.approx(0.00545, rel=1e-5)

    glm_day = '2025-04-09'
    glm_entry = by_provider_day[('glm46', glm_day)]
    assert glm_entry['run_count'] == 1
    assert glm_entry['cost_usd'] == pytest.approx(1.1, rel=1e-6)

    glm_same_day = '2025-04-10'
    glm_same_entry = by_provider_day[('glm46', glm_same_day)]
    assert glm_same_entry['cost_usd'] == pytest.approx(0.00225, rel=1e-5)


def test_telemetry_pareto_endpoint_aggregates_routes(
    telemetry_dataset, client: TestClient
) -> None:
    base_ts = telemetry_dataset[0].ts
    response = client.get(
        '/api/v1/telemetry/pareto',
        params={
            'start': (base_ts - timedelta(days=2)).isoformat(),
            'end': (base_ts + timedelta(days=2)).isoformat(),
        },
    )
    assert response.status_code == 200

    payload = response.json()
    items = {entry['provider_id']: entry for entry in payload['items']}

    gem = items['gemini']
    assert gem['run_count'] == 2
    assert gem['tokens_in'] == 3000
    assert gem['tokens_out'] == 1600
    assert gem['avg_latency_ms'] == pytest.approx((880 + 940) / 2, rel=1e-5)
    assert gem['cost_usd'] == pytest.approx(1.75545, rel=1e-5)
    assert gem['success_rate'] == pytest.approx(0.5, rel=1e-5)

    glm = items['glm46']
    assert glm['run_count'] == 2
    assert glm['tokens_in'] == 2400
    assert glm['tokens_out'] == 900
    assert glm['cost_usd'] == pytest.approx(1.10225, rel=1e-5)
    assert glm['success_rate'] == pytest.approx(0.5, rel=1e-5)


def test_telemetry_runs_endpoint_supports_pagination(
    telemetry_dataset, client: TestClient
) -> None:
    base_ts = telemetry_dataset[0].ts
    params = {
        'provider_id': 'gemini',
        'route': 'balanced',
        'start': (base_ts - timedelta(days=1)).isoformat(),
        'end': (base_ts + timedelta(days=2)).isoformat(),
        'limit': 1,
    }

    first_page = client.get('/api/v1/telemetry/runs', params=params)
    assert first_page.status_code == 200

    first_payload = first_page.json()
    assert first_payload['next_cursor'] is not None
    assert len(first_payload['items']) == 1

    first_run = first_payload['items'][0]
    assert first_run['status'] == 'error'
    assert first_run['cost_usd'] == pytest.approx(0.00545, rel=1e-5)
    assert first_run['metadata'].get('project') == 'alpha'

    lane = first_run['lane']
    assert lane in {'economy', 'balanced', 'turbo'}

    second_page = client.get(
        '/api/v1/telemetry/runs',
        params={**params, 'cursor': first_payload['next_cursor'], 'lane': lane},
    )
    assert second_page.status_code == 200

    second_payload = second_page.json()
    assert second_payload['next_cursor'] is None
    assert len(second_payload['items']) == 1

    second_run = second_payload['items'][0]
    assert second_run['status'] == 'success'
    assert second_run['cost_usd'] == pytest.approx(1.75, rel=1e-6)
    assert second_run['metadata'].get('consumer') == 'squad-a'

    mismatch_lane = 'turbo' if lane != 'turbo' else 'economy'
    empty_page = client.get(
        '/api/v1/telemetry/runs',
        params={**params, 'lane': mismatch_lane},
    )
    assert empty_page.status_code == 200
    assert empty_page.json()['items'] == []


def test_telemetry_timeseries_endpoint_supports_lane_filter(
    telemetry_dataset, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        telemetry_module,
        '_provider_lane_index',
        lambda: {'gemini': 'turbo', 'glm46': 'economy'},
    )

    response = client.get(
        '/api/v1/telemetry/timeseries',
        params={'lane': 'economy'},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload['items']
    assert {item['provider_id'] for item in payload['items']} == {'glm46'}


def test_telemetry_runs_endpoint_filters_by_lane(
    telemetry_dataset, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        telemetry_module,
        '_provider_lane_index',
        lambda: {'gemini': 'turbo', 'glm46': 'economy'},
    )

    response = client.get(
        '/api/v1/telemetry/runs',
        params={'lane': 'economy'},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload['items']
    assert {item['provider_id'] for item in payload['items']} == {'glm46'}


def test_finops_sprint_reports_endpoint_returns_aggregates(
    telemetry_dataset, client: TestClient
) -> None:
    base_ts = telemetry_dataset[0].ts
    response = client.get(
        '/api/v1/telemetry/finops/sprints',
        params={
            'start': (base_ts - timedelta(days=1)).isoformat(),
            'end': (base_ts + timedelta(days=1)).isoformat(),
            'window_days': 3,
            'limit': 2,
        },
    )

    assert response.status_code == 200

    payload = response.json()
    assert len(payload['items']) == 1
    report = payload['items'][0]

    assert report['period_start'] == '2025-04-09'
    assert report['period_end'] == '2025-04-11'
    assert report['total_tokens_in'] == 5400
    assert report['total_tokens_out'] == 2500
    assert report['total_cost_usd'] == pytest.approx(2.8577, rel=1e-5)
    assert report['avg_latency_ms'] == pytest.approx(900.0, rel=1e-6)
    assert report['success_rate'] == pytest.approx(0.5, rel=1e-6)
    assert report['cost_delta'] == pytest.approx(0.0, rel=1e-6)
    assert report['status'] == 'on_track'
    assert 'Custo estável' in report['summary']


def test_finops_pull_request_reports_endpoint_uses_latest_runs(
    telemetry_dataset, client: TestClient
) -> None:
    base_ts = telemetry_dataset[0].ts
    response = client.get(
        '/api/v1/telemetry/finops/pull-requests',
        params={
            'start': (base_ts - timedelta(days=1)).isoformat(),
            'end': (base_ts + timedelta(days=1)).isoformat(),
            'window_days': 3,
        },
    )

    assert response.status_code == 200

    payload = response.json()
    assert len(payload['items']) == 2

    first, second = payload['items']
    assert first['provider_id'] == 'gemini'
    assert first['cost_impact_usd'] == pytest.approx(1.75545, rel=1e-5)
    assert first['tokens_impact'] == 4600
    assert first['owner'] == 'alpha'
    assert first['status'] == 'on_track'
    assert first['merged_at'].startswith('2025-04-11')
    assert 'Custo estável' in first['summary']

    assert second['provider_id'] == 'glm46'
    assert second['cost_impact_usd'] == pytest.approx(1.10225, rel=1e-5)
    assert second['tokens_impact'] == 3300
    assert second['owner'] == 'beta'
    assert second['status'] == 'on_track'
    assert second['merged_at'].startswith('2025-04-10')


def test_telemetry_export_endpoint_supports_csv_and_html(client: TestClient) -> None:
    from console_mcp_server import database as database_module

    engine = database_module.bootstrap_database()
    base_ts = datetime(2025, 3, 10, 14, 0, tzinfo=timezone.utc)

    sample = {
        'provider_id': 'glm46',
        'tool': 'glm46.chat',
        'route': 'default',
        'tokens_in': 100,
        'tokens_out': 50,
        'duration_ms': 1000,
        'status': 'success',
        'cost_estimated_usd': 0.33,
        'metadata': '{}',
        'ts': base_ts.isoformat(),
        'source_file': 'glm46/sample.jsonl',
        'ingested_at': base_ts.isoformat(),
    }

    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO telemetry_events (
                    provider_id,
                    tool,
                    route,
                    tokens_in,
                    tokens_out,
                    duration_ms,
                    status,
                    cost_estimated_usd,
                    metadata,
                    ts,
                    source_file,
                    line_number,
                    ingested_at
                ) VALUES (
                    :provider_id,
                    :tool,
                    :route,
                    :tokens_in,
                    :tokens_out,
                    :duration_ms,
                    :status,
                    :cost_estimated_usd,
                    :metadata,
                    :ts,
                    :source_file,
                    1,
                    :ingested_at
                )
                """
            ),
            sample,
        )

    csv_response = client.get('/api/v1/telemetry/export')
    assert csv_response.status_code == 200
    assert csv_response.headers['content-type'].startswith('text/csv')
    assert 'glm46' in csv_response.text

    html_response = client.get(
        '/api/v1/telemetry/export',
        params={'format': 'html', 'provider_id': 'glm46'},
    )
    assert html_response.status_code == 200
    assert html_response.headers['content-type'].startswith('text/html')
    assert '<table' in html_response.text
    assert 'glm46' in html_response.text

    bad_format = client.get('/api/v1/telemetry/export', params={'format': 'xml'})
    assert bad_format.status_code == 400


def test_cost_policies_crud_flow(client: TestClient) -> None:
    list_empty = client.get('/api/v1/policies')
    assert list_empty.status_code == 200
    assert list_empty.json() == {'policies': []}

    create_payload = {
        'id': 'global-spend',
        'name': 'Global Spend Ceiling',
        'description': 'Cap monthly spend for all providers',
        'monthly_spend_limit': 1250.50,
        'currency': 'USD',
        'tags': ['global', 'finops'],
    }

    create_response = client.post('/api/v1/policies', json=create_payload)
    assert create_response.status_code == 201
    created = create_response.json()
    assert created['id'] == 'global-spend'
    assert created['name'] == 'Global Spend Ceiling'
    assert created['monthly_spend_limit'] == pytest.approx(1250.50)
    assert created['currency'] == 'USD'
    assert created['tags'] == ['global', 'finops']
    assert created['description'] == 'Cap monthly spend for all providers'
    assert created['created_at']
    assert created['updated_at']

    duplicate = client.post('/api/v1/policies', json=create_payload)
    assert duplicate.status_code == 409

    list_after_create = client.get('/api/v1/policies')
    assert list_after_create.status_code == 200
    policies = list_after_create.json()['policies']
    assert len(policies) == 1
    assert policies[0]['id'] == 'global-spend'

    read_response = client.get('/api/v1/policies/global-spend')
    assert read_response.status_code == 200
    assert read_response.json()['name'] == 'Global Spend Ceiling'

    update_payload = {
        'name': 'Updated Spend Ceiling',
        'description': 'Refined description',
        'monthly_spend_limit': 1750.0,
        'currency': 'EUR',
        'tags': ['europe'],
    }

    update_response = client.put('/api/v1/policies/global-spend', json=update_payload)
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated['name'] == 'Updated Spend Ceiling'
    assert updated['description'] == 'Refined description'
    assert updated['monthly_spend_limit'] == pytest.approx(1750.0)
    assert updated['currency'] == 'EUR'
    assert updated['tags'] == ['europe']
    assert updated['updated_at'] != updated['created_at']

    missing_update = client.put('/api/v1/policies/missing', json=update_payload)
    assert missing_update.status_code == 404

    delete_response = client.delete('/api/v1/policies/global-spend')
    assert delete_response.status_code == 204

    missing_read = client.get('/api/v1/policies/global-spend')
    assert missing_read.status_code == 404

    delete_missing = client.delete('/api/v1/policies/global-spend')
    assert delete_missing.status_code == 404

    list_after_delete = client.get('/api/v1/policies')
    assert list_after_delete.status_code == 200
    assert list_after_delete.json()['policies'] == []


def test_policy_templates_catalog(client: TestClient) -> None:
    response = client.get('/api/v1/policies/templates')
    assert response.status_code == 200

    payload = response.json()
    assert 'templates' in payload
    templates = payload['templates']
    assert len(templates) >= 3
    ids = {template['id'] for template in templates}
    assert {'economy', 'balanced', 'turbo'}.issubset(ids)

    sample = templates[0]
    assert sample['name']
    assert isinstance(sample['features'], list)
    assert all(isinstance(item, str) for item in sample['features'])


def test_policy_deployments_flow(client: TestClient) -> None:
    list_response = client.get('/api/v1/policies/deployments')
    assert list_response.status_code == 200
    payload = list_response.json()
    deployments = payload['deployments']
    assert len(deployments) >= 2
    assert payload['active_id'] == deployments[-1]['id']

    create_payload = {
        'template_id': 'turbo',
        'author': 'Console MCP',
        'window': 'Rollout monitorado',
        'note': 'Rollout manual: Turbo.',
    }

    create_response = client.post('/api/v1/policies/deployments', json=create_payload)
    assert create_response.status_code == 201
    created = create_response.json()
    assert created['template_id'] == 'turbo'
    assert created['author'] == 'Console MCP'
    assert created['window'] == 'Rollout monitorado'
    assert created['note'] == 'Rollout manual: Turbo.'
    assert created['slo_p95_ms'] == 569
    assert created['budget_usage_pct'] == 74
    assert created['incidents_count'] == 2
    assert created['guardrail_score'] == 72

    list_after_create = client.get('/api/v1/policies/deployments')
    assert list_after_create.status_code == 200
    payload_after = list_after_create.json()
    assert payload_after['active_id'] == created['id']
    ids = [item['id'] for item in payload_after['deployments']]
    assert created['id'] in ids

    delete_response = client.delete(f"/api/v1/policies/deployments/{created['id']}")
    assert delete_response.status_code == 204

    missing_delete = client.delete(f"/api/v1/policies/deployments/{created['id']}")
    assert missing_delete.status_code == 404

    bad_create = client.post(
        '/api/v1/policies/deployments', json={'template_id': 'missing', 'author': 'Ops'}
    )
    assert bad_create.status_code == 400


def test_price_table_crud_flow(client: TestClient) -> None:
    list_empty = client.get('/api/v1/prices')
    assert list_empty.status_code == 200
    assert list_empty.json() == {'entries': []}

    effective_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
    create_payload = {
        'id': 'openai-gpt4-turbo',
        'provider_id': 'openai',
        'model': 'gpt-4-turbo',
        'currency': 'USD',
        'unit': '1k_tokens',
        'input_cost_per_1k': 10.0,
        'output_cost_per_1k': 30.0,
        'embedding_cost_per_1k': None,
        'tags': ['chat', 'premium'],
        'notes': 'For high priority workloads',
        'effective_at': effective_at.isoformat(),
    }

    create_response = client.post('/api/v1/prices', json=create_payload)
    assert create_response.status_code == 201
    created = create_response.json()
    assert created['id'] == 'openai-gpt4-turbo'
    assert created['provider_id'] == 'openai'
    assert created['model'] == 'gpt-4-turbo'
    assert created['currency'] == 'USD'
    assert created['unit'] == '1k_tokens'
    assert created['input_cost_per_1k'] == pytest.approx(10.0)
    assert created['output_cost_per_1k'] == pytest.approx(30.0)
    assert created['embedding_cost_per_1k'] is None
    assert created['tags'] == ['chat', 'premium']
    assert created['notes'] == 'For high priority workloads'
    assert parse_iso(created['effective_at']) == effective_at
    assert created['created_at']
    assert created['updated_at']

    duplicate = client.post('/api/v1/prices', json=create_payload)
    assert duplicate.status_code == 409

    list_after_create = client.get('/api/v1/prices')
    assert list_after_create.status_code == 200
    entries = list_after_create.json()['entries']
    assert len(entries) == 1
    assert entries[0]['id'] == 'openai-gpt4-turbo'

    read_response = client.get('/api/v1/prices/openai-gpt4-turbo')
    assert read_response.status_code == 200
    assert read_response.json()['provider_id'] == 'openai'

    new_effective_at = datetime(2024, 6, 1, tzinfo=timezone.utc)
    update_payload = {
        'provider_id': 'openai',
        'model': 'gpt-4.1-mini',
        'currency': 'EUR',
        'unit': '1k_tokens',
        'input_cost_per_1k': 5.5,
        'output_cost_per_1k': 11.0,
        'embedding_cost_per_1k': 0.2,
        'tags': ['chat'],
        'notes': 'Repriced tier',
        'effective_at': new_effective_at.isoformat(),
    }

    update_response = client.put('/api/v1/prices/openai-gpt4-turbo', json=update_payload)
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated['model'] == 'gpt-4.1-mini'
    assert updated['currency'] == 'EUR'
    assert updated['input_cost_per_1k'] == pytest.approx(5.5)
    assert updated['output_cost_per_1k'] == pytest.approx(11.0)
    assert updated['embedding_cost_per_1k'] == pytest.approx(0.2)
    assert updated['tags'] == ['chat']
    assert updated['notes'] == 'Repriced tier'
    assert parse_iso(updated['effective_at']) == new_effective_at
    assert updated['updated_at'] != updated['created_at']

    missing_update = client.put('/api/v1/prices/missing', json=update_payload)
    assert missing_update.status_code == 404

    delete_response = client.delete('/api/v1/prices/openai-gpt4-turbo')
    assert delete_response.status_code == 204

    missing_read = client.get('/api/v1/prices/openai-gpt4-turbo')
    assert missing_read.status_code == 404

    delete_missing = client.delete('/api/v1/prices/openai-gpt4-turbo')
    assert delete_missing.status_code == 404

    list_after_delete = client.get('/api/v1/prices')
    assert list_after_delete.status_code == 200
    assert list_after_delete.json()['entries'] == []


def test_cost_dry_run_estimates_cost_without_override(client: TestClient) -> None:
    price_payload = {
        'id': 'gemini-standard',
        'provider_id': 'gemini',
        'model': 'flash-standard',
        'currency': 'USD',
        'unit': '1k_tokens',
        'input_cost_per_1k': 0.012,
        'output_cost_per_1k': 0.018,
        'embedding_cost_per_1k': None,
        'tags': ['chat'],
        'notes': 'Baseline tier',
        'effective_at': None,
    }

    create_price = client.post('/api/v1/prices', json=price_payload)
    assert create_price.status_code == 201

    dry_run_payload = {
        'provider_id': 'gemini',
        'project': 'console',
        'route': 'chat.default',
        'tokens_in': 1000,
        'tokens_out': 1000,
        'model': 'flash-standard',
    }

    response = client.post('/api/v1/policies/dry-run', json=dry_run_payload)
    assert response.status_code == 200

    body = response.json()
    assert body['estimated_cost_usd'] == pytest.approx(0.03)
    assert body['allowed'] is True
    assert body['guardrail'] is None
    assert body['limit_usd'] is None
    assert body['pricing']['entry_id'] == 'gemini-standard'
    assert 'Run is within guardrails' in body['message']


def test_cost_dry_run_blocks_when_exceeding_override_limit(client: TestClient) -> None:
    price_payload = {
        'id': 'gemini-standard',
        'provider_id': 'gemini',
        'model': 'flash-standard',
        'currency': 'USD',
        'unit': '1k_tokens',
        'input_cost_per_1k': 0.012,
        'output_cost_per_1k': 0.018,
        'embedding_cost_per_1k': None,
        'tags': ['chat'],
        'notes': 'Baseline tier',
        'effective_at': None,
    }

    assert client.post('/api/v1/prices', json=price_payload).status_code == 201

    override_payload = {
        'id': 'strict-cost',
        'route': 'chat.default',
        'project': 'console',
        'template_id': 'balanced',
        'max_latency_ms': 1500,
        'max_cost_usd': 0.02,
        'require_manual_approval': False,
        'notes': 'Cost ceiling enforced for regression tests',
    }

    create_override = client.post('/api/v1/policies/overrides', json=override_payload)
    assert create_override.status_code == 201

    dry_run_payload = {
        'provider_id': 'gemini',
        'project': 'console',
        'route': 'chat.default',
        'tokens_in': 1000,
        'tokens_out': 1000,
    }

    response = client.post('/api/v1/policies/dry-run', json=dry_run_payload)
    assert response.status_code == 200

    body = response.json()
    assert body['allowed'] is False
    assert body['estimated_cost_usd'] == pytest.approx(0.03)
    assert body['limit_usd'] == pytest.approx(0.02)
    assert body['guardrail']['id'] == 'strict-cost'
    assert 'exceeds guardrail limit' in body['message']


def test_cost_dry_run_requires_manual_approval(client: TestClient) -> None:
    price_payload = {
        'id': 'gemini-standard',
        'provider_id': 'gemini',
        'model': 'flash-standard',
        'currency': 'USD',
        'unit': '1k_tokens',
        'input_cost_per_1k': 0.01,
        'output_cost_per_1k': 0.02,
        'embedding_cost_per_1k': None,
        'tags': ['chat'],
        'notes': 'Manual approval tier',
        'effective_at': None,
    }

    assert client.post('/api/v1/prices', json=price_payload).status_code == 201

    override_payload = {
        'id': 'manual-gate',
        'route': 'chat.default',
        'project': 'console',
        'template_id': 'balanced',
        'max_latency_ms': None,
        'max_cost_usd': 5.0,
        'require_manual_approval': True,
        'notes': 'Require explicit approval before rollout',
    }

    assert client.post('/api/v1/policies/overrides', json=override_payload).status_code == 201

    dry_run_payload = {
        'provider_id': 'gemini',
        'project': 'console',
        'route': 'chat.default',
        'tokens_in': 500,
        'tokens_out': 500,
    }

    response = client.post('/api/v1/policies/dry-run', json=dry_run_payload)
    assert response.status_code == 200

    body = response.json()
    assert body['allowed'] is False
    assert body['guardrail']['id'] == 'manual-gate'
    assert 'Manual approval required' in body['message']


def test_routing_simulation_uses_price_table(client: TestClient) -> None:
    premium_payload = {
        'id': 'gemini-premium',
        'provider_id': 'gemini',
        'model': 'flash-premium',
        'currency': 'USD',
        'unit': '1k_tokens',
        'input_cost_per_1k': 0.018,
        'output_cost_per_1k': 0.022,
        'embedding_cost_per_1k': None,
        'tags': ['premium'],
        'notes': 'High throughput tier',
        'effective_at': None,
    }

    economy_payload = {
        'id': 'gemini-economy',
        'provider_id': 'gemini',
        'model': 'flash-economy',
        'currency': 'USD',
        'unit': '1k_tokens',
        'input_cost_per_1k': 0.004,
        'output_cost_per_1k': 0.006,
        'embedding_cost_per_1k': None,
        'tags': ['economy'],
        'notes': 'Cost optimised',
        'effective_at': None,
    }

    for payload in (premium_payload, economy_payload):
        response = client.post('/api/v1/prices', json=payload)
        assert response.status_code == 201

    simulation_payload = {
        'provider_ids': ['gemini', 'codex'],
        'strategy': 'finops',
        'failover_provider_id': 'codex',
        'volume_millions': 10.0,
    }

    response = client.post('/api/v1/routing/simulate', json=simulation_payload)
    assert response.status_code == 200

    body = response.json()
    assert body['excluded_route']['id'] == 'codex'
    assert body['total_cost'] == pytest.approx(100.0)
    assert body['cost_per_million'] == pytest.approx(10.0)
    assert body['avg_latency'] > 0
    assert body['reliability_score'] > 0

    distribution = body['distribution']
    assert len(distribution) == 1
    entry = distribution[0]
    assert entry['route']['id'] == 'gemini'
    assert entry['route']['cost_per_million'] == pytest.approx(10.0)
    assert entry['share'] == pytest.approx(1.0)
    assert entry['tokens_millions'] == pytest.approx(10.0)
    assert entry['cost'] == pytest.approx(100.0)


def test_routing_simulation_rejects_unknown_provider(client: TestClient) -> None:
    response = client.post(
        '/api/v1/routing/simulate', json={'provider_ids': ['missing'], 'volume_millions': 5}
    )
    assert response.status_code == 404
    assert 'Providers not found' in response.text


def test_mcp_servers_crud_flow(client: TestClient) -> None:
    list_empty = client.get('/api/v1/servers')
    assert list_empty.status_code == 200
    assert list_empty.json() == {'servers': []}

    create_payload = {
        'id': 'anthropic',
        'name': 'Anthropic Claude',
        'command': '~/.local/bin/claude-mcp',
        'description': 'Test provider',
        'tags': ['claude', 'beta'],
        'capabilities': ['chat', 'tools'],
        'transport': 'stdio',
    }
    create_response = client.post('/api/v1/servers', json=create_payload)
    assert create_response.status_code == 201
    body = create_response.json()
    assert body['id'] == 'anthropic'
    assert body['name'] == 'Anthropic Claude'
    assert body['tags'] == ['claude', 'beta']
    assert body['capabilities'] == ['chat', 'tools']
    assert body['transport'] == 'stdio'
    assert body['created_at']
    assert body['updated_at']

    duplicate = client.post('/api/v1/servers', json=create_payload)
    assert duplicate.status_code == 409

    read_response = client.get('/api/v1/servers/anthropic')
    assert read_response.status_code == 200
    assert read_response.json()['command'] == '~/.local/bin/claude-mcp'

    update_payload = {
        'name': 'Anthropic Claude 3',
        'command': '~/.local/bin/claude3-mcp',
        'description': 'Updated description',
        'tags': ['claude'],
        'capabilities': ['chat'],
        'transport': 'http',
    }
    update_response = client.put('/api/v1/servers/anthropic', json=update_payload)
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated['name'] == 'Anthropic Claude 3'
    assert updated['command'] == '~/.local/bin/claude3-mcp'
    assert updated['transport'] == 'http'
    assert updated['tags'] == ['claude']
    assert updated['capabilities'] == ['chat']
    assert updated['description'] == 'Updated description'
    assert updated['updated_at'] != updated['created_at']

    list_after_update = client.get('/api/v1/servers')
    assert list_after_update.status_code == 200
    servers = list_after_update.json()['servers']
    assert len(servers) == 1
    assert servers[0]['id'] == 'anthropic'

    delete_response = client.delete('/api/v1/servers/anthropic')
    assert delete_response.status_code == 204

    missing_read = client.get('/api/v1/servers/anthropic')
    assert missing_read.status_code == 404

    delete_missing = client.delete('/api/v1/servers/anthropic')
    assert delete_missing.status_code == 404


def test_routing_simulation_endpoint_returns_distribution(client: TestClient) -> None:
    response = client.post(
        '/api/v1/routing/simulate',
        json={
            'provider_ids': ['gemini', 'codex'],
            'strategy': 'resilience',
            'failover_provider_id': 'gemini',
            'volume_millions': 15,
        },
    )

    assert response.status_code == 200
    payload = response.json()

    assert payload['total_cost'] >= 0
    assert payload['cost_per_million'] >= 0
    assert payload['distribution']
    assert all(entry['route']['id'] != 'gemini' for entry in payload['distribution'])
    assert payload['excluded_route']['id'] == 'gemini'


def test_routing_simulation_endpoint_validates_provider_ids(client: TestClient) -> None:
    response = client.post(
        '/api/v1/routing/simulate',
        json={
            'provider_ids': ['missing-provider'],
            'strategy': 'balanced',
            'failover_provider_id': None,
            'volume_millions': 10,
        },
    )

    assert response.status_code == 404
    detail = response.json()['detail']
    assert 'Providers not found' in detail


def test_process_supervisor_flow(client: TestClient) -> None:
    command = f"{sys.executable} -c 'import time; time.sleep(60)'"
    create_payload = {
        'id': 'supervisor-test',
        'name': 'Process Supervisor Fixture',
        'command': command,
        'description': 'Long running python sleep command',
        'tags': ['test'],
        'capabilities': ['sleep'],
        'transport': 'stdio',
    }

    create_response = client.post('/api/v1/servers', json=create_payload)
    assert create_response.status_code == 201

    status_before = client.get('/api/v1/servers/supervisor-test/process')
    assert status_before.status_code == 200
    before_body = status_before.json()['process']
    assert before_body['status'] == 'stopped'
    assert before_body['pid'] is None
    assert before_body['logs'] == []
    assert before_body['cursor'] is None

    start_response = client.post('/api/v1/servers/supervisor-test/process/start')
    assert start_response.status_code == 200
    start_body = start_response.json()['process']
    assert start_body['status'] == 'running'
    assert isinstance(start_body['pid'], int)
    assert len(start_body['logs']) >= 1
    assert start_body['cursor'] is not None
    start_cursor = start_body['cursor']

    duplicate_start = client.post('/api/v1/servers/supervisor-test/process/start')
    assert duplicate_start.status_code == 409

    list_response = client.get('/api/v1/servers/processes')
    assert list_response.status_code == 200
    processes = list_response.json()['processes']
    assert any(proc['server_id'] == 'supervisor-test' for proc in processes)
    process_entry = next(proc for proc in processes if proc['server_id'] == 'supervisor-test')
    assert process_entry['logs']

    stop_response = client.post('/api/v1/servers/supervisor-test/process/stop')
    assert stop_response.status_code == 200
    stopped_body = stop_response.json()['process']
    assert stopped_body['status'] in {'stopped', 'error'}
    assert stopped_body['cursor'] is not None
    stop_cursor = stopped_body['cursor']
    logs_tail = client.get(
        f"/api/v1/servers/supervisor-test/process/logs?cursor={start_cursor}"
    )
    assert logs_tail.status_code == 200
    tail_payload = logs_tail.json()
    assert tail_payload['logs']
    assert tail_payload['cursor'] == stop_cursor
    assert all(int(entry['id']) > int(start_cursor) for entry in tail_payload['logs'])

    second_stop = client.post('/api/v1/servers/supervisor-test/process/stop')
    assert second_stop.status_code == 409

    restart_response = client.post('/api/v1/servers/supervisor-test/process/restart')
    assert restart_response.status_code == 200
    restarted = restart_response.json()['process']
    assert restarted['status'] == 'running'
    assert isinstance(restarted['pid'], int)

    final_stop = client.post('/api/v1/servers/supervisor-test/process/stop')
    assert final_stop.status_code == 200
    assert final_stop.json()['process']['status'] in {'stopped', 'error'}
