module.exports = {
  ci: {
    collect: {
      url: ['http://127.0.0.1:4173/?view=observability'],
      numberOfRuns: 1,
      startServerCommand: 'pnpm preview --host 0.0.0.0 --port 4173',
      startServerReadyPattern: 'Local',
      settings: {
        preset: 'desktop',
        formFactor: 'desktop',
        screenEmulation: {
          mobile: false,
          width: 1365,
          height: 769,
          deviceScaleFactor: 1,
          disabled: false,
        },
        throttlingMethod: 'devtools',
        throttling: {
          rttMs: 20,
          throughputKbps: 20000,
          cpuSlowdownMultiplier: 1,
          requestLatencyMs: 0,
          downloadThroughputKbps: 0,
          uploadThroughputKbps: 0,
        },
        disableStorageReset: true,
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: '../docs/evidence/TASK-UI-OBS-082/lighthouse',
    },
  },
};
