import { expect } from 'chai';
import sinon from 'sinon';
import axios from 'axios';
import getTaskStatus from '../lib/getTaskStatus.js';

describe('getTaskStatus helper', () => {
  afterEach(() => sinon.restore());

  it('should fetch task status for a task', async () => {
    const fakeTask = { id: 1, status: 'COMPLETED', foo: 'bar' };
    sinon.stub(axios, 'get').resolves({ data: fakeTask });
    const result = await getTaskStatus('token', 1);
    expect(result).to.deep.equal({ status: 'COMPLETED', task: fakeTask });
    axios.get.restore();
  });

  it('should handle axios error', async () => {
    sinon.stub(axios, 'get').rejects(new Error('Network error'));
    try {
      await getTaskStatus('token', 1);
      throw new Error('Should have thrown');
    } catch (err) {
      expect(err.message).to.equal('Network error');
    }
    axios.get.restore();
  });

  it('should handle empty response', async () => {
    sinon.stub(axios, 'get').resolves({ data: undefined });
    const result = await getTaskStatus('token', 1);
    expect(result).to.deep.equal({ status: undefined, task: {} });
    axios.get.restore();
  });
});