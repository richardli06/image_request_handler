import express from 'express';
const router = express.Router();

/**
 * GET home page.
 * Renders the index page with a title.
 *
 * @route GET /
 * @group Pages
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {Function} next - Express next middleware function
 */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

export default router;
