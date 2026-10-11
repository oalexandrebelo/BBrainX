// Holds a lane database's write lock, as a long indexing run in another process would. Usage: lane-db-holder.mjs <db> <holdMs>
import { DatabaseSync } from 'node:sqlite';
const [file, holdMs] = process.argv.slice(2);
const db = new DatabaseSync(file);
db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
process.send({ held: true });
setTimeout(() => { db.exec('ROLLBACK'); db.close(); process.exit(0); }, Number(holdMs));
