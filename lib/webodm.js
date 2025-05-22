// lib/webodm.js
import axios from 'axios';
import { WEBODM_URL } from './constants.js';

/**
 * Fetches all projects from the WebODM API.
 * @param {string} token - JWT token for authentication.
 * @returns {Promise<Object>} The response from the WebODM API.
 */
export async function getProjects(token) {
  return axios.get(`${WEBODM_URL}/projects/`, { headers: { Authorization: `JWT ${token}` } });
}