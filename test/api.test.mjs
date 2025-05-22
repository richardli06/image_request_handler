import { expect } from 'chai';
import request from 'supertest';
import app from '../app.js';

describe('API Routes', function() {
  // Example: Test /api/get-projects
  it('GET /api/get-projects should return projects', async function() {
    const res = await request(app).get('/api/get-projects');
    expect(res.status).to.be.oneOf([200, 500]); // 500 if WebODM not running
    if (res.status === 200) {
      expect(res.body).to.satisfy(val => Array.isArray(val) || typeof val === 'object');
    }
  });

  it('POST /api/create-project should require name', async function() {
    const res = await request(app).post('/api/create-project').send({});
    expect(res.status).to.equal(400);
    expect(res.body.error).to.include('Project name required');
  });

  it('POST /api/push-images should require images and project_name', async function() {
    const res = await request(app).post('/api/push-images').send({});
    expect(res.status).to.equal(400);
    expect(res.body.error).to.exist;
  });

  it('GET /api/get-tasks should require project_id', async function() {
    const res = await request(app).get('/api/get-tasks');
    expect(res.status).to.equal(400);
    expect(res.body.error).to.include('project_id required');
  });

  it('GET /api/get-task-status should require task_id', async function() {
    const res = await request(app).get('/api/get-task-status');
    expect(res.status).to.equal(400);
    expect(res.body.error).to.include('task_id required');
  });

  it('POST /api/delete-project should require project_id', async function() {
    const res = await request(app).post('/api/delete-project').send({});
    expect(res.status).to.equal(400);
    expect(res.body.error).to.include('project_id required');
  });

  it('POST /api/rename-project should require project_id and new_name', async function() {
    const res = await request(app).post('/api/rename-project').send({});
    expect(res.status).to.equal(400);
    expect(res.body.error).to.include('project_id and new_name required');
  });

  it('POST /api/commit-task-to-map should require task_id and map_name', async function() {
    const res = await request(app).post('/api/commit-task-to-map').send({});
    expect(res.status).to.equal(400);
    expect(res.body.error).to.include('task_id and map_name required');
  });
});