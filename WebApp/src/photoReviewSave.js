// Keep submitted operations immutable so a lost response can be retried safely.
export function reviewSubmission(payload) {
  const operations = [
    ...payload.photos.map(photo => ({ photos: [photo], people: [] })),
    ...payload.people.map(person => ({ photos: [], people: [person] })),
  ];
  return { version: 2, next: 0, total: operations.length, chunks: operations.map((operation, index) => ({
    requestId: `${payload.requestId}_${index}`, ...operation,
  })) };
}

export function acknowledgeReview(snapshot, chunk, submission) {
  const photos = new Set(chunk.photos.map(photo => photo.photoId));
  const people = new Set(chunk.people.map(person => person.id));
  return { ...snapshot, submission, committed: submission.next === submission.total,
    drafts: Object.fromEntries(Object.entries(snapshot.drafts).filter(([id]) => !photos.has(id))),
    peopleDrafts: snapshot.peopleDrafts.filter(person => !people.has(person.id)) };
}

export async function saveReviewSubmission(snapshot, { send, receipt, checkpoint, paused = () => false }) {
  let state = snapshot;
  let submission = state.submission;
  if (submission.version !== 2) {
    // Check the old all-at-once receipt before migrating a pending save.
    const previous = await receipt(submission.requestId);
    const migrated = reviewSubmission(submission);
    if (previous.found) {
      migrated.next = migrated.total;
      state = acknowledgeReview(state, submission, migrated);
    } else state = { ...state, submission: migrated };
    checkpoint(state);
    submission = state.submission;
  }
  while (submission.next < submission.total && !paused()) {
    const chunk = submission.chunks[submission.next];
    await send(chunk);
    submission = { ...submission, next: submission.next + 1 };
    state = acknowledgeReview(state, chunk, submission);
    // Persist each receipt before sending another operation.
    checkpoint(state);
  }
  return state;
}

function browserStorage(name) {
  try { return globalThis[name]; } catch { return undefined; }
}

export function readReviewSnapshot(key, session = browserStorage('sessionStorage'), local = browserStorage('localStorage')) {
  const snapshots = [session, local].flatMap(storage => {
    try { const value = JSON.parse(storage?.getItem(key)); return value && typeof value === 'object' ? [value] : []; }
    catch { return []; }
  });
  return snapshots.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || {};
}

export function writeReviewSnapshot(key, snapshot, session = browserStorage('sessionStorage'), local = browserStorage('localStorage')) {
  const value = JSON.stringify({ ...snapshot, updatedAt: Date.now() });
  let saved = false;
  for (const storage of [local, session]) {
    try { storage?.setItem(key, value); if (storage) saved = true; } catch { /* Try the other storage. */ }
  }
  if (!saved) throw new Error('Review draft storage unavailable');
}

export function clearReviewSnapshot(key) {
  for (const storage of [browserStorage('sessionStorage'), browserStorage('localStorage')]) {
    try { storage?.removeItem(key); } catch { /* Report storage failures on the next save. */ }
  }
}
