import express from 'express';
const router = express.Router();

/**
 * GET users listing.
 * Responds with a simple resource message.
 *
 * @route GET /users
 * @group Users
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {Function} next - Express next middleware function
 */
router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});

export default router;
