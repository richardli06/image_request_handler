import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { WEBODM_URL, OSGEO4W_ROOT, MAPPINGS_PATH } from './constants.js';
import * as child_process from 'child_process';

// Helper: Load map mappings
export function loadMappings() {
  return JSON.parse(fs.readFileSync(MAPPINGS_PATH, 'utf8'));
}

// Helper: Get destination directory for map name
export function getDestDir(map_name, mappings) {
  return mappings[map_name];
}

// Helper: Download orthophoto
export async function downloadOrthophoto(orthoUrl, destDir, task_id, token) {
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const orthoPath = path.join(destDir, `task_${task_id}_orthophoto.tif`);
  const orthoResp = await axios.get(orthoUrl, {
    headers: { Authorization: `JWT ${token}` },
    responseType: 'stream'
  });
  const writer = fs.createWriteStream(orthoPath);
  orthoResp.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(orthoPath));
    writer.on('error', reject);
  });
}

// Helper: Run gdal_polygonize.py
export function runGdalPolygonize(orthoPath, destDir, task_id, execFileImpl = child_process.execFile) {
  const pythonPath = path.join(OSGEO4W_ROOT, 'bin', 'python.exe');
  const gdalPolygonizePath = path.join(OSGEO4W_ROOT, 'apps', 'Python37', 'Scripts', 'gdal_polygonize.py');
  const shapefileBase = path.join(destDir, `task_${task_id}_index`);
  return new Promise((resolve, reject) => {
    execFileImpl(
      pythonPath,
      [gdalPolygonizePath, orthoPath, '-f', 'ESRI Shapefile', shapefileBase],
      (error, stdout, stderr) => {
        if (error) return reject(stderr || error.message);
        resolve(`${shapefileBase}.shp`);
      }
    );
  });
}