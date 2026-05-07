// Helper per upload archivi backup su Google Drive via Lovable Connector Gateway.
// Scope necessario: drive.file (configurato sul connettore). Crea/riusa una
// cartella radice "Crm backup" e una sottocartella per brand.
//
// IMPORTANTE: usa SEMPRE il gateway, mai l'API Google diretta.

const GATEWAY_BASE = "https://connector-gateway.lovable.dev/google_drive";
const ROOT_FOLDER_NAME = "Crm backup";
const FOLDER_MIME = "application/vnd.google-apps.folder";

function getCreds(): { lovableKey: string; driveKey: string } {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const driveKey = Deno.env.get("GOOGLE_DRIVE_API_KEY");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY_missing");
  if (!driveKey) throw new Error("GOOGLE_DRIVE_API_KEY_missing");
  return { lovableKey, driveKey };
}

function authHeaders(): Record<string, string> {
  const { lovableKey, driveKey } = getCreds();
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": driveKey,
  };
}

export function isDriveConfigured(): boolean {
  return !!Deno.env.get("LOVABLE_API_KEY") && !!Deno.env.get("GOOGLE_DRIVE_API_KEY");
}

async function gw(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = { ...authHeaders(), ...(init.headers ?? {}) } as Record<string, string>;
  return fetch(`${GATEWAY_BASE}${path}`, { ...init, headers });
}

async function findFolder(name: string, parentId?: string): Promise<string | null> {
  const safe = name.replace(/'/g, "\\'");
  const parentClause = parentId ? ` and '${parentId}' in parents` : "";
  const q = encodeURIComponent(
    `name='${safe}' and mimeType='${FOLDER_MIME}' and trashed=false${parentClause}`,
  );
  const res = await gw(`/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`drive_find_folder_failed [${res.status}]: ${txt.slice(0, 200)}`);
  }
  const j = await res.json();
  return j.files?.[0]?.id ?? null;
}

async function createFolder(name: string, parentId?: string): Promise<string> {
  const body: Record<string, unknown> = { name, mimeType: FOLDER_MIME };
  if (parentId) body.parents = [parentId];
  const res = await gw(`/drive/v3/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`drive_create_folder_failed [${res.status}]: ${txt.slice(0, 200)}`);
  }
  const j = await res.json();
  return j.id as string;
}

async function ensureFolder(name: string, parentId?: string): Promise<string> {
  const found = await findFolder(name, parentId);
  if (found) return found;
  return await createFolder(name, parentId);
}

export async function ensureBackupFolderPath(brandLabel: string): Promise<string> {
  const root = await ensureFolder(ROOT_FOLDER_NAME);
  const safeLabel = brandLabel?.trim() || "default";
  const brandFolder = await ensureFolder(safeLabel, root);
  return brandFolder;
}

export interface DriveUploadResult {
  fileId: string;
  webViewLink: string | null;
  size: number;
}

/**
 * Upload multipart di un archivio (.tar.gz) nella cartella indicata.
 * Usa multipart/related (uploadType=multipart) — adatto per file < 5 MB
 * idealmente, ma funziona fino a ~50 MB. Per archivi più grandi servirebbe
 * resumable upload, lasciato come TODO se i backup superano la soglia.
 */
export async function uploadArchiveToDrive(
  fileName: string,
  archive: Uint8Array,
  parentFolderId: string,
): Promise<DriveUploadResult> {
  const metadata = {
    name: fileName,
    parents: [parentFolderId],
    mimeType: "application/gzip",
  };
  const boundary = `----lovableBackup${crypto.randomUUID()}`;
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/gzip\r\n` +
      `Content-Transfer-Encoding: binary\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + archive.length + tail.length);
  body.set(head, 0);
  body.set(archive, head.length);
  body.set(tail, head.length + archive.length);

  const res = await gw(
    `/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,size`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`drive_upload_failed [${res.status}]: ${txt.slice(0, 300)}`);
  }
  const j = await res.json();
  return {
    fileId: j.id as string,
    webViewLink: (j.webViewLink as string) ?? null,
    size: Number(j.size ?? archive.length),
  };
}

export async function deleteDriveFile(fileId: string): Promise<boolean> {
  const res = await gw(`/drive/v3/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
  // 204 = ok, 404 = già rimosso (idempotente)
  return res.ok || res.status === 404;
}
