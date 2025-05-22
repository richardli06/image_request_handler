import axios from 'axios';
import { WEBODM_URL } from './constants.js';

export default async function getTaskStatus(token, taskId) {
  const response = await axios.get(
    `${WEBODM_URL}/tasks/${taskId}/`,
    { headers: { Authorization: `JWT ${token}` } }
  );
  const data = response.data || {};
  return { status: data.status, task: data };
}