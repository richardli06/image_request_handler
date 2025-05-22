import { expect } from 'chai';
import sinon from 'sinon';
import axios from 'axios';
import deleteProject from '../lib/deleteProject.js';

describe('deleteProject helper', () => {
  afterEach(() => sinon.restore());

  it('should delete a project', async () => {
    sinon.stub(axios, 'delete').resolves();
    const result = await deleteProject('token', 123);
    expect(result).to.deep.equal({ message: 'Project deleted' });
    axios.delete.restore();
  });

  it('should handle axios error', async () => {
    sinon.stub(axios, 'delete').rejects(new Error('Delete failed'));
    try {
      await deleteProject('token', 123);
      throw new Error('Should have thrown');
    } catch (err) {
      expect(err.message).to.equal('Delete failed');
    }
    axios.delete.restore();
  });
});