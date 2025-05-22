// deleteProject.js
import axios from 'axios';
import { WEBODM_URL } from './constants.js';

/**
 * Deletes a WebODM project.
 * @param {string} token - JWT token for authentication.
 * @param {string|number} projectId - The project ID.
 * @returns {Promise<Object>} The result message.
 */
export default async function deleteProject(token, projectId) {
  await axios.delete(
    `${WEBODM_URL}/projects/${projectId}/`,
    { headers: { Authorization: `JWT ${token}` } }
  );
  return { message: 'Project deleted' };
}