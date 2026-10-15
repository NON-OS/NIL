import fs from 'node:fs';
import path from 'node:path';
import config from '../config.js';

const uploadDir = path.join(config.dataDir, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true, mode: 0o700 });

export default uploadDir;
