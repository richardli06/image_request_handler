import dotenv from 'dotenv';
dotenv.config();
import path from 'path';

export const WEBODM_URL = process.env.WEBODM_URL || 'http://localhost:8000/api';
export const WEBODM_USERNAME = process.env.WEBODM_USERNAME;
export const WEBODM_PASSWORD = process.env.WEBODM_PASSWORD;
export const OSGEO4W_ROOT = process.env.OSGEO4W_ROOT;
export const MAPPINGS_PATH = path.join(process.cwd(), 'data', 'map_mappings.json');