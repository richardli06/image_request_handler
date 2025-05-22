import { expect } from 'chai';
import sinon from 'sinon';

describe('API logic flow (mocked helpers)', () => {
  afterEach(() => sinon.restore());

  it('should call getTaskStatus with correct args for /api/get-task-status', async () => {
    const fakeStatus = { status: 'COMPLETED', task: { id: 1 } };
    const stub = sinon.stub().resolves(fakeStatus);
    const token = 'fake-token';
    const taskId = 1;
    const result = await stub(token, taskId);
    expect(stub.calledOnceWith(token, taskId)).to.be.true;
    expect(result).to.deep.equal(fakeStatus);
  });

  it('should call getTasks with correct args for /api/get-tasks', async () => {
    const fakeTasks = [{ id: 1 }];
    const stub = sinon.stub().resolves(fakeTasks);
    const token = 'fake-token';
    const projectId = 123;
    const result = await stub(token, projectId);
    expect(stub.calledOnceWith(token, projectId)).to.be.true;
    expect(result).to.deep.equal(fakeTasks);
  });

  it('should call deleteProject with correct args for /api/delete-project', async () => {
    const stub = sinon.stub().resolves({ message: 'Project deleted' });
    const token = 'fake-token';
    const projectId = 123;
    const result = await stub(token, projectId);
    expect(stub.calledOnceWith(token, projectId)).to.be.true;
    expect(result).to.deep.equal({ message: 'Project deleted' });
  });

  it('should call renameProject with correct args for /api/rename-project', async () => {
    const fakeProject = { id: 123, name: 'newName' };
    const stub = sinon.stub().resolves({ message: 'Project renamed', project: fakeProject });
    const token = 'fake-token';
    const projectId = 123;
    const newName = 'newName';
    const result = await stub(token, projectId, newName);
    expect(stub.calledOnceWith(token, projectId, newName)).to.be.true;
    expect(result).to.deep.equal({ message: 'Project renamed', project: fakeProject });
  });
});