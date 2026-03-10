/**
 * Run C++ code via Piston API (https://github.com/engineer-man/piston).
 * Set PISTON_EXECUTE_URL in env if using a self-hosted instance (e.g. http://localhost:2000/api/v2/execute).
 * Tries public instances: /api/v2/execute then /api/v2/piston/execute on emkc.org
 */
const PISTON_URLS = [
  process.env.PISTON_EXECUTE_URL,
  'https://emkc.org/api/v2/execute',
  'https://emkc.org/api/v2/piston/execute',
].filter(Boolean);
const RUN_TIMEOUT_MS = 5000;

async function runCpp(sourceCode, stdin) {
  const payload = {
    language: 'cpp',
    version: '*',
    files: [{ name: 'main.cpp', content: sourceCode }],
    stdin: stdin || '',
    run_timeout: RUN_TIMEOUT_MS,
  };

  let lastError = null;
  for (const url of PISTON_URLS) {
    try {
      const result = await tryRun(url, payload);
      if (result) return result;
    } catch (e) {
      lastError = e.message || String(e);
    }
  }
  return { ok: false, stdout: '', stderr: lastError || 'Execution service unavailable', error: lastError || 'Try again later or set PISTON_EXECUTE_URL.' };
}

async function tryRun(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(RUN_TIMEOUT_MS + 2000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  const data = await res.json();

  // Piston returns { run: { stdout, stderr, code, signal }, compile?: { ... } }; code can be number or string
  const run = data.run || data;
  const compile = data.compile;
  const stdout = (run.stdout || '').trim();
  const stderr = (run.stderr || '').trim();
  const runCode = run.code != null ? Number(run.code) : 0;
  const compileCode = compile && compile.code != null ? Number(compile.code) : 0;
  const compileFailed = compile && (compileCode !== 0 || compile.signal);
  const runFailed = (runCode !== 0) || run.signal;

  if (compileFailed) {
    return { ok: false, stdout: compile.stdout || '', stderr: compile.stderr || 'Compilation failed', error: 'Compilation failed' };
  }
  if (runFailed) {
    return { ok: false, stdout, stderr, error: stderr || 'Runtime error' };
  }
  return { ok: true, stdout, stderr };
}

module.exports = { runCpp };
