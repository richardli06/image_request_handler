import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { WEBODM_URL, OSGEO4W_ROOT, MAPPINGS_PATH } from './constants.js';
import * as child_process from 'child_process';

/**
 * Loads the map name to directory mappings from the mappings file.
 * @returns {Object} The mappings object.
 */
export function loadMappings() {
  return JSON.parse(fs.readFileSync(MAPPINGS_PATH, 'utf8'));
}

/**
 * Gets the destination directory for a given map name.
 * @param {string} map_name - The name of the map.
 * @param {Object} mappings - The mappings object.
 * @returns {string|undefined} The destination directory path, or undefined if not found.
 */
export function getDestDir(map_name, mappings) {
  return mappings[map_name];
}

/**
 * Downloads an orthophoto from a URL to a destination directory.
 * @param {string} orthoUrl - The URL of the orthophoto.
 * @param {string} destDir - The destination directory.
 * @param {string|number} task_id - The task ID.
 * @param {string} token - JWT token for authentication.
 * @returns {Promise<string>} Resolves to the path of the downloaded orthophoto.
 */
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

/**
 * Runs gdal_polygonize.py on an orthophoto to generate a shapefile.
 * @param {string} orthoPath - Path to the orthophoto file.
 * @param {string} destDir - Destination directory for the shapefile.
 * @param {string|number} task_id - The task ID.
 * @param {Function} [execFileImpl=child_process.execFile] - Optional execFile implementation for testing.
 * @returns {Promise<string>} Resolves to the path of the generated shapefile.
 */
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