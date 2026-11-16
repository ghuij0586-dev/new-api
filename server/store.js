import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { decryptString, encryptString, randomId } from "./crypto.js";

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

export function openStore(dataDir, secret) {
  fs.mkdirSync(dataDir, { recursive: true });
  const docsDir = path.join(dataDir, "docs");
  fs.mkdirSync(docsDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "rongguang.sqlite"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      user_ref TEXT NOT NULL,
      auth_blob TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      name TEXT NOT NULL,
      token_id TEXT NOT NULL,
      key_blob TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS projects_user ON projects(username, created_at);
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      text TEXT NOT NULL,
      clipped INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS documents_project ON documents(project_id, created_at);
  `);

  function createSession(user, auth) {
    const id = randomId(24);
    const now = Date.now();
    db.prepare(
      `INSERT INTO sessions (id, username, display_name, user_ref, auth_blob, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      user.username,
      user.displayName || user.username,
      String(user.id || ""),
      encryptString(secret, JSON.stringify(auth)),
      now,
      now + SESSION_MS
    );
    return id;
  }

  function readSession(id) {
    if (!id) return null;
    const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
    if (!row) return null;
    if (row.expires_at <= Date.now()) {
      db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
      return null;
    }
    let auth;
    try {
      auth = JSON.parse(decryptString(secret, row.auth_blob));
    } catch {
      db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
      return null;
    }
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      userRef: row.user_ref,
      auth
    };
  }

  function deleteSession(id) {
    if (!id) return;
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }

  function listProjects(username) {
    return db
      .prepare("SELECT id, name, created_at FROM projects WHERE username = ? ORDER BY created_at ASC")
      .all(username)
      .map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at }));
  }

  function countProjects(username) {
    return Number(db.prepare("SELECT COUNT(*) AS n FROM projects WHERE username = ?").get(username).n);
  }

  function createProject(username, name, token) {
    const id = randomId(12);
    db.prepare(
      `INSERT INTO projects (id, username, name, token_id, key_blob, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, username, name, String(token.id || ""), encryptString(secret, token.key), Date.now());
    return { id, name };
  }

  function getProject(username, id) {
    const row = db.prepare("SELECT id, username, name, created_at FROM projects WHERE id = ? AND username = ?").get(id, username);
    if (!row) return null;
    return { id: row.id, username: row.username, name: row.name, createdAt: row.created_at };
  }

  function projectKey(username, id) {
    const row = db.prepare("SELECT key_blob FROM projects WHERE id = ? AND username = ?").get(id, username);
    if (!row) return "";
    return decryptString(secret, row.key_blob);
  }

  function countDocs(projectId) {
    return Number(db.prepare("SELECT COUNT(*) AS n FROM documents WHERE project_id = ?").get(projectId).n);
  }

  function listDocs(projectId) {
    return db
      .prepare("SELECT id, filename, bytes, clipped, created_at FROM documents WHERE project_id = ? ORDER BY created_at ASC")
      .all(projectId)
      .map((row) => ({
        id: row.id,
        filename: row.filename,
        bytes: row.bytes,
        clipped: Boolean(row.clipped),
        createdAt: row.created_at
      }));
  }

  function listDocTexts(projectId) {
    return db
      .prepare("SELECT filename, text FROM documents WHERE project_id = ? ORDER BY created_at ASC")
      .all(projectId)
      .map((row) => ({ filename: row.filename, text: row.text }));
  }

  function addDocument(projectId, doc) {
    const id = randomId(12);
    db.prepare(
      `INSERT INTO documents (id, project_id, filename, bytes, text, clipped, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, projectId, doc.filename, doc.bytes, doc.text, doc.clipped ? 1 : 0, Date.now());
    const filePath = docPath(projectId, id, doc.ext);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, doc.bytesBody);
    return { id, filename: doc.filename, bytes: doc.bytes, clipped: Boolean(doc.clipped) };
  }

  function deleteDocument(projectId, docId) {
    const row = db.prepare("SELECT id FROM documents WHERE id = ? AND project_id = ?").get(docId, projectId);
    if (!row) return false;
    db.prepare("DELETE FROM documents WHERE id = ?").run(docId);
    const dir = path.join(docsDir, projectId);
    if (fs.existsSync(dir)) {
      for (const name of fs.readdirSync(dir)) {
        if (name.startsWith(docId)) fs.rmSync(path.join(dir, name), { force: true });
      }
    }
    return true;
  }

  function docPath(projectId, docId, ext) {
    const safeExt = String(ext || "").replace(/[^a-z0-9.]/gi, "").slice(0, 8);
    const full = path.resolve(docsDir, projectId, docId + safeExt);
    const root = path.resolve(docsDir);
    if (!full.startsWith(root + path.sep)) throw new Error("路径无效");
    return full;
  }

  return {
    dbPath: path.join(dataDir, "rongguang.sqlite"),
    createSession,
    readSession,
    deleteSession,
    listProjects,
    countProjects,
    createProject,
    getProject,
    projectKey,
    countDocs,
    listDocs,
    listDocTexts,
    addDocument,
    deleteDocument
  };
}
