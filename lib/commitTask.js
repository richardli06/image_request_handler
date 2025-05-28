import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { WEBODM_URL, MAPPINGS_PATH } from './constants.js';
import * as child_process from 'child_process';

// MS4W root path (extracted from your batch file)
const MS4W_ROOT = 'C:\\Users\\WH01\\Desktop\\AUAV_M~1\\ms4w';

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
 * Creates MS4W environment variables for GDAL operations.
 * @returns {Object} Environment variables object.
 */
function createMS4WEnvironment() {
  const ms4wPath = `${MS4W_ROOT}\\Apache\\cgi-bin;${MS4W_ROOT}\\tools\\gdal-ogr;${MS4W_ROOT}\\tools\\mapserv;` +
    `${MS4W_ROOT}\\tools\\shapelib;${MS4W_ROOT}\\tools\\proj;${MS4W_ROOT}\\tools\\shp2tile;${MS4W_ROOT}\\tools\\shpdiff;` +
    `${MS4W_ROOT}\\tools\\avce00;${MS4W_ROOT}\\gdalbindings\\python\\gdal;${MS4W_ROOT}\\tools\\php;${MS4W_ROOT}\\tools\\mapcache;` +
    `${MS4W_ROOT}\\tools\\berkeley-db;${MS4W_ROOT}\\tools\\sqlite;${MS4W_ROOT}\\tools\\spatialite;${MS4W_ROOT}\\tools\\unixutils;` +
    `${MS4W_ROOT}\\tools\\openssl;${MS4W_ROOT}\\tools\\curl;${MS4W_ROOT}\\tools\\geotiff;${MS4W_ROOT}\\tools\\jpeg;${MS4W_ROOT}\\tools\\protobuf;` +
    `${MS4W_ROOT}\\Python;${MS4W_ROOT}\\Python\\Scripts;${MS4W_ROOT}\\tools\\osm2pgsql;${MS4W_ROOT}\\tools\\netcdf;${MS4W_ROOT}\\tools\\pdal;` +
    `${MS4W_ROOT}\\tools\\libtiff;${MS4W_ROOT}\\tools\\pdf;${MS4W_ROOT}\\tools\\deflate;${MS4W_ROOT}\\tools\\webp;` +
    `${MS4W_ROOT}\\tools\\geos;${MS4W_ROOT}\\tools\\zstd;${MS4W_ROOT}\\tools\\lz4;${MS4W_ROOT}\\tools\\uriparser;` +
    `${MS4W_ROOT}\\tools\\qhull;${MS4W_ROOT}\\tools\\libxml2;${MS4W_ROOT}\\tools\\ogdi;${MS4W_ROOT}\\tools\\brotli;` +
    `${MS4W_ROOT}\\tools\\jansson;${MS4W_ROOT}\\tools\\harfbuzz`;

  return {
    ...process.env,
    PATH: `${ms4wPath};${process.env.PATH}`,
    USE_PATH_FOR_GDAL_PYTHON: 'YES',
    PYTHONHOME: `${MS4W_ROOT}\\Python`,
    PYTHONPATH: `${MS4W_ROOT}\\Apache\\cgi-bin;${MS4W_ROOT}\\Python\\DLLs;${MS4W_ROOT}\\Python\\Lib;` +
               `${MS4W_ROOT}\\Python\\Lib\\site-packages;${MS4W_ROOT}\\Python;` +
               `${MS4W_ROOT}\\Python\\Lib\\site-packages\\osgeo_utils;${process.env.PYTHONPATH || ''}`,
    PYTHONUTF8: '1',
    GDAL_DATA: `${MS4W_ROOT}\\gdaldata`,
    GDAL_DRIVER_PATH: `${MS4W_ROOT}\\gdalplugins`,
    GDAL_FILENAME_IS_UTF8: '1',
    VSI_CACHE: 'TRUE',
    VSI_CACHE_SIZE: '1000000',
    PROJ_DATA: `${MS4W_ROOT}\\share\\proj`,
    PROJ_USER_WRITABLE_DIRECTORY: `${MS4W_ROOT}\\share\\proj`,
    CURL_CA_BUNDLE: `${MS4W_ROOT}\\Apache\\conf\\ca-bundle\\cacert.pem`,
    SSL_CERT_FILE: `${MS4W_ROOT}\\Apache\\conf\\ca-bundle\\cacert.pem`,
    OPENSSL_CONF: `${MS4W_ROOT}\\tools\\openssl\\openssl.cnf`,
    PDAL_DRIVER_PATH: `${MS4W_ROOT}\\Apache\\cgi-bin`,
    MAPSERVER_CONFIG_FILE: `${MS4W_ROOT}\\ms4w.conf`
  };
}

/**
 * Runs gdaltindex to generate a shapefile index using MS4W.
 * @param {string} orthoPath - Path to the orthophoto file.
 * @param {string} destDir - Destination directory for the shapefile.
 * @param {string|number} task_id - The task ID.
 * @returns {Promise<string>} Resolves to the path of the generated shapefile.
 */
export function runGdalIndex(orthoPath, destDir, task_id) {
  return new Promise((resolve, reject) => {
    const shapefilePath = path.join(destDir, `index.shp`);
    
    console.log('🗺️ Running gdaltindex with MS4W environment...');
    console.log('Input orthophoto:', orthoPath);
    console.log('Output shapefile:', shapefilePath);
    
    // Check if input file exists
    if (!fs.existsSync(orthoPath)) {
      return reject(new Error(`Input orthophoto not found: ${orthoPath}`));
    }
    
    // Ensure destination directory exists
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    // Create MS4W environment (similar to setenv.bat)
    const env = createMS4WEnvironment();
    
    console.log('🔧 Environment variables set:', {
      GDAL_DATA: env.GDAL_DATA,
      PATH: env.PATH.split(';').slice(0, 5).join(';') + '...',
      PYTHONHOME: env.PYTHONHOME
    });
    
    // Use gdaltindex command directly (it should be in PATH after MS4W setup)
    const command = `gdaltindex "${shapefilePath}" "${orthoPath}"`;
    
    console.log('🚀 Executing command:', command);
    
    child_process.exec(
      command,
      {
        env: env,
        timeout: 60000, // 1 minute timeout
        cwd: destDir
      },
      (error, stdout, stderr) => {
        console.log('gdaltindex stdout:', stdout || '(empty)');
        console.log('gdaltindex stderr:', stderr || '(empty)');
        
        if (error) {
          console.error('❌ gdaltindex failed:', error.message);
          console.error('stderr:', stderr);
          return reject(new Error(`gdaltindex failed: ${stderr || error.message}`));
        }
        
        // Check if shapefile was created
        if (fs.existsSync(shapefilePath)) {
          console.log('✅ Shapefile index created successfully:', shapefilePath);
          
          // Also check for associated files (.shx, .dbf, .prj)
          const associatedFiles = [
            shapefilePath.replace('.shp', '.shx'),
            shapefilePath.replace('.shp', '.dbf'),
            shapefilePath.replace('.shp', '.prj')
          ];
          
          const existingFiles = associatedFiles.filter(file => fs.existsSync(file));
          console.log('📁 Associated files created:', existingFiles.map(f => path.basename(f)));
          
          resolve(shapefilePath);
        } else {
          reject(new Error(`Shapefile was not created at expected location: ${shapefilePath}`));
        }
      }
    );
  });
}

/**
 * Alternative approach using MS4W batch file to ensure proper environment
 */
export function runGdalIndexWithBatch(orthoPath, destDir, task_id) {
  return new Promise((resolve, reject) => {
    const shapefilePath = path.join(destDir, `task_${task_id}_index.shp`);
    const setenvBat = path.join(MS4W_ROOT, 'setenv.bat');
    
    console.log('🗺️ Running gdaltindex with MS4W batch environment...');
    console.log('Setenv batch:', setenvBat);
    console.log('Input orthophoto:', orthoPath);
    console.log('Output shapefile:', shapefilePath);
    
    // Check if setenv.bat exists
    if (!fs.existsSync(setenvBat)) {
      return reject(new Error(`MS4W setenv.bat not found: ${setenvBat}`));
    }
    
    // Check if input file exists
    if (!fs.existsSync(orthoPath)) {
      return reject(new Error(`Input orthophoto not found: ${orthoPath}`));
    }
    
    // Ensure destination directory exists
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    // Create command that sources setenv.bat and runs gdaltindex
    const command = `"${setenvBat}" && gdaltindex "${shapefilePath}" "${orthoPath}"`;
    
    console.log('🚀 Executing batch command:', command);
    
    child_process.exec(
      command,
      {
        timeout: 60000, // 1 minute timeout
        cwd: MS4W_ROOT,
        shell: true
      },
      (error, stdout, stderr) => {
        console.log('batch stdout:', stdout || '(empty)');
        console.log('batch stderr:', stderr || '(empty)');
        
        if (error) {
          console.error('❌ Batch gdaltindex failed:', error.message);
          console.error('stderr:', stderr);
          return reject(new Error(`Batch gdaltindex failed: ${stderr || error.message}`));
        }
        
        // Check if shapefile was created
        if (fs.existsSync(shapefilePath)) {
          console.log('✅ Shapefile index created successfully with batch:', shapefilePath);
          resolve(shapefilePath);
        } else {
          reject(new Error(`Shapefile was not created at expected location: ${shapefilePath}`));
        }
      }
    );
  });
}

/**
 * Spawn-based approach for better control and real-time output
 */
export function runGdalIndexSpawn(orthoPath, destDir, task_id) {
  return new Promise((resolve, reject) => {
    const shapefilePath = path.join(destDir, `task_${task_id}_index.shp`);
    
    console.log('🗺️ Running gdaltindex with spawn...');
    console.log('Input orthophoto:', orthoPath);
    console.log('Output shapefile:', shapefilePath);
    
    // Check if input file exists
    if (!fs.existsSync(orthoPath)) {
      return reject(new Error(`Input orthophoto not found: ${orthoPath}`));
    }
    
    // Ensure destination directory exists
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    // Create MS4W environment
    const env = createMS4WEnvironment();
    
    // Spawn gdaltindex directly
    const process = child_process.spawn('gdaltindex', [shapefilePath, orthoPath], {
      env: env,
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: destDir
    });
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log('gdaltindex stdout:', data.toString().trim());
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log('gdaltindex stderr:', data.toString().trim());
    });
    
    process.on('close', (code) => {
      console.log(`gdaltindex process exited with code: ${code}`);
      
      if (code === 0) {
        if (fs.existsSync(shapefilePath)) {
          console.log('✅ Shapefile index created successfully with spawn:', shapefilePath);
          resolve(shapefilePath);
        } else {
          reject(new Error(`Shapefile was not created despite successful exit: ${shapefilePath}`));
        }
      } else {
        reject(new Error(`gdaltindex process failed with code ${code}: ${stderr}`));
      }
    });
    
    process.on('error', (error) => {
      reject(new Error(`Failed to start gdaltindex process: ${error.message}`));
    });
    
    // Set timeout
    const timeoutId = setTimeout(() => {
      process.kill();
      reject(new Error('gdaltindex process timed out'));
    }, 60000); // 1 minute timeout
    
    process.on('close', () => {
      clearTimeout(timeoutId);
    });
  });
}

// Update the main function to use gdaltindex instead of gdal_polygonize
export function runGdalPolygonize(orthoPath, destDir, task_id) {
  console.log('🔄 Using gdaltindex instead of gdal_polygonize for better reliability...');
  return runGdalIndex(orthoPath, destDir, task_id);
}