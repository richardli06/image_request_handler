import axios from 'axios';
import { WEBODM_URL } from './constants.js';

/**
 * Gets the status and info for a specific task.
 * @param {string} token - JWT token for authentication.
 * @param {string|number} taskId - The task ID.
 * @returns {Promise<Object>} The status and task data.
 */
export default async function getTaskStatus(token, taskId) {
  const response = await axios.get(
    `${WEBODM_URL}/tasks/${taskId}/`,
    { headers: { Authorization: `JWT ${token}` } }
  );
  const data = response.data || {};
  return { status: data.status, task: data };
}