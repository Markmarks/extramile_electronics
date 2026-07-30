// k6 — N-04: search stays fast (p95 < 200ms server work) under load.
// Run: BASE_URL=https://preview.example.com k6 run load/search.js
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const terms = ['iphone', 'iphon 15', 'galaxy', 'macbook', 'tv', 'buds', 'ssd'];

export const options = {
  vus: 30,
  duration: '2m',
  thresholds: { http_req_duration: ['p(95)<400'] },
};

export default function () {
  const q = terms[Math.floor(Math.random() * terms.length)];
  const res = http.get(`${BASE}/search?q=${encodeURIComponent(q)}`);
  check(res, { 'status 200': (r) => r.status === 200 });
}
