// renameProject.js
import axios from 'axios';
import { WEBODM_URL } from './constants.js';

/**
 * Renames a WebODM project.
 * @param {string} token - JWT token for authentication.
 * @param {string|number} projectId - The project ID.
 * @param {string} newName - The new project name.
 * @returns {Promise<Object>} The updated project data.
 */
export default async function renameProject(token, projectId, newName) {
  try {
    const response = await axios.patch(
      `${WEBODM_URL}/api/projects/${projectId}/`, // Make sure /api/ is included
      { name: newName },
      { headers: { Authorization: `JWT ${token}` } }
    );
    return response.data;
  } catch (error) {
    console.error('Rename project error:', error.message);
    throw error;
  }
}