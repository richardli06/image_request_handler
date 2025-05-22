import dotenv from 'dotenv';
dotenv.config();
import path from 'path';

/**
 * WebODM API base URL.
 * @type {string}
 */
export const WEBODM_URL = process.env.WEBODM_URL || 'http://localhost:8000/api';

/**
 * WebODM username for authentication.
 * @type {string}
 */
export const WEBODM_USERNAME = process.env.WEBODM_USERNAME;

/**
 * WebODM password for authentication.
 * @type {string}
 */
export const WEBODM_PASSWORD = process.env.WEBODM_PASSWORD;

/**
 * Path to the OSGeo4W root directory.
 * @type {string}
 */
export const OSGEO4W_ROOT = process.env.OSGEO4W_ROOT;

/**
 * Path to the map mappings JSON file.
 * @type {string}
 */
export const MAPPINGS_PATH = path.join(process.cwd(), 'data', 'map_mappings.json');