// labels.js — readable cluster names (cluster_labels.json), keyed cluster_id -> label.
// Decoupled artifact generated on the laptop (label_clusters.py). Falls back gracefully:
// if absent, Browse uses the raw keyword cluster_label from the index.

let _map = null; // cluster_id -> readable label

export function setLabels(data) {
  if (!data) { _map = null; return; }
  _map = new Map();
  for (const entry of Object.values(data)) {
    if (entry && entry.cluster_id != null && entry.label) _map.set(entry.cluster_id, entry.label);
  }
}

export function labelFor(clusterId) {
  return (_map && clusterId != null) ? (_map.get(clusterId) || null) : null;
}
