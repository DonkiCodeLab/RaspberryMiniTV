import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export const HASH_CHUNK_BYTES = 2 * 1024 * 1024;

// Incremental hashing also works on the Raspberry's plain HTTP origin.
export async function hashPhoto(file, onProgress = () => {}) {
  const hash = sha256.create();
  for (let offset = 0; offset < file.size; offset += HASH_CHUNK_BYTES) {
    const end = Math.min(file.size, offset + HASH_CHUNK_BYTES);
    hash.update(new Uint8Array(await file.slice(offset, end).arrayBuffer()));
    onProgress(end, file.size);
  }
  return bytesToHex(hash.digest());
}
