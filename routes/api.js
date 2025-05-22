require('dotenv').config();
var express = require('express');
var router = express.Router();
var axios = require('axios'); // Install axios if not present
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { execFile } = require('child_process');

// Replace with your WebODM server URL
const WEBODM_URL = 'http://localhost:8000/api';
const WEBODM_USERNAME = process.env.WEBODM_USERNAME;
const WEBODM_PASSWORD = process.env.WEBODM_PASSWORD;

const mappingsPath = path.join(__dirname, '..', 'data', 'map_mappings.json');

// Helper to get JWT token from WebODM
async function getWebODMToken() {
  const res = await axios.post(`${WEBODM_URL}/token-auth/`, {
    username: WEBODM_USERNAME,
    password: WEBODM_PASSWORD
  });
  return res.data.token;
}

// POST /api/push-images
router.post('/push-images', async function(req, res) {
  const { images, project_name, options } = req.body;
  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'Images array required' });
  }
  if (!project_name) {
    return res.status(400).json({ error: 'project_name required' });
  }

  try {
    const token = await getWebODMToken();

    // 1. Get all projects and find the one with the given name
    const projectsResp = await axios.get(`${WEBODM_URL}/projects/`, {
      headers: { Authorization: `JWT ${token}` }
    });
    const project = projectsResp.data.results.find(p => p.name === project_name);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // 2. Prepare images as files for multipart/form-data
    // We'll save base64 images to temp files, then attach them
    const tempFiles = [];
    const form = new FormData();
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      // img should be a base64 string with data URI or just base64
      let base64Data = img;
      let ext = 'jpg';
      if (img.startsWith('data:')) {
        const matches = img.match(/^data:(image\/\w+);base64,(.+)$/);
        if (!matches) continue;
        ext = matches[1].split('/')[1];
        base64Data = matches[2];
      }
      const buffer = Buffer.from(base64Data, 'base64');
      const tempPath = path.join(__dirname, `temp_upload_${Date.now()}_${i}.${ext}`);
      fs.writeFileSync(tempPath, buffer);
      tempFiles.push(tempPath);
      form.append('images', fs.createReadStream(tempPath), {
        filename: `image${i + 1}.${ext}`,
        contentType: `image/${ext}`
      });
    }

    // 3. Add options if provided
    if (options) {
      form.append('options', JSON.stringify(options));
    }

    // 4. Create the task
    const taskResp = await axios.post(
      `${WEBODM_URL}/projects/${project.id}/tasks/`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `JWT ${token}`
        }
      }
    );

    // 5. Clean up temp files
    tempFiles.forEach(f => fs.unlinkSync(f));

    res.json(taskResp.data);
  } catch (err) {
    // Clean up temp files on error
    if (typeof tempFiles !== 'undefined') {
      tempFiles.forEach(f => {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      });
    }
    if (err.response && err.response.data) {
      return res.status(500).json({ error: 'Failed to create task', details: err.response.data });
    }
    res.status(500).json({ error: 'Failed to create task', details: err.message });
  }
});

// GET /api/get-projects
router.get('/get-projects', async function(req, res) {
  try {
    const response = await axios.get(`${WEBODM_URL}/projects/`, { auth: { username: WEBODM_USERNAME, password: WEBODM_PASSWORD } });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// GET /api/get-tasks
router.get('/get-tasks', async function(req, res) {
  const projectId = req.query.project_id;
  if (!projectId) {
    return res.status(400).json({ error: 'project_id required' });
  }
  try {
    const token = await getWebODMToken();
    const response = await axios.get(
      `${WEBODM_URL}/projects/${projectId}/tasks/`,
      { headers: { Authorization: `JWT ${token}` } }
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks', details: err.message });
  }
});

// GET /api/get-task-status
router.get('/get-task-status', async function(req, res) {
  const taskId = req.query.task_id;
  if (!taskId) {
    return res.status(400).json({ error: 'task_id required' });
  }
  try {
    const token = await getWebODMToken();
    const response = await axios.get(
      `${WEBODM_URL}/tasks/${taskId}/`,
      { headers: { Authorization: `JWT ${token}` } }
    );
    res.json({ status: response.data.status, task: response.data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch task status', details: err.message });
  }
});

// POST /api/create-project
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

// POST /api/delete-project
router.post('/delete-project', async function(req, res) {
  const { project_id } = req.body;
  if (!project_id) {
    return res.status(400).json({ error: 'project_id required' });
  }
  try {
    const token = await getWebODMToken();
    await axios.delete(
      `${WEBODM_URL}/projects/${project_id}/`,
      { headers: { Authorization: `JWT ${token}` } }
    );
    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete project', details: err.message });
  }
});

// POST /api/rename-project
router.post('/rename-project', async function(req, res) {
  const { project_id, new_name } = req.body;
  if (!project_id || !new_name) {
    return res.status(400).json({ error: 'project_id and new_name required' });
  }
  try {
    const token = await getWebODMToken();
    const response = await axios.patch(
      `${WEBODM_URL}/projects/${project_id}/`,
      { name: new_name },
      { headers: { Authorization: `JWT ${token}` } }
    );
    res.json({ message: 'Project renamed', project: response.data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to rename project', details: err.message });
  }
});

// POST /api/commit-task-to-map
router.post('/commit-task-to-map', async function(req, res) {
  const { task_id, map_name } = req.body;
  if (!task_id || !map_name) {
    return res.status(400).json({ error: 'task_id and map_name required' });
  }

  // 1. Load mappings
  let mappings;
  try {
    mappings = JSON.parse(fs.readFileSync(mappingsPath, 'utf8'));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read map mappings', details: err.message });
  }
  const destDir = mappings[map_name];
  if (!destDir) {
    return res.status(404).json({ error: 'Map name not found in mappings' });
  }

  // 2. Get OSGeo4W root and construct paths
  const osgeoRoot = process.env.OSGEO4W_ROOT;
  if (!osgeoRoot) {
    return res.status(500).json({ error: 'OSGEO4W_ROOT not set in .env' });
  }
  // You may need to adjust the Python version below if you use a different one
  const pythonPath = path.join(osgeoRoot, 'bin', 'python.exe');
  const gdalPolygonizePath = path.join(osgeoRoot, 'apps', 'Python37', 'Scripts', 'gdal_polygonize.py');

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

    // 5. Download orthophoto
    const orthoResp = await axios.get(orthoUrl, {
      headers: { Authorization: `JWT ${token}` },
      responseType: 'stream'
    });

    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const orthoPath = path.join(destDir, `task_${task_id}_orthophoto.tif`);
    const writer = fs.createWriteStream(orthoPath);
    orthoResp.data.pipe(writer);

    writer.on('finish', () => {
      // 6. Run gdal_polygonize.py to create shapefile
      const shapefileBase = path.join(destDir, `task_${task_id}_index`);
      execFile(
        pythonPath,
        [gdalPolygonizePath, orthoPath, '-f', 'ESRI Shapefile', shapefileBase],
        (error, stdout, stderr) => {
          if (error) {
            return res.status(500).json({ error: 'GDAL polygonize failed', details: stderr || error.message });
          }
          res.json({
            message: 'Orthophoto and shapefile committed to map',
            orthophoto: orthoPath,
            shapefile: `${shapefileBase}.shp`
          });
        }
      );
    });

    writer.on('error', (err) => {
      res.status(500).json({ error: 'Failed to save orthophoto', details: err.message });
    });

  } catch (err) {
    if (err.response && err.response.data) {
      return res.status(500).json({ error: 'Failed to commit task', details: err.response.data });
    }
    res.status(500).json({ error: 'Failed to commit task', details: err.message });
  }
});

module.exports = router;