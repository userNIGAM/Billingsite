import request from 'supertest';
import { createApp } from '../app';

describe('GET /api/health', () => {
  it('returns ok status and db connection state', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.db).toBe('connected');
  });
});

describe('unknown route', () => {
  it('returns a clean 404 envelope, not an HTML error page', async () => {
    const app = createApp();
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      code: 'ROUTE_NOT_FOUND',
      message: expect.stringContaining('/api/does-not-exist'),
    });
  });
});
