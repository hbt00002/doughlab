// Browser storage helpers that never throw: private windows, blocked cookies and full
// storage all just mean "nothing saved". No DOM, so it can be tested in Node.

export function saveLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// The stored object, or null when it is missing, unreadable or not a plain object
export function loadLocal(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearLocal(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to clear when storage is unavailable
  }
}
