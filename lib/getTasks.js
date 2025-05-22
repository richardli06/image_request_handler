import axios from 'axios';
import { WEBODM_URL } from './constants.js';

/**
 * Gets all tasks for a specific project.
 * @param {string} token - JWT token for authentication.
 * @param {string|number} projectId - The project ID.
 * @returns {Promise<Object>} The tasks data from the WebODM API.
 */
export default async function getTasks(token, projectId) {
  const response = await axios.get(
    `${WEBODM_URL}/projects/${projectId}/tasks/`,
    { headers: { Authorization: `JWT ${token}` } }
  );
  return response.data;
}