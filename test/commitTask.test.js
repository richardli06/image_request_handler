import { expect } from 'chai';
import sinon from 'sinon';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import stream from 'stream';
import * as child_process from 'child_process';
import {
  loadMappings,
  getDestDir,
  downloadOrthophoto,
  runGdalPolygonize
} from '../lib/commitTask.js';

describe('commitTask helpers', () => {
  it('should load mappings', () => {
    sinon.stub(fs, 'readFileSync').returns(JSON.stringify({ test: 'C:/test' }));
    const mappings = loadMappings();
    expect(mappings).to.deep.equal({ test: 'C:/test' });
    fs.readFileSync.restore();
  });

  it('should throw if loadMappings fails', () => {
    sinon.stub(fs, 'readFileSync').throws(new Error('File not found'));
    expect(() => loadMappings()).to.throw('File not found');
    fs.readFileSync.restore();
  });

  it('should get destination directory', () => {
    const mappings = { test: 'C:/test' };
    expect(getDestDir('test', mappings)).to.equal('C:/test');
    expect(getDestDir('notfound', mappings)).to.be.undefined;
  });

  it('should run gdal_polygonize and resolve path', async () => {
    // Fake execFile implementation
    const fakeExecFile = (pythonPath, args, cb) => cb(null, '', '');
    const shapefilePath = await runGdalPolygonize('ortho.tif', 'C:/test', 123, fakeExecFile);
    expect(shapefilePath).to.include('task_123_index.shp');
  });

  it('should download orthophoto and save to file', async () => {
    // Mock fs.existsSync and fs.mkdirSync
    const existsStub = sinon.stub(fs, 'existsSync').returns(false);
    const mkdirStub = sinon.stub(fs, 'mkdirSync').returns();

    // Mock fs.createWriteStream
    const fakeStream = new stream.Writable();
    fakeStream._write = (chunk, encoding, callback) => callback();
    const writeStub = sinon.stub(fs, 'createWriteStream').returns(fakeStream);

    // Mock axios.get to return a stream
    const pipeStub = sinon.stub();
    const fakeAxiosResp = { data: { pipe: pipeStub } };
    const axiosStub = sinon.stub(axios, 'get').resolves(fakeAxiosResp);

    // Simulate stream finish event
    setImmediate(() => fakeStream.emit('finish'));

    const orthoUrl = 'http://fake-url/ortho.tif';
    const destDir = 'C:/test';
    const task_id = 123;
    const token = 'fake-token';

    const orthoPath = await downloadOrthophoto(orthoUrl, destDir, task_id, token);
    expect(orthoPath).to.include('task_123_orthophoto.tif');
    expect(axiosStub.calledOnce).to.be.true;
    expect(writeStub.calledOnce).to.be.true;
    expect(pipeStub.calledOnce).to.be.true;

    // Restore stubs
    existsStub.restore();
    mkdirStub.restore();
    writeStub.restore();
    axiosStub.restore();
  });

  it('should handle axios error in downloadOrthophoto', async () => {
    sinon.stub(fs, 'existsSync').returns(false);
    sinon.stub(fs, 'mkdirSync').returns();
    sinon.stub(fs, 'createWriteStream').returns(new stream.Writable());
    sinon.stub(axios, 'get').rejects(new Error('Download failed'));
    try {
      await downloadOrthophoto('url', 'dir', 1, 'token');
      throw new Error('Should have thrown');
    } catch (err) {
      expect(err.message).to.equal('Download failed');
    }
    fs.existsSync.restore();
    fs.mkdirSync.restore();
    fs.createWriteStream.restore();
    axios.get.restore();
  });
});