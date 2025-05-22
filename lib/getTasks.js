import axios from 'axios';
import { WEBODM_URL } from './constants.js';

export default async function getTasks(token, projectId) {
  const response = await axios.get(
    `${WEBODM_URL}/projects/${projectId}/tasks/`,
    { headers: { Authorization: `JWT ${token}` } }
  );
  return response.data;
}