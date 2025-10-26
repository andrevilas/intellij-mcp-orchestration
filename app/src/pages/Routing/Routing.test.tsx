import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Routing from './index';
import type { ProviderSummary, RoutingSimulationResult } from '../../api';
import { simulateRouting } from '../../api';
import { ROUTING_TEST_IDS } from '../testIds';

type ApiModule = typeof import('../../api');

vi.mock('../../api', async () => {
  const actual = await vi.importActual<ApiModule>('../../api');
  return {
    ...actual,
    simulateRouting: vi.fn(),
  } satisfies Partial<ApiModule>;
});

describe('Routing page remote simulation', () => {
  const providers: ProviderSummary[] = [
    {
      id: 'glm',
      name: 'GLM 46',
      command: 'glm46',
      description: 'Modelo GLM 46',
      capabilities: ['chat'],
      tags: ['llm'],
      transport: 'stdio',
      is_available: true,
    },
    {
      id: 'claude',
      name: 'Claude MCP',
      command: 'claude',
      description: 'Claude workspace',
      capabilities: ['chat'],
      tags: ['llm'],
      transport: 'stdio',
      is_available: true,
    },
  ];

  const baselinePlan: RoutingSimulationResult = {
    context: {
      strategy: 'balanced',
      providerIds: providers.map((provider) => provider.id),
      providerCount: providers.length,
      volumeMillions: 12,
      failoverProviderId: null,
    },
    cost: {
      totalUsd: 240,
      costPerMillionUsd: 20,
    },
    latency: {
      avgLatencyMs: 940,
      reliabilityScore: 94.2,
    },
    distribution: [
      {
        route: {
          id: 'glm',
          provider: providers[0],
          lane: 'balanced',
          costPerMillion: 20,
          latencyP95: 960,
          reliability: 95,
          capacityScore: 80,
        },
        share: 0.5,
        tokensMillions: 6,
        cost: 120,
      },
      {
        route: {
          id: 'claude',
          provider: providers[1],
          lane: 'turbo',
          costPerMillion: 40,
          latencyP95: 720,
          reliability: 93,
          capacityScore: 70,
        },
        share: 0.5,
        tokensMillions: 6,
        cost: 120,
      },
    ],
    excludedRoute: null,
  };

  const planResult: RoutingSimulationResult = {
    context: {
      strategy: 'finops',
      providerIds: providers.map((provider) => provider.id),
      providerCount: providers.length,
      volumeMillions: 12,
      failoverProviderId: 'claude',
    },
    cost: {
      totalUsd: 210,
      costPerMillionUsd: 17.5,
    },
    latency: {
      avgLatencyMs: 880,
      reliabilityScore: 95.3,
    },
    distribution: [
      {
        route: {
          id: 'glm',
          provider: providers[0],
          lane: 'balanced',
          costPerMillion: 20,
          latencyP95: 940,
          reliability: 95,
          capacityScore: 80,
        },
        share: 0.7,
        tokensMillions: 8.4,
        cost: 168,
      },
      {
        route: {
          id: 'claude',
          provider: providers[1],
          lane: 'turbo',
          costPerMillion: 35,
          latencyP95: 720,
          reliability: 94,
          capacityScore: 70,
        },
        share: 0.3,
        tokensMillions: 3.6,
        cost: 42,
      },
    ],
    excludedRoute: {
      id: 'claude',
      provider: providers[1],
      lane: 'turbo',
      costPerMillion: 35,
      latencyP95: 720,
      reliability: 94,
      capacityScore: 70,
    },
  };

  const simulateRoutingMock = simulateRouting as unknown as Mock;
  const ERROR_MESSAGE = 'Não foi possível simular o roteamento. Tente novamente em instantes.';

  beforeEach(() => {
    vi.clearAllMocks();
    simulateRoutingMock.mockReset();
  });

  it('carrega simulação do backend e exibe métricas', async () => {
    simulateRoutingMock.mockResolvedValueOnce(baselinePlan);
    simulateRoutingMock.mockResolvedValueOnce(planResult);

    render(<Routing providers={providers} isLoading={false} initialError={null} />);

    await waitFor(() => expect(simulateRoutingMock).toHaveBeenCalledTimes(2));

    const [baselinePayload, planPayload] = simulateRoutingMock.mock.calls.map((call) => call[0]);
    expect(baselinePayload).toMatchObject({
      strategy: 'balanced',
      providerIds: ['glm', 'claude'],
      failoverProviderId: null,
      volumeMillions: 12,
    });
    expect(planPayload).toMatchObject({
      strategy: 'finops',
      providerIds: ['glm', 'claude'],
      failoverProviderId: null,
      volumeMillions: 12,
    });
    expect(baselinePayload.intents).toEqual([]);
    expect(baselinePayload.rules).toEqual([]);
    expect(planPayload.intents).toEqual([]);
    expect(planPayload.rules).toEqual([]);

    await waitFor(() =>
      expect(screen.getByTestId(ROUTING_TEST_IDS.totalCost)).toHaveTextContent(/US\$/),
    );
    expect(screen.getByTestId(ROUTING_TEST_IDS.savings)).toHaveTextContent(/US\$/);
    expect(screen.getAllByText('GLM 46').length).toBeGreaterThan(0);
    expect(screen.getByText(/Claude MCP ficou indisponível/)).toBeInTheDocument();
  });

  it('atualiza o failover e reenvia para a API', async () => {
    simulateRoutingMock.mockResolvedValue(baselinePlan);

    render(<Routing providers={providers} isLoading={false} initialError={null} />);

    await waitFor(() => expect(simulateRoutingMock).toHaveBeenCalledTimes(2));

    const failoverControl = screen.getByLabelText('Falha simulada');
    await userEvent.selectOptions(failoverControl, 'GLM 46');

    await waitFor(() => {
      const failoverCalls = simulateRoutingMock.mock.calls.filter(
        (call) => call[0]?.failoverProviderId === 'glm',
      );
      expect(failoverCalls.length).toBeGreaterThan(0);
    });

    await userEvent.selectOptions(failoverControl, '');
    await waitFor(() => {
      const resetCalls = simulateRoutingMock.mock.calls.filter(
        (call) => call[0]?.failoverProviderId === null,
      );
      expect(resetCalls.length).toBeGreaterThan(0);
    });
  });

  it('exibe mensagem de erro quando a simulação falha', async () => {
    simulateRoutingMock.mockRejectedValue(new Error('boom'));

    render(<Routing providers={providers} isLoading={false} initialError={null} />);

    await waitFor(() => expect(screen.getAllByText(ERROR_MESSAGE).length).toBeGreaterThan(0));
  });
});
