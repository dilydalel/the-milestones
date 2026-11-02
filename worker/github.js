// Reading and saving the site's data files (db/*.json) in GitHub.
const API = (env) => env.GITHUB_API || 'https://api.github.com';
const headers = (env, extra) => ({
  Authorization: 'Bearer ' + env.GITHUB_TOKEN,
  'User-Agent': 'milestones-music-site',
  Accept: 'application/vnd.github+json',
  ...(extra || {}),
});

export class ConflictError extends Error {}

async function graphql(env, query, variables) {
  if (!env.GITHUB_TOKEN) throw new Error('The GITHUB_TOKEN secret is not set in Cloudflare.');
  const r = await fetch(API(env) + '/graphql', {
    method: 'POST', headers: headers(env, { 'Content-Type': 'application/json' }), body: JSON.stringify({ query, variables }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.errors) {
    const msg = j.errors ? j.errors.map((e) => e.message).join('; ') : `HTTP ${r.status}`;
    if (/expected|head|oid|stale|fast.forward/i.test(msg) && /commit|branch|head/i.test(msg)) throw new ConflictError(msg);
    throw new Error('GitHub: ' + msg);
  }
  return j.data;
}

const LOAD = `query($owner:String!,$name:String!,$expr:String!,$ref:String!){
  repository(owner:$owner,name:$name){
    ref(qualifiedName:$ref){ target{ oid } }
    object(expression:$expr){ ... on Tree { entries { name type object { ... on Blob { text isTruncated } } } } }
  }
}`;

// All db/*.json files plus the commit they came from.
export async function loadDb(env) {
  const [owner, name] = env.REPO.split('/');
  const d = await graphql(env, LOAD, { owner, name, expr: `${env.BRANCH}:db`, ref: `refs/heads/${env.BRANCH}` });
  if (!d.repository || !d.repository.ref) throw new Error(`Branch ${env.BRANCH} not found in ${env.REPO}`);
  const oid = d.repository.ref.target.oid;
  const files = {};
  for (const e of (d.repository.object && d.repository.object.entries) || []) {
    if (e.type !== 'blob' || !e.name.endsWith('.json') || !e.object) continue;
    let text = e.object.text;
    if (text == null || e.object.isTruncated) {
      const r = await fetch(`${API(env)}/repos/${env.REPO}/contents/db/${e.name}?ref=${oid}`, { headers: headers(env, { Accept: 'application/vnd.github.raw' }) });
      if (!r.ok) throw new Error('GitHub: could not read db/' + e.name);
      text = await r.text();
    }
    files[e.name.slice(0, -5)] = JSON.parse(text);
  }
  return { oid, files };
}

export async function headOid(env) {
  const [owner, name] = env.REPO.split('/');
  const d = await graphql(env, `query($owner:String!,$name:String!,$ref:String!){ repository(owner:$owner,name:$name){ ref(qualifiedName:$ref){ target{ oid } } } }`,
    { owner, name, ref: `refs/heads/${env.BRANCH}` });
  return d.repository.ref.target.oid;
}

function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// One commit with all changed files. Fails with ConflictError if someone else committed first.
export async function commitFiles(env, expectedOid, changes, headline) {
  const d = await graphql(env, `mutation($input:CreateCommitOnBranchInput!){ createCommitOnBranch(input:$input){ commit{ oid } } }`, {
    input: {
      branch: { repositoryNameWithOwner: env.REPO, branchName: env.BRANCH },
      expectedHeadOid: expectedOid,
      message: { headline: headline.slice(0, 120) },
      fileChanges: { additions: changes.map(([path, text]) => ({ path, contents: b64(text) })) },
    },
  });
  return d.createCommitOnBranch.commit.oid;
}

// Every file under assets/ in the repository (for the admin's file picker).
export async function listRepoFiles(env, prefix) {
  const r = await fetch(`${API(env)}/repos/${env.REPO}/git/trees/${env.BRANCH}?recursive=1`, { headers: headers(env) });
  if (!r.ok) throw new Error('GitHub: could not list files');
  const j = await r.json();
  return (j.tree || []).filter((t) => t.type === 'blob' && t.path.startsWith(prefix)).map((t) => ({ path: t.path, size: t.size || 0 }));
}
