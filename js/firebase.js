/* js/firebase.js — Firestore REST API helpers
   Replace FIREBASE_CONFIG with your project credentials.
*/

const FIREBASE_CONFIG = {
  apiKey:    'AIzaSyAF9jLi1D2zx6w9TCEx5yUZnIu8T2PH1Os',
  projectId: 'doomherre-merch-planner',
};

const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;
const FS_KEY  = `?key=${FIREBASE_CONFIG.apiKey}`;

/* ── SERIALISE ── */
function fsVal(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean')  return { booleanValue: val };
  if (typeof val === 'number')   return { integerValue: String(Math.round(val)) };
  if (typeof val === 'string')   return { stringValue: val };
  if (Array.isArray(val))        return { arrayValue: { values: val.map(fsVal) } };
  if (typeof val === 'object')   return { mapValue: { fields: fsSerialise(val) } };
  return { stringValue: String(val) };
}
function fsSerialise(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = fsVal(v);
  return out;
}

/* ── PARSE ── */
function fsParse(fields) {
  if (!fields) return {};
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fsParseVal(v);
  return out;
}
function fsParseVal(v) {
  if (v.nullValue !== undefined)    return null;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return parseInt(v.integerValue);
  if (v.doubleValue !== undefined)  return parseFloat(v.doubleValue);
  if (v.stringValue !== undefined)  return v.stringValue;
  if (v.arrayValue)                 return (v.arrayValue.values || []).map(fsParseVal);
  if (v.mapValue)                   return fsParse(v.mapValue.fields);
  return null;
}

/* ── GET COLLECTION ── */
async function fsGetAll(collection) {
  const res = await fetch(`${FS_BASE}/${collection}${FS_KEY}`);
  const data = await res.json();
  if (!data.documents) return [];
  return data.documents.map(doc => ({
    id: doc.name.split('/').pop(),
    ...fsParse(doc.fields)
  }));
}

/* ── GET ONE ── */
async function fsGet(collection, id) {
  const res = await fetch(`${FS_BASE}/${collection}/${id}${FS_KEY}`);
  if (!res.ok) return null;
  const doc = await res.json();
  return { id: doc.name.split('/').pop(), ...fsParse(doc.fields) };
}

/* ── SET (create or overwrite) ── */
async function fsSet(collection, id, data) {
  const url = `${FS_BASE}/${collection}/${id}${FS_KEY}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: fsSerialise(data) })
  });
  if (!res.ok) throw new Error(`Firestore write failed: ${res.status}`);
  const doc = await res.json();
  return { id: doc.name.split('/').pop(), ...fsParse(doc.fields) };
}

/* ── ADD (auto ID) ── */
async function fsAdd(collection, data) {
  const res = await fetch(`${FS_BASE}/${collection}${FS_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: fsSerialise(data) })
  });
  if (!res.ok) throw new Error(`Firestore add failed: ${res.status}`);
  const doc = await res.json();
  return { id: doc.name.split('/').pop(), ...fsParse(doc.fields) };
}

/* ── DELETE ── */
async function fsDelete(collection, id) {
  const res = await fetch(`${FS_BASE}/${collection}/${id}${FS_KEY}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Firestore delete failed: ${res.status}`);
}

/* ── QUERY ── */
async function fsQuery(collection, filters = []) {
  const url = `${FS_BASE}:runQuery${FS_KEY}`;
  const query = { structuredQuery: { from: [{ collectionId: collection }] } };
  if (filters.length === 1) {
    query.structuredQuery.where = {
      fieldFilter: { field: { fieldPath: filters[0].field }, op: 'EQUAL', value: fsVal(filters[0].value) }
    };
  } else if (filters.length > 1) {
    query.structuredQuery.where = {
      compositeFilter: { op: 'AND', filters: filters.map(f => ({
        fieldFilter: { field: { fieldPath: f.field }, op: 'EQUAL', value: fsVal(f.value) }
      }))}
    };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query)
  });
  const data = await res.json();
  return data.filter(r => r.document?.fields).map(r => ({
    id: r.document.name.split('/').pop(),
    ...fsParse(r.document.fields)
  }));
}

/* ── SLUG ── */
function slugify(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/* ── TIMESTAMP ── */
function now() { return new Date().toISOString(); }
