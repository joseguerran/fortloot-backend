
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const DEFAULT_URL = 'http://0.0.0.0:3001/api/public-health';
const HEALTHCHECK_URL = process.env.HEALTHCHECK_URL || DEFAULT_URL;
const TIMEOUT_MS = Number(process.env.HEALTHCHECK_TIMEOUT_MS || 2000);

function check(urlStr: string, timeoutMs: number): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = new URL(urlStr);
      const client = url.protocol === 'https:' ? https : http;
      const req = client.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          method: 'GET',
          timeout: timeoutMs,
        },
        (res) => {
          // Consume data to free memory
          res.resume();
          resolve(res.statusCode || 500);
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error('Request timed out'));
        resolve(408);
      });

      req.on('error', () => resolve(500));
      req.end();
    } catch (_e) {
      resolve(500);
    }
  });
}

(async () => {
  const status = await check(HEALTHCHECK_URL, TIMEOUT_MS);
  if (status >= 200 && status < 300) {
    process.exit(0);
  } else {
    process.exit(1);
  }
})();
