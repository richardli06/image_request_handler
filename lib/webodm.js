// lib/webodm.js
import axios from 'axios';
import { WEBODM_URL } from './constants.js';

/**
 * Fetches all projects from the WebODM API.
 * @param {string} token - JWT token for authentication.
 * @returns {Promise<Object>} The response from the WebODM API.
 */
export async function getProjects(token) {
  try {
    console.log('🔍 Getting projects from:', `${WEBODM_URL}/api/projects/`);
    const response = await axios.get(`${WEBODM_URL}/api/projects/`, {
      headers: { Authorization: `JWT ${token}` }
    });
    console.log('✅ Projects request successful');
    return response;
  } catch (error) {
    console.error('❌ getProjects error:', error.message);
    console.error('❌ URL was:', `${WEBODM_URL}/api/projects/`);
    throw error;
  }
}