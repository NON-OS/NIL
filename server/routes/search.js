import express from 'express';
import route from '../lib/route.js';
import searchTasks from '../services/searchTasks.js';

const router = express.Router();

// Team tasks only. Private tasks and docs are searched in the browser, over what it has opened.
router.get('/search', route((req) => ({ tasks: searchTasks(req.user, typeof req.query.q === 'string' ? req.query.q.slice(0, 200) : '') })));

export default router;
