import { useState, useEffect } from 'react';
import { runCodeChallenge, verifyCodeChallenge, getCodeChallengeStatus } from './api';
import './LeetCodeGate.css';

const DEFAULT_CPP = `#include <iostream>
#include <vector>
#include <sstream>
using namespace std;

// main : 

int main() {
    string line;
    getline(cin, line);
    stringstream ss(line);
    vector<int> nums;
    int x;
    while (ss >> x) nums.push_back(x);
    int target;
    cin >> target;
    for (int i = 0; i < (int)nums.size(); i++) {
        for (int j = i + 1; j < (int)nums.size(); j++) {
            if (nums[i] + nums[j] == target) {
                cout << i << " " << j << endl;
                return 0;
            }
        }
    }
    return 1;
}
`;

export default function LeetCodeGate({ onPass, onLogout }) {
  const [code, setCode] = useState(DEFAULT_CPP);
  const [runOutput, setRunOutput] = useState(null);
  const [verifyMessage, setVerifyMessage] = useState('');
  const [tryAgainTomorrow, setTryAgainTomorrow] = useState(false);
  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [secretsConfigured, setSecretsConfigured] = useState(null);

  useEffect(() => {
    getCodeChallengeStatus()
      .then(({ configured }) => setSecretsConfigured(configured))
      .catch(() => setSecretsConfigured(false));
  }, []);

  const handleRun = async (e) => {
    e.preventDefault();
    setVerifyMessage('');
    setTryAgainTomorrow(false);
    setLoadingRun(true);
    setRunOutput(null);
    try {
      const result = await runCodeChallenge(code);
      setRunOutput({ ok: result.ok, stdout: result.stdout || '', stderr: result.stderr || '' });
    } catch (err) {
      setRunOutput({ ok: false, stdout: '', stderr: err.message || 'Run failed' });
    } finally {
      setLoadingRun(false);
    }
  };

  const codeTrimmed = (code || '').trim();
  const canSubmit = codeTrimmed.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = (code || '').trim();
    if (trimmed.length === 0) {
      setVerifyMessage('Success. Please come back again.');
      return;
    }
    if (!canSubmit) return;
    setVerifyMessage('');
    setTryAgainTomorrow(false);
    setRunOutput(null);
    setLoadingSubmit(true);
    try {
      const result = await verifyCodeChallenge(code);
      if (result && result.passed === true) {
        onPass();
        return;
      }
      setVerifyMessage(result?.message || 'Submission failed.');
      setTryAgainTomorrow(!!(result && result.tryAgainTomorrow));
    } catch (err) {
      setVerifyMessage(err.message || 'Submission failed. Check the Run output or try again.');
    } finally {
      setLoadingSubmit(false);
    }
  };

  return (
    <div className="leetcode-gate">
      <header className="leetcode-gate-header">
        <span className="leetcode-gate-logo">LeetCode</span>
        <span className="leetcode-gate-badge">Solve to unlock Discuss</span>
        {onLogout && (
          <button type="button" className="leetcode-gate-logout" onClick={onLogout} title="Log out">
            Log out
          </button>
        )}
      </header>

      {secretsConfigured === false && (
        <div className="leetcode-gate-status leetcode-gate-status--error" role="alert">
          Code challenge not configured. Set <code>CODE_CHALLENGE_MAIN_PASSWORD</code> in server <code>.env</code> and restart.
        </div>
      )}
      {secretsConfigured === true && (
        <div className="leetcode-gate-status leetcode-gate-status--ok" aria-hidden="true">
          Ready.
        </div>
      )}

      <main className="leetcode-gate-main">
        <div className="leetcode-gate-card">
          <div className="leetcode-gate-title-row">
            <span className="leetcode-gate-difficulty leetcode-gate-difficulty--easy">Easy</span>
            <h1 className="leetcode-gate-problem-title">1. Two Sum</h1>
          </div>

          <div className="leetcode-gate-description">
            <p>
              Given an array of integers <code>nums</code> and an integer <code>target</code>, return{' '}
              <em>indices of the two numbers such that they add up to</em> <code>target</code>.
            </p>
            <p>You may assume that each input would have <strong>exactly one solution</strong>, and you may not use the same element twice.</p>
            <h3>Input (stdin)</h3>
            <pre>First line: space-separated integers (the array)\nSecond line: target</pre>
            <p className="leetcode-gate-example-inline">
              Example: <code>2 7 11 15</code> then <code>9</code> → output <code>0 1</code>
            </p>
          </div>

          <div className="leetcode-gate-editor-section">
            <label className="leetcode-gate-label">C++ code</label>
            <textarea
              className="leetcode-gate-code"
              spellCheck="false"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Write your solution in C++..."
              rows={18}
            />
            <div className="leetcode-gate-actions">
              <button
                type="button"
                className="leetcode-gate-btn leetcode-gate-btn--run"
                onClick={handleRun}
                disabled={!canSubmit || loadingRun || loadingSubmit}
              >
                {loadingRun ? 'Running…' : 'Run'}
              </button>
              <button
                type="button"
                className="leetcode-gate-btn leetcode-gate-btn--submit"
                onClick={handleSubmit}
                disabled={!canSubmit || loadingRun || loadingSubmit}
              >
                {loadingSubmit ? 'Submitting…' : 'Submit'}
              </button>
            </div>
            {runOutput != null && (
              <div className={`leetcode-gate-output ${runOutput.ok ? 'leetcode-gate-output--ok' : 'leetcode-gate-output--err'}`}>
                <pre>{runOutput.stdout || '(no output)'}</pre>
                {runOutput.stderr && <pre className="leetcode-gate-output-stderr">{runOutput.stderr}</pre>}
              </div>
            )}
            {verifyMessage && (
              <p className={`leetcode-gate-verify-msg ${tryAgainTomorrow ? 'leetcode-gate-verify-msg--tomorrow' : 'leetcode-gate-error'}`}>
                {verifyMessage}
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
