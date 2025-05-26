import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
const result = dotenv.config();

// Add debugging
console.log('=== Environment Variables Debug ===');
console.log('Dotenv result:', result);
console.log('Current working directory:', process.cwd());
console.log('WEBODM_USERNAME from env:', process.env.WEBODM_USERNAME);
console.log('WEBODM_PASSWORD from env:', process.env.WEBODM_PASSWORD ? '***LOADED***' : 'NOT LOADED');
console.log('WEBODM_URL from env:', process.env.WEBODM_URL);
console.log('====================================');

/**
 * WebODM API base URL.
 * @type {string}
 */
export const WEBODM_URL = process.env.WEBODM_URL || 'http://localhost:8000';

/**
 * WebODM username for authentication.
 * @type {string}
 */
export const WEBODM_USERNAME = process.env.WEBODM_USERNAME || 'admin';

/**
 * WebODM password for authentication.
 * @type {string}
 */
export const WEBODM_PASSWORD = process.env.WEBODM_PASSWORD || 'admin';

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

// Log final values
console.log('Final values being used:');
console.log('WEBODM_USERNAME:', WEBODM_USERNAME);
console.log('WEBODM_PASSWORD:', WEBODM_PASSWORD === 'admin' ? 'USING DEFAULT (admin)' : 'USING FROM ENV');
console.log('WEBODM_URL:', WEBODM_URL);