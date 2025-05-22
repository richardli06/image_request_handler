import { expect } from 'chai';
import sinon from 'sinon';
import axios from 'axios';
import getTasks from '../lib/getTasks.js';

describe('getTasks helper', () => {
  afterEach(() => sinon.restore());

  it('should fetch tasks for a project', async () => {
    const fakeTasks = [{ id: 1, name: 'Task1' }];
    sinon.stub(axios, 'get').resolves({ data: fakeTasks });
    const result = await getTasks('token', 123);
    expect(result).to.deep.equal(fakeTasks);
    axios.get.restore();
  });

  it('should handle axios error', async () => {
    sinon.stub(axios, 'get').rejects(new Error('Network error'));
    try {
      await getTasks('token', 123);
      throw new Error('Should have thrown');
    } catch (err) {
      expect(err.message).to.equal('Network error');
    }
    axios.get.restore();
  });

  it('should handle empty response', async () => {
    sinon.stub(axios, 'get').resolves({ data: undefined });
    const result = await getTasks('token', 123);
    expect(result).to.be.undefined;
    axios.get.restore();
  });
});