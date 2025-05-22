// lib/webodm.js
import axios from 'axios';
import { WEBODM_URL } from './constants.js';

export async function getProjects(token) {
  return axios.get(`${WEBODM_URL}/projects/`, { headers: { Authorization: `JWT ${token}` } });
}