import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load THIS server's own .env regardless of the process working directory.
// (`import 'dotenv/config'` only looks at process.cwd()/.env, which breaks when
// the server is started from the repo root or any other folder.) Both the dev
// entry (src/index.ts) and the built entry (dist/index.js) sit one level under
// web/server, so `../.env` resolves to web/server/.env in both cases.
// Must be imported FIRST in index.ts so process.env is populated before any
// other module reads it at import time.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../.env') });
