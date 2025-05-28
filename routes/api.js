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
  runGdalIndex
} from '../lib/commitTask.js';
import getTasks from '../lib/getTasks.js';
import getTaskStatus from '../lib/getTaskStatus.js';
import deleteProject from '../lib/deleteProject.js';
import renameProject from '../lib/renameProject.js';

const router = express.Router();

// Configure multer for MASSIVE file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB per file
    files: 1000, // max 1000 files
    fieldSize: 100 * 1024 * 1024, // 100MB for text fields
    parts: 2000 // Total number of parts (files + fields)
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
router.post('/push-images', upload.array('images', 1000), async function(req, res) {
  const { project_name, options } = req.body;
  
  // ========== DETAILED FILE COUNTING DEBUG ==========
  console.log('\n=== MASSIVE UPLOAD DEBUG ===');
  console.log('📋 Request received at:', new Date().toISOString());
  console.log('🔍 req.files exists:', !!req.files);
  console.log('🔍 req.files type:', typeof req.files);
  console.log('🔍 req.files is array:', Array.isArray(req.files));
  console.log('📁 TOTAL FILES RECEIVED IN THIS REQUEST:', req.files ? req.files.length : 0);
  
  // Log each individual file
  if (req.files && req.files.length > 0) {
    console.log('📋 Individual files received:');
    req.files.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
    });
  }
  
  console.log('📝 Request body keys:', Object.keys(req.body));
  console.log('📝 Project name:', req.body.project_name);
  console.log('=' .repeat(50));
  
  const images = req.files;
  
  if (!images || images.length === 0) {
    console.log('❌ No images provided - this request had ZERO files');
    return res.status(400).json({ error: 'Images array required' });
  }
  if (!project_name) {
    console.log('❌ No project name provided');
    return res.status(400).json({ error: 'project_name required' });
  }

  // Calculate total upload size
  const totalSize = images.reduce((sum, file) => sum + file.size, 0);
  const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
  
  console.log(`✅ CONFIRMED: Processing ${images.length} images for project: ${project_name}`);
  console.log(`📊 Total upload size: ${totalSizeMB} MB`);
  console.log(`📏 Average file size: ${(totalSize / images.length / (1024 * 1024)).toFixed(2)} MB`);

  try {
    const token = await getWebODMToken();
    const projectsResp = await getProjects(token);
    
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
    
    const project = projects.find(p => p.name === project_name);
    if (!project) {
      return res.status(404).json({ 
        error: 'Project not found',
        available_projects: projects.map(p => p.name),
        looking_for: project_name
      });
    }

    console.log(`📦 Creating FormData for upload: ${images.length} images...`);
    const form = new FormData();
    
    // Add ALL images to FormData with progress logging
    images.forEach((file, i) => {
      if (i % 10 === 0 || i === images.length - 1) {
        console.log(`📷 Adding images: ${i + 1}/${images.length} (${((i + 1) / images.length * 100).toFixed(1)}%)`);
      }
      
      form.append('images', fs.createReadStream(file.path), {
        filename: file.originalname || `image_${i + 1}.jpg`,
        contentType: file.mimetype || 'image/jpeg'
      });
    });

    let taskOptions = [
      { name: 'fast-orthophoto', value: true },
      { name: 'resize-to', value: 1024 },
      { name: 'quality', value: 'medium' },
      { name: 'pc-quality', value: 'medium' },
      { name: 'orthophoto-resolution', value: 5 }
    ];

    if (options) {
      try {
        const userOptions = typeof options === 'string' ? JSON.parse(options) : options;
        if (Array.isArray(userOptions)) {
          const userOptionNames = userOptions.map(opt => opt.name);
          taskOptions = taskOptions.filter(opt => !userOptionNames.includes(opt.name));
          taskOptions = [...taskOptions, ...userOptions];
        }
      } catch (parseErr) {
        console.warn('⚠️ Failed to parse user options, using defaults:', parseErr.message);
      }
    }

    console.log('⚙️ Task options for batch:', taskOptions);
    form.append('options', JSON.stringify(taskOptions));

    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const taskName = `Upload_${images.length}imgs_${totalSizeMB}MB_${timestamp}`;
    form.append('name', taskName);

    console.log(`🚀 Creating task with ${images.length} images (${totalSizeMB}MB)...`);
    console.log('📝 Task name:', taskName);
    
    const taskResp = await axios.post(
      `${WEBODM_URL}/api/projects/${project.id}/tasks/`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `JWT ${token}`
        },
        timeout: 0,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        maxRedirects: 0,
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            if (percentCompleted % 10 === 0) {
              console.log(`📤 Upload progress: ${percentCompleted}% (${(progressEvent.loaded / (1024 * 1024)).toFixed(2)}MB / ${(progressEvent.total / (1024 * 1024)).toFixed(2)}MB)`);
            }
          }
        }
      }
    );

    console.log('🎉 Task created successfully!');
    console.log('📝 Task ID:', taskResp.data.id);
    console.log('📊 Images in created task:', taskResp.data.images_count);
    console.log('💾 Total size processed:', totalSizeMB, 'MB');

    // Clean up temp files
    console.log('🧹 Cleaning up temporary files...');
    const cleanupPromises = images.map(async (file, i) => {
      try {
        await fs.promises.unlink(file.path);
        if (i % 100 === 0) {
          console.log(`🗑️ Cleaned up ${i + 1}/${images.length} temp files`);
        }
      } catch (err) {
        console.warn(`⚠️ Failed to delete temp file: ${file.path}`, err.message);
      }
    });
    
    await Promise.all(cleanupPromises);
    console.log('✅ All temporary files cleaned up');

    res.json({
      task: taskResp.data,
      message: `Task created successfully with ${images.length} images (${totalSizeMB}MB)`,
      poll_url: `/api/task-progress?task_id=${taskResp.data.id}`,
      stats: {
        image_count: images.length,
        total_size_mb: parseFloat(totalSizeMB),
        average_size_mb: parseFloat((totalSize / images.length / (1024 * 1024)).toFixed(2))
      }
    });
    
  } catch (err) {
    console.error('=== UPLOAD ERROR ===');
    console.error('❌ Error:', err.message);
    console.error('❌ Status:', err.response?.status);
    console.error('❌ Data:', err.response?.data);
    
    // Clean up temp files on error
    if (images) {
      console.log('🧹 Cleaning up temp files after error...');
      const cleanupPromises = images.map(async (file) => {
        try {
          if (await fs.promises.access(file.path).then(() => true).catch(() => false)) {
            await fs.promises.unlink(file.path);
          }
        } catch (cleanupErr) {
          console.warn(`⚠️ Failed to cleanup temp file: ${file.path}`, cleanupErr.message);
        }
      });
      await Promise.all(cleanupPromises);
    }
    
    res.status(500).json({ 
      error: 'Failed to create task', 
      details: err.message,
      response_data: err.response?.data 
    });
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
 * @api {get} /api/get-tasks/:projectId Get all tasks for a project (alternative endpoint)
 * @apiParam {string} projectId Project ID
 * @apiSuccess {object[]} tasks List of tasks with detailed info
 * @apiError (500) Failed to fetch tasks
 */
router.get('/get-tasks/:projectId', async function(req, res) {
  const { projectId } = req.params;
  try {
    const token = await getWebODMToken();
    const response = await axios.get(
      `${WEBODM_URL}/api/projects/${projectId}/tasks/`,
      { headers: { Authorization: `JWT ${token}` } }
    );
    res.json(response.data.results || response.data);
  } catch (err) {
    console.error('Failed to fetch tasks:', err.message);
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
//router.get('/get-task-status', async function(req, res) {
  //const taskId = req.query.task_id;
  //if (!taskId) {
   // return res.status(400).json({ error: 'task_id required' });
  //}
  //try {
   // const token = await getWebODMToken();
   // const status = await getTaskStatus(token, taskId);
   // res.json(status);
  //} catch (err) {
   // res.status(500).json({ error: 'Failed to fetch task status', details: err.message });
  //}
//});

/**
 * @api {get} /api/get-task-status/:taskId Get detailed status for a task
 * @apiParam {string} taskId Task ID (UUID format)
 * @apiSuccess {object} status Detailed task status including progress
 * @apiError (404) Task not found
 * @apiError (500) Failed to fetch task status
 */
router.get('/get-task-status/:taskId', async function(req, res) {
  const { taskId } = req.params;
  
  console.log(`🔍 GET /api/get-task-status/${taskId} - Endpoint hit!`);
  console.log('📋 Request params:', req.params);
  console.log('📋 Full URL:', req.originalUrl);
  
  try {
    console.log(`📊 Getting task status for: ${taskId}`);
    
    const token = await getWebODMToken();
    const response = await axios.get(
      `${WEBODM_URL}/api/tasks/${taskId}/`,
      { 
        headers: { Authorization: `JWT ${token}` },
        timeout: 30000
      }
    );
    
    const taskData = response.data;
    console.log(`✅ Task ${taskId} status: ${taskData.status}, progress: ${taskData.progress || 0}%`);
    
    res.json(taskData);
    
  } catch (err) {
    if (err.response?.status === 404) {
      console.error(`❌ Task ${taskId} not found in WebODM`);
      res.status(404).json({ error: 'Task not found', taskId });
    } else {
      console.error(`❌ Failed to fetch task status for ${taskId}:`, err.message);
      res.status(500).json({ 
        error: 'Failed to fetch task status', 
        details: err.message,
        taskId 
      });
    }
  }
});

/**
 * @api {get} /api/task-progress Get task progress using query parameters
 * @apiParam {string} task_id Task ID as query parameter
 * @apiParam {string} project_id Project ID as query parameter
 * @apiSuccess {object} progress Task progress information
 * @apiError (400) task_id and project_id parameters required
 * @apiError (500) Failed to fetch task progress
 */
router.get('/task-progress', async function(req, res) { 
  const { task_id, project_id } = req.query;
  
  if (!task_id || !project_id) {
    return res.status(400).json({ 
      error: 'Both task_id and project_id parameters are required',
      received: { task_id, project_id }
    });
  }
  
  try {
    console.log(`📈 Getting task progress for: Task ${task_id} in Project ${project_id}`);
    
    const token = await getWebODMToken();
    
    // Use the correct WebODM API path: /api/projects/{project_id}/tasks/{task_id}/
    const response = await axios.get(
      `${WEBODM_URL}/api/projects/${project_id}/tasks/${task_id}/`,
      { 
        headers: { Authorization: `JWT ${token}` },
        timeout: 30000
      }
    );
    
    const taskData = response.data;
    
    // Calculate overall progress based on WebODM task status and progress fields
    let overallProgress = 0;
    let stage = 'Unknown';
    let isComplete = false;
    let hasError = false;
    
    switch (taskData.status) {
      case 40: // COMPLETED
        overallProgress = 100;
        stage = 'Complete';
        isComplete = true;
        break;
        
      case 30: // FAILED
        stage = 'Failed';
        hasError = true;
        overallProgress = 0;
        break;
        
      case 20: // RUNNING
        // Calculate progress based on upload, resize, and running progress
        const uploadProg = (taskData.upload_progress || 0) * 30; // 30% for upload
        const resizeProg = (taskData.resize_progress || 0) * 20; // 20% for resize
        const runningProg = (taskData.running_progress || 0) * 50; // 50% for processing
        
        overallProgress = Math.round(uploadProg + resizeProg + runningProg);
        
        if (taskData.upload_progress < 1) {
          stage = 'Uploading images...';
        } else if (taskData.resize_progress < 1) {
          stage = 'Resizing images...';
        } else {
          stage = 'Processing orthophoto...';
        }
        break;
        
      case 10: // QUEUED
        stage = 'Queued for processing';
        overallProgress = 0;
        break;
        
      case 50: // CANCELED
        stage = 'Canceled';
        overallProgress = 0;
        break;
        
      default:
        stage = `Status: ${taskData.status}`;
        overallProgress = 0;
    }
    
    console.log(`✅ Task ${task_id} - Status: ${taskData.status}, Stage: ${stage}, Progress: ${overallProgress}%`);
    
    // Return enhanced progress data
    res.json({
      task_id: task_id,
      project_id: project_id,
      status: taskData.status,
      stage: stage,
      progress: overallProgress,
      upload_progress: Math.round((taskData.upload_progress || 0) * 100),
      resize_progress: Math.round((taskData.resize_progress || 0) * 100),
      running_progress: Math.round((taskData.running_progress || 0) * 100),
      processing_time: taskData.processing_time,
      is_complete: isComplete,
      has_error: hasError,
      last_error: taskData.last_error,
      images_count: taskData.images_count,
      name: taskData.name,
      created_at: taskData.created_at,
      // Include raw task data for debugging
      raw_data: taskData
    });
    
  } catch (err) {
    console.error(`❌ Failed to fetch task progress for Task ${task_id} in Project ${project_id}:`, err.message);
    
    if (err.response?.status === 404) {
      res.status(404).json({ 
        error: 'Task not found', 
        task_id,
        project_id,
        details: 'Task may not exist in this project or may not be initialized yet'
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to fetch task progress', 
        details: err.message,
        task_id,
        project_id,
        status: err.response?.status
      });
    }
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
    console.log('Deleting project:', project_id);
    const token = await getWebODMToken();
    console.log('Token obtained for delete');
    
    // Call delete directly with better error logging
    await axios.delete(
      `${WEBODM_URL}/api/projects/${project_id}/`,
      { headers: { Authorization: `JWT ${token}` } }
    );
    
    console.log('Delete successful for project:', project_id);
    res.json({ message: 'Project deleted successfully' });
    
  } catch (err) {
    console.error('Delete error details:', {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data,
      url: `${WEBODM_URL}/api/projects/${project_id}/`
    });
    res.status(500).json({ 
      error: 'Failed to delete project', 
      details: err.message,
      status: err.response?.status,
      response_data: err.response?.data
    });
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
 * @apiBody {string} project_id Project ID
 * @apiBody {string} map_name Map name (must exist in mappings)
 * @apiBody {boolean} [require_shapefile=true] Whether shapefile creation is required for success
 * @apiSuccess {object} result Paths to orthophoto and shapefile
 * @apiError (400) task_id, project_id and map_name required
 * @apiError (404) Map name not found in mappings or task not found
 * @apiError (409) Task is not completed yet
 * @apiError (500) Failed to commit task
 */
router.post('/commit-task-to-map', async function(req, res) {
  const { task_id, project_id, map_name, require_shapefile = true } = req.body;
  
  if (!task_id || !project_id || !map_name) {
    return res.status(400).json({ 
      error: 'task_id, project_id and map_name required',
      received: { task_id, project_id, map_name }
    });
  }

  console.log(`🗺️ Committing Task ${task_id} from Project ${project_id} to map: ${map_name}`);

  let mappings;
  try {
    mappings = loadMappings();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read map mappings', details: err.message });
  }
  
  const destDir = getDestDir(map_name, mappings);
  if (!destDir) {
    return res.status(404).json({ 
      error: 'Map name not found in mappings',
      available_maps: Object.keys(mappings),
      requested: map_name
    });
  }

  try {
    const token = await getWebODMToken();

    // 1. Get task info using correct API path
    console.log(`📊 Getting task info for Task ${task_id} in Project ${project_id}...`);
    const taskResp = await axios.get(
      `${WEBODM_URL}/api/projects/${project_id}/tasks/${task_id}/`,
      { 
        headers: { Authorization: `JWT ${token}` },
        timeout: 30000
      }
    );
    
    const task = taskResp.data;
    console.log(`✅ Task status: ${task.status}, Available assets:`, task.available_assets);
    
    // Check if task is completed (status 40 = COMPLETED)
    if (task.status !== 40) {
      return res.status(409).json({ 
        error: 'Task is not completed yet', 
        current_status: task.status,
        status_codes: {
          10: 'QUEUED',
          20: 'RUNNING', 
          30: 'FAILED',
          40: 'COMPLETED',
          50: 'CANCELED'
        }
      });
    }

    // 2. Check if orthophoto asset is available
    if (!task.available_assets || !task.available_assets.includes('orthophoto.tif')) {
      return res.status(404).json({ 
        error: 'Orthophoto not available for this task',
        available_assets: task.available_assets || []
      });
    }

    // 3. Download orthophoto using correct download API
    console.log(`📥 Downloading orthophoto from Task ${task_id}...`);
    const orthoDownloadUrl = `${WEBODM_URL}/api/projects/${project_id}/tasks/${task_id}/download/orthophoto.tif`;
    
    let orthoPath;
    try {
      orthoPath = await downloadOrthophoto(orthoDownloadUrl, destDir, task_id, token);
      console.log(`✅ Orthophoto downloaded to: ${orthoPath}`);
    } catch (downloadErr) {
      console.error(`❌ Failed to download orthophoto:`, downloadErr.message);
      return res.status(500).json({ 
        error: 'Failed to download orthophoto', 
        details: downloadErr.message,
        task_id,
        project_id,
        map_name
      });
    }

    // 4. Run gdaltindex to create shapefile index
    console.log(`🔧 Running gdaltindex to create shapefile index...`);
    let shapefilePath = await runGdalIndex(orthoPath, destDir, task_id);
    console.log(`✅ Shapefile created at: ${shapefilePath}`);
    let shapefileError = null;

    // 5. Prepare final assets (only orthophoto and shapefile)
    const downloadedAssets = {
      orthophoto_tif: orthoPath
    };

    if (shapefilePath) {
      downloadedAssets.shapefile = shapefilePath;
    }

    const warnings = [];
    if (shapefileError) {
      warnings.push(`Shapefile creation failed: ${shapefileError}`);
    }

    console.log(`🎉 Task ${task_id} committed successfully to map ${map_name}`);
    console.log(`📦 Final assets: orthophoto + ${shapefilePath ? 'shapefile' : 'no shapefile'}`);

    res.json({
      message: 'Task orthophoto and shapefile committed to map successfully',
      task_id,
      project_id,
      map_name,
      destination_directory: destDir,
      downloaded_assets: downloadedAssets,
      available_assets: task.available_assets,
      warnings,
      shapefile_created: !!shapefilePath
    });

  } catch (err) {
    console.error(`❌ Failed to commit task ${task_id} to map ${map_name}:`, err);
    console.error(`❌ Error details:`, {
      message: err.message,
      stack: err.stack,
      response: err.response?.data
    });
    
    if (err.response?.status === 404) {
      res.status(404).json({ 
        error: 'Task not found', 
        task_id,
        project_id,
        details: 'Task may not exist in this project'
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to commit task', 
        details: err.message,
        task_id,
        project_id,
        map_name
      });
    }
  }
});

export default router;