import { expect } from 'chai';
import sinon from 'sinon';
import axios from 'axios';
import renameProject from '../lib/renameProject.js';

describe('renameProject helper', () => {
  afterEach(() => sinon.restore());

  it('should rename a project', async () => {
    const fakeProject = { id: 123, name: 'newName' };
    sinon.stub(axios, 'patch').resolves({ data: fakeProject });
    const result = await renameProject('token', 123, 'newName');
    expect(result).to.deep.equal({ message: 'Project renamed', project: fakeProject });
    axios.patch.restore();
  });

  it('should handle axios error', async () => {
    sinon.stub(axios, 'patch').rejects(new Error('Rename failed'));
    try {
      await renameProject('token', 123, 'newName');
      throw new Error('Should have thrown');
    } catch (err) {
      expect(err.message).to.equal('Rename failed');
    }
    axios.patch.restore();
  });

  it('should handle empty response', async () => {
    sinon.stub(axios, 'patch').resolves({ data: undefined });
    const result = await renameProject('token', 123, 'newName');
    expect(result).to.deep.equal({ message: 'Project renamed', project: undefined });
    axios.patch.restore();
  });
});