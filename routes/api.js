//import dotenv from 'dotenv';
//dotenv.config();
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
  try {
    const response = await axios.post(`${WEBODM_URL}/api/token-auth/`, {
      username: WEBODM_USERNAME,
      password: WEBODM_PASSWORD
    });
    return response.data.token;
  } catch (error) {
    console.error('Failed to get WebODM token:', error.message);
    throw error;
  }
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
  console.log('=== PUSH IMAGES DEBUG ===');
  console.log('📋 Request received at:', new Date().toISOString());
  console.log('📁 Files received:', req.files ? req.files.length : 0);
  console.log('📝 Body data:', req.body);
  
  const { project_name, options } = req.body;
  const images = req.files;
  
  if (!images || images.length === 0) {
    console.log('❌ No images provided');
    return res.status(400).json({ error: 'Images array required' });
  }
  if (!project_name) {
    console.log('❌ No project name provided');
    return res.status(400).json({ error: 'project_name required' });
  }

  console.log('✅ Project name:', project_name);
  console.log('✅ Number of images:', images.length);

  try {
    console.log('🔐 Step 1: Getting WebODM token...');
    const token = await getWebODMToken();
    console.log('✅ Step 2: Token obtained successfully');

    console.log('📊 Step 3: Getting projects from WebODM...');
    const projectsResp = await getProjects(token);
    console.log('✅ Step 4: Projects response received');
    
    // Debug: Log the actual response structure
    console.log('📄 Projects data:', JSON.stringify(projectsResp.data, null, 2));
    
    // Handle different possible response structures
    let projects;
    if (projectsResp.data && Array.isArray(projectsResp.data.results)) {
      projects = projectsResp.data.results;
    } else if (projectsResp.data && Array.isArray(projectsResp.data)) {
      projects = projectsResp.data;
    } else {
      console.error('❌ Unexpected projects response structure:', projectsResp.data);
      return res.status(500).json({ error: 'Unexpected response structure from WebODM' });
    }
    
    console.log('🔍 Step 5: Looking for project:', project_name);
    console.log('📋 Available projects:', projects.map(p => p.name));
    
    const project = projects.find(p => p.name === project_name);
    if (!project) {
      console.log('❌ Project not found!');
      return res.status(404).json({ 
        error: 'Project not found',
        available_projects: projects.map(p => p.name),
        looking_for: project_name
      });
    }
    console.log('✅ Step 6: Project found with ID:', project.id);

    console.log('📦 Step 7: Preparing form data...');
    const form = new FormData();
    
    // Add each image file to the form
    images.forEach((file, i) => {
      console.log(`📷 Adding image ${i + 1}: ${file.originalname}`);
      form.append('images', fs.createReadStream(file.path), {
        filename: file.originalname || `image_${i}.jpg`,
        contentType: file.mimetype || 'image/jpeg'
      });
    });

    // Add options if provided
    if (options) {
      form.append('options', typeof options === 'string' ? options : JSON.stringify(options));
    }

    console.log('🚀 Step 8: Creating task...');
    console.log('🔗 Task URL:', `${WEBODM_URL}/api/projects/${project.id}/tasks/`);
    console.log('🔑 Token preview:', token.substring(0, 20) + '...');
    
    // Create the task with increased timeout for large uploads
    const taskResp = await axios.post(
      `${WEBODM_URL}/api/projects/${project.id}/tasks/`,
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

    console.log('🎉 Step 9: Task created successfully!');
    console.log('📝 Task ID:', taskResp.data.id);

    // Clean up temp files
    images.forEach(file => {
      try {
        fs.unlinkSync(file.path);
        console.log('🗑️ Cleaned up temp file:', file.path);
      } catch (err) {
        console.warn(`⚠️ Failed to delete temp file: ${file.path}`, err.message);
      }
    });

    res.json(taskResp.data);
    
  } catch (err) {
    console.error('=== PUSH IMAGES ERROR ===');
    console.error('❌ Error message:', err.message);
    console.error('❌ Error status:', err.response?.status);
    console.error('❌ Error URL:', err.config?.url);
    console.error('❌ Error headers:', err.response?.headers);
    console.error('❌ Error data preview:', typeof err.response?.data === 'string' ? 
      err.response.data.substring(0, 500) + '...' : err.response?.data);
    
    // Clean up temp files on error
    if (images) {
      images.forEach(file => {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
            console.log('🗑️ Cleaned up temp file on error:', file.path);
          }
        } catch (cleanupErr) {
          console.warn(`⚠️ Failed to cleanup temp file: ${file.path}`, cleanupErr.message);
        }
      });
    }
    
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
    const token = await getWebODMToken(); // Get JWT token
    const response = await axios.get(`${WEBODM_URL}/api/projects/`, { // Add /api/ here
      headers: { Authorization: `JWT ${token}` } // Use JWT instead of basic auth
    });
    res.json(response.data);
  } catch (err) {
    console.error('Failed to fetch projects:', err.message);
    console.error('Response data:', err.response?.data);
    res.status(500).json({ 
      error: 'Failed to fetch projects', 
      details: err.message,
      status: err.response?.status 
    });
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
      `${WEBODM_URL}/api/projects/`,  // ✅ Add /api/
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
    console.log('Renaming project:', { project_id, new_name });
    const token = await getWebODMToken();
    console.log('Token obtained for rename');
    
    // Instead of using renameProject function, do it directly here for debugging
    const response = await axios.patch(
      `${WEBODM_URL}/api/projects/${project_id}/`,
      { name: new_name },
      { headers: { Authorization: `JWT ${token}` } }
    );
    
    console.log('Rename successful:', response.data);
    res.json(response.data);
    
  } catch (err) {
    console.error('Rename error details:', {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data,
      url: `${WEBODM_URL}/api/projects/${project_id}/`
    });
    res.status(500).json({ 
      error: 'Failed to rename project', 
      details: err.message,
      status: err.response?.status,
      response_data: err.response?.data
    });
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
      `${WEBODM_URL}/api/tasks/${task_id}/`,  // ✅ Add /api/
      { headers: { Authorization: `JWT ${token}` } }
    );
    const task = taskResp.data;
    if (task.status !== 'COMPLETED') {
      return res.status(409).json({ error: 'Task is not completed yet', status: task.status });
    }

    // 4. Get orthophoto asset info
    const assetsResp = await axios.get(
      `${WEBODM_URL}/api/tasks/${task_id}/assets/`,  // ✅ Add /api/
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