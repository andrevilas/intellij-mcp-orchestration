module.exports = {
  ci: {
    collect: {
      url: ['http://127.0.0.1:4173/'],
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
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: 'metrics/lighthouse',
    },
  },
};
