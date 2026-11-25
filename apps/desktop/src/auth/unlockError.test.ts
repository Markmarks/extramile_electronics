import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthUnknownError,
  createClient,
} from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyRefreshError,
  unlockFailureMessage,
  UNLOCK_NETWORK_MESSAGE,
  UNLOCK_REJECTED_MESSAGE,
} from './unlockError';

describe('classifyRefreshError', () => {
  it('treats fetch failures and 5xx as network (keep the vault)', () => {
    expect(classifyRefreshError(new AuthRetryableFetchError('Failed to fetch', 0))).toBe('network');
    expect(classifyRefreshError(new AuthRetryableFetchError('Bad gateway', 502))).toBe('network');
    expect(classifyRefreshError(new AuthApiError('Internal error', 500, undefined))).toBe(
      'network',
    );
  });

  it('treats a 4xx refusal of the token as rejected', () => {
    expect(
      classifyRefreshError(
        new AuthApiError('Invalid Refresh Token: Already Used', 400, 'refresh_token_already_used'),
      ),
    ).toBe('rejected');
    expect(
      classifyRefreshError(
        new AuthApiError(
          'Invalid Refresh Token: Refresh Token Not Found',
          400,
          'refresh_token_not_found',
        ),
      ),
    ).toBe('rejected');
  });

  it('does not call rate limits or odd errors a rejected token', () => {
    expect(
      classifyRefreshError(new AuthApiError('Too many requests', 429, 'over_request_rate_limit')),
    ).toBe('unknown');
    expect(classifyRefreshError(new AuthUnknownError('weird', new Error('x')))).toBe('unknown');
    expect(classifyRefreshError(new Error('boom'))).toBe('unknown');
    expect(classifyRefreshError(null)).toBe('unknown');
  });

  it('maps each kind to a message that says what to do', () => {
    expect(unlockFailureMessage('network', null)).toBe(UNLOCK_NETWORK_MESSAGE);
    expect(unlockFailureMessage('rejected', null)).toBe(UNLOCK_REJECTED_MESSAGE);
    expect(unlockFailureMessage('unknown', new Error('boom'))).toContain('(boom)');
  });
});

/** The real supabase-js refreshSession against a stubbed network, end to end. */
async function refreshWith(fetchImpl: typeof fetch) {
  const client = createClient('https://example.supabase.co', 'anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchImpl },
  });
  // supabase-js retries retryable failures with backoff for ~30 s before giving up; fake
  // timers fast-forward through that instead of waiting in real time.
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
  const pending = client.auth.refreshSession({ refresh_token: 'sealed-token' });
  await vi.advanceTimersByTimeAsync(60_000);
  const { error } = await pending;
  return classifyRefreshError(error);
}

describe('refreshSession errors as supabase-js actually returns them', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('offline → network', async () => {
    expect(await refreshWith(() => Promise.reject(new TypeError('Failed to fetch')))).toBe(
      'network',
    );
  });

  it('paused/unreachable project (503) → network', async () => {
    expect(await refreshWith(async () => new Response('unavailable', { status: 503 }))).toBe(
      'network',
    );
  });

  it('token already used → rejected', async () => {
    const body = JSON.stringify({
      code: 400,
      error_code: 'refresh_token_already_used',
      msg: 'Invalid Refresh Token: Already Used',
    });
    expect(
      await refreshWith(
        async () =>
          new Response(body, { status: 400, headers: { 'content-type': 'application/json' } }),
      ),
    ).toBe('rejected');
  });
});
