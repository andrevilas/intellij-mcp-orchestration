const filter = (chunk) => {
  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
  if (typeof text === 'string' && text.includes('legacy-js-api')) {
    return true;
  }
  return false;
};

const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = function suppressLegacyWarnings(chunk, encoding, cb) {
  if (filter(chunk)) {
    if (typeof cb === 'function') {
      cb();
    }
    return true;
  }
  return originalStdoutWrite(chunk, encoding, cb);
};

const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = function suppressLegacyWarningsStderr(chunk, encoding, cb) {
  if (filter(chunk)) {
    if (typeof cb === 'function') {
      cb();
    }
    return true;
  }
  return originalStderrWrite(chunk, encoding, cb);
};
