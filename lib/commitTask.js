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
 * Runs gdaltindex to generate a shapefile index from all TIF files in a directory using MS4W.
 * @param {string} sourceDir - Directory containing the orthophoto TIF files.
 * @param {string} destDir - Destination directory for the shapefile.
 * @param {string} [indexName='index'] - Name of the index shapefile (without extension).
 * @returns {Promise<string>} Resolves to the path of the generated shapefile.
 */
export function runGdalIndex(sourceDir, destDir, indexName = 'index') {
  return new Promise((resolve, reject) => {
    const shapefilePath = path.join(destDir, `${indexName}.shp`);
    
    console.log('🗺️ Running gdaltindex with MS4W environment...');
    console.log('Source directory:', sourceDir);
    console.log('Destination directory:', destDir);
    console.log('Output shapefile:', shapefilePath);
    
    // Check if source directory exists
    if (!fs.existsSync(sourceDir)) {
      return reject(new Error(`Source directory not found: ${sourceDir}`));
    }
    
    // Check if there are any TIF files in the source directory
    const tifFiles = fs.readdirSync(sourceDir).filter(file => 
      file.toLowerCase().endsWith('.tif') || file.toLowerCase().endsWith('.tiff')
    );
    
    if (tifFiles.length === 0) {
      return reject(new Error(`No TIF files found in source directory: ${sourceDir}`));
    }
    
    console.log(`📁 Found ${tifFiles.length} TIF files:`, tifFiles.slice(0, 5).join(', ') + (tifFiles.length > 5 ? '...' : ''));
    
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
    
    // Use gdaltindex command with wildcard pattern
    // Note: We need to run this from the source directory for the wildcard to work properly
    const command = `gdaltindex "${shapefilePath}" *.tif`;
    
    console.log('🚀 Executing command:', command);
    console.log('🚀 Working directory:', sourceDir);
    
    child_process.exec(
      command,
      {
        env: env,
        timeout: 60000, // 1 minute timeout
        cwd: sourceDir // Run from source directory so *.tif works
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
