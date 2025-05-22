import { expect } from 'chai';
import sinon from 'sinon';
import axios from 'axios';
import { getProjects } from '../lib/webodm.js';

describe('getProjects helper', () => {
  afterEach(() => sinon.restore());

  it('should fetch projects', async () => {
    const fakeProjects = { results: [{ id: 1, name: 'proj' }] };
    sinon.stub(axios, 'get').resolves({ data: fakeProjects });
    const result = await getProjects('token');
    expect(result).to.deep.equal({ data: fakeProjects });
    axios.get.restore();
  });

  it('should handle axios error', async () => {
    sinon.stub(axios, 'get').rejects(new Error('Network error'));
    try {
      await getProjects('token');
      throw new Error('Should have thrown');
    } catch (err) {
      expect(err.message).to.equal('Network error');
    }
    axios.get.restore();
  });

  it('should handle empty response', async () => {
    sinon.stub(axios, 'get').resolves({ data: undefined });
    const result = await getProjects('token');
    expect(result).to.deep.equal({ data: undefined });
    axios.get.restore();
  });
});