// renameProject.js
import axios from 'axios';
import { WEBODM_URL } from './constants.js';

/**
 * Renames a WebODM project.
 * @param {string} token - JWT token for authentication.
 * @param {string|number} projectId - The project ID.
 * @param {string} newName - The new project name.
 * @returns {Promise<Object>} The result message and updated project data.
 */
export default async function renameProject(token, projectId, newName) {
  const response = await axios.patch(
    `${WEBODM_URL}/projects/${projectId}/`,
    { name: newName },
    { headers: { Authorization: `JWT ${token}` } }
  );
  return { message: 'Project renamed', project: response.data };
}