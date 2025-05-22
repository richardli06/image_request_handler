// deleteProject.js
import axios from 'axios';
import { WEBODM_URL } from './constants.js';

export default async function deleteProject(token, projectId) {
  await axios.delete(
    `${WEBODM_URL}/projects/${projectId}/`,
    { headers: { Authorization: `JWT ${token}` } }
  );
  return { message: 'Project deleted' };
}