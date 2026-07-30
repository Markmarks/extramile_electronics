// k6 — N-02: 200 VUs browsing for 5 min, p95 < 800ms, error rate < 0.5%.
// Run: BASE_URL=https://preview.example.com k6 run load/browse.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '1m', target: 200 },
    { duration: '3m', target: 200 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.005'],
  },
};

const paths = ['/', '/search', '/c/smartphones', '/c/laptops', '/p/iphone-15'];

export default function () {
  const path = paths[Math.floor(Math.random() * paths.length)];
  const res = http.get(`${BASE}${path}`);
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(Math.random() * 2);
}
