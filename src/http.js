// -----------------------------------------------------------------------------
// The one HTTP helper of the integration: GET a JSON document from a public
// open-data service, with a timeout and an identifying User-Agent. Both
// services are keyless: no header ever carries a secret.
// -----------------------------------------------------------------------------

export const USER_AGENT =
  'gladys-vigicrues (Gladys Assistant integration; +https://github.com/guim31/gladys-vigicrues)';

export class HttpError extends Error {
  /**
   * @param {string} message
   * @param {number|null} status HTTP status, null for a network error or a bad body
   */
  constructor(message, status = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * GET `url` and parse its JSON body. Hub'Eau answers 206 for a page that has a
 * next one: 200 and 206 are both a success.
 * @param {Function} fetchImpl fetch
 * @param {string} url
 * @param {object} [options]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<unknown>}
 */
export async function getJson(fetchImpl, url, { timeoutMs = 30000 } = {}) {
  const host = new URL(url).host;
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason =
      err?.name === 'TimeoutError' ? `no answer in ${timeoutMs / 1000} s` : err.message;
    throw new HttpError(`${host}: ${reason}`);
  }
  if (response.status !== 200 && response.status !== 206) {
    throw new HttpError(`${host}: HTTP ${response.status}`, response.status);
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(`${host}: the answer is not JSON`, response.status);
  }
}
