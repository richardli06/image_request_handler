import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import multer from 'multer';
import { getProjects } from '../lib/webodm.js';
import {
  WEBODM_URL, WEBODM_USERNAME, WEBODM_PASSWORD, OSGEO4W_ROOT, MAPPINGS_PATH
} from '../lib/constants.js';
import {
  loadMappings,
  getDestDir,
  downloadOrthophoto,
  runGdalPolygonize
} from '../lib/commitTask.js';
import getTasks from '../lib/getTasks.js';
import getTaskStatus from '../lib/getTaskStatus.js';
import deleteProject from '../lib/deleteProject.js';
import renameProject from '../lib/renameProject.js';

const router = express.Router();

// Configure multer for larger files
const upload = multer({ 
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
    files: 100 // max 100 files
  }
});

/**
 * Helper to get JWT token from WebODM.
 * @returns {Promise<string>} JWT token string
 */
async function getWebODMToken() {
  const res = await axios.post(`${WEBODM_URL}/token-auth/`, {
    username: WEBODM_USERNAME,
    password: WEBODM_PASSWORD
  });
  return res.data.token;
}

/**
 * @api {post} /api/push-images Push images to a WebODM project and create a task
 * @apiBody {File[]} images Array of image files (multipart/form-data)
 * @apiBody {string} project_name Name of the WebODM project
 * @apiBody {object} [options] Optional task options (as JSON string or fields)
 * @apiSuccess {object} task Created task data
 * @apiError (400) Images array or project_name missing
 * @apiError (404) Project not found
 * @apiError (500) Failed to create task
 */
router.post('/push-images', upload.array('images', 100), async function(req, res) {
  const { project_name, options } = req.body;
  
  const images = req.files;
  if (!images || images.length === 0) {
    return res.status(400).json({ error: 'Images array required' });
  }
  if (!project_name) {
    return res.status(400).json({ error: 'project_name required' });
  }

  try {
    const token = await getWebODMToken();

    // 1. Get all projects and find the one with the given name
    const projectsResp = await getProjects(token);
    
    // Debug: Log the actual response structure
    console.log('Projects response:', JSON.stringify(projectsResp.data, null, 2));
    
    // Handle different possible response structures
    let projects;
    if (projectsResp.data && Array.isArray(projectsResp.data.results)) {
      projects = projectsResp.data.results;
    } else if (projectsResp.data && Array.isArray(projectsResp.data)) {
      projects = projectsResp.data;
    } else {
      console.error('Unexpected projects response structure:', projectsResp.data);
      return res.status(500).json({ error: 'Unexpected response structure from WebODM' });
    }
    
    const project = projects.find(p => p.name === project_name);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // 2. Prepare images as files for multipart/form-data to WebODM
    const form = new FormData();
    
    // Add each image file to the form
    images.forEach((file, i) => {
      form.append('images', fs.createReadStream(file.path), {
        filename: file.originalname || `image_${i}.jpg`,
        contentType: file.mimetype || 'image/jpeg'
      });
    });

    // 3. Add options if provided
    if (options) {
      form.append('options', typeof options === 'string' ? options : JSON.stringify(options));
    }

    // 4. Create the task with increased timeout for large uploads
    const taskResp = await axios.post(
      `${WEBODM_URL}/projects/${project.id}/tasks/`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `JWT ${token}`
        },
        timeout: 300000, // 5 minutes timeout for large uploads
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    // 5. Clean up temp files
    images.forEach(file => {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.warn(`Failed to delete temp file: ${file.path}`, err.message);
      }
    });

    res.json(taskResp.data);
    
  } catch (err) {
    // Clean up temp files on error
    if (images) {
      images.forEach(file => {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (cleanupErr) {
          console.warn(`Failed to cleanup temp file: ${file.path}`, cleanupErr.message);
        }
      });
    }
    
    console.error('Push images error:', err.message);
    if (err.response && err.response.data) {
      return res.status(500).json({ error: 'Failed to create task', details: err.response.data });
    }
    res.status(500).json({ error: 'Failed to create task', details: err.message });
  }
});

/**
 * @api {get} /api/get-projects Get all WebODM projects
 * @apiSuccess {object[]} projects List of projects
 * @apiError (500) Failed to fetch projects
 */
router.get('/get-projects', async function(req, res) {
  try {
    const response = await axios.get(`${WEBODM_URL}/projects/`, { auth: { username: WEBODM_USERNAME, password: WEBODM_PASSWORD } });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

/**
 * @api {get} /api/get-tasks Get all tasks for a project
 * @apiQuery {string} project_id Project ID
 * @apiSuccess {object[]} tasks List of tasks
 * @apiError (400) project_id required
 * @apiError (500) Failed to fetch tasks
 */
router.get('/get-tasks', async function(req, res) {
  const projectId = req.query.project_id;
  if (!projectId) {
    return res.status(400).json({ error: 'project_id required' });
  }
  try {
    const token = await getWebODMToken();
    const tasks = await getTasks(token, projectId);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks', details: err.message });
  }
});

/**
 * @api {get} /api/get-task-status Get status for a task
 * @apiQuery {string} task_id Task ID
 * @apiSuccess {object} status Task status and info
 * @apiError (400) task_id required
 * @apiError (500) Failed to fetch task status
 */
router.get('/get-task-status', async function(req, res) {
  const taskId = req.query.task_id;
  if (!taskId) {
    return res.status(400).json({ error: 'task_id required' });
  }
  try {
    const token = await getWebODMToken();
    const status = await getTaskStatus(token, taskId);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch task status', details: err.message });
  }
});

/**
 * @api {post} /api/create-project Create a new WebODM project
 * @apiBody {string} name Project name
 * @apiSuccess {object} project Created project data
 * @apiError (400) Project name required
 * @apiError (500) Failed to create project
 */
router.post('/create-project', async function(req, res) {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Project name required' });
  }
  try {
    const token = await getWebODMToken();
    const response = await axios.post(
      `${WEBODM_URL}/projects/`,
      { name },
      { headers: { Authorization: `JWT ${token}` } }
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create project', details: err.message });
  }
});

/**
 * @api {post} /api/delete-project Delete a WebODM project
 * @apiBody {string} project_id Project ID
 * @apiSuccess {object} result Deletion result
 * @apiError (400) project_id required
 * @apiError (500) Failed to delete project
 */
router.post('/delete-project', async function(req, res) {
  const { project_id } = req.body;
  if (!project_id) {
    return res.status(400).json({ error: 'project_id required' });
  }
  try {
    const token = await getWebODMToken();
    const result = await deleteProject(token, project_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete project', details: err.message });
  }
});

/**
 * @api {post} /api/rename-project Rename a WebODM project
 * @apiBody {string} project_id Project ID
 * @apiBody {string} new_name New project name
 * @apiSuccess {object} result Rename result
 * @apiError (400) project_id and new_name required
 * @apiError (500) Failed to rename project
 */
router.post('/rename-project', async function(req, res) {
  const { project_id, new_name } = req.body;
  if (!project_id || !new_name) {
    return res.status(400).json({ error: 'project_id and new_name required' });
  }
  try {
    const token = await getWebODMToken();
    const result = await renameProject(token, project_id, new_name);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to rename project', details: err.message });
  }
});

/**
 * @api {post} /api/commit-task-to-map Commit a completed task's orthophoto and shapefile to a map
 * @apiBody {string} task_id Task ID
 * @apiBody {string} map_name Map name (must exist in mappings)
 * @apiSuccess {object} result Paths to orthophoto and shapefile
 * @apiError (400) task_id and map_name required
 * @apiError (404) Map name not found in mappings or orthophoto not found
 * @apiError (409) Task is not completed yet
 * @apiError (500) Failed to commit task
 */
router.post('/commit-task-to-map', async function(req, res) {
  const { task_id, map_name } = req.body;
  if (!task_id || !map_name) {
    return res.status(400).json({ error: 'task_id and map_name required' });
  }

  let mappings;
  try {
    mappings = loadMappings();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read map mappings', details: err.message });
  }
  const destDir = getDestDir(map_name, mappings);
  if (!destDir) {
    return res.status(404).json({ error: 'Map name not found in mappings' });
  }

  try {
    const token = await getWebODMToken();

    // 3. Get task info
    const taskResp = await axios.get(
      `${WEBODM_URL}/tasks/${task_id}/`,
      { headers: { Authorization: `JWT ${token}` } }
    );
    const task = taskResp.data;
    if (task.status !== 'COMPLETED') {
      return res.status(409).json({ error: 'Task is not completed yet', status: task.status });
    }

    // 4. Get orthophoto asset info
    const assetsResp = await axios.get(
      `${WEBODM_URL}/tasks/${task_id}/assets/`,
      { headers: { Authorization: `JWT ${token}` } }
    );
    const orthoUrl = assetsResp.data.orthophoto;
    if (!orthoUrl) {
      return res.status(404).json({ error: 'Orthophoto not found for this task' });
    }

    // 5. Download orthophoto and run gdal_polygonize
    const orthoPath = await downloadOrthophoto(orthoUrl, destDir, task_id, token);
    const shapefilePath = await runGdalPolygonize(orthoPath, destDir, task_id);

    res.json({
      message: 'Orthophoto and shapefile committed to map',
      orthophoto: orthoPath,
      shapefile: shapefilePath
    });

  } catch (err) {
    res.status(500).json({ error: 'Failed to commit task', details: err.message });
  }
});

export default router;