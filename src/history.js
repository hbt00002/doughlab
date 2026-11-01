// Undo / redo over whole-scene snapshots. No DOM, so it can be tested in Node.
// Snapshots are stored as JSON strings: cheap to compare and immune to later mutation.
export function createHistory(limit = 100) {
  let past = [];
  let future = [];
  let current = null;

  return {
    reset(snapshot) {
      past = [];
      future = [];
      current = JSON.stringify(snapshot);
    },
    // Records `snapshot` as the new current state; false when nothing changed
    commit(snapshot) {
      const next = JSON.stringify(snapshot);
      if (next === current) return false;
      if (current !== null) past.push(current);
      if (past.length > limit) past.shift();
      future = [];
      current = next;
      return true;
    },
    undo() {
      if (!past.length) return null;
      future.push(current);
      current = past.pop();
      return JSON.parse(current);
    },
    redo() {
      if (!future.length) return null;
      past.push(current);
      current = future.pop();
      return JSON.parse(current);
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}
