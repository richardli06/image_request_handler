// renameProject.js
import axios from 'axios';
import { WEBODM_URL } from './constants.js';

export default async function renameProject(token, projectId, newName) {
  const response = await axios.patch(
    `${WEBODM_URL}/projects/${projectId}/`,
    { name: newName },
    { headers: { Authorization: `JWT ${token}` } }
  );
  return { message: 'Project renamed', project: response.data };
}