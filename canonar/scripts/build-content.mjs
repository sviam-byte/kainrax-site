import { promises as fs } from 'node:fs'
import { join, basename } from 'node:path'

const ROOT = process.cwd()
const ENT_ROOT = join(ROOT, 'content', 'entities')
const SCN_ROOT = join(ROOT, 'content', 'scenarios')
const OUT_DIR = join(ROOT, 'public')
const OUT = join(OUT_DIR, 'registry.json')

async function readJSON(p) { return JSON.parse(await fs.readFile(p, 'utf8')) }

async function collectEntities() {
  const uuids = await fs.readdir(ENT_ROOT)
  const items = []
  for (const u of uuids) {
    const dir = join(ENT_ROOT, u)
    const files = await fs.readdir(dir)
    const metaFile = files.find(f => f.endsWith('.meta.json'))
    if (!metaFile) continue
    const meta = await readJSON(join(dir, metaFile))
    const branchesDir = join(dir, 'branches')
    const branchFiles = await fs.readdir(branchesDir)
    const branches = {}
    for (const bf of branchFiles) {
      if (!bf.endsWith('.json')) continue
      const name = basename(bf, '.json')
      branches[name] = await readJSON(join(branchesDir, bf))
    }
    items.push({ meta, branches })
  }
  return items
}

async function collectScenarios() {
  try {
    const files = await fs.readdir(SCN_ROOT)
    const arr = []
    for (const f of files) if (f.endsWith('.json')) arr.push(await readJSON(join(SCN_ROOT, f)))
    return arr
  } catch { return [] }
}

function buildIndex(entities) {
  const bySlug = {}
  const byId = {}
  const quick = [] // для поиска
  for (const e of entities) {
    bySlug[e.meta.slug] = e
    byId[e.meta.entity_id] = e
    quick.push({
      slug: e.meta.slug,
      title: e.meta.title,
      type: e.meta.type,
      tags: e.meta.tags,
      id: e.meta.entity_id
    })
  }
  return { bySlug, byId, quick }
}

async function main() {
  const entities = await collectEntities()
  const scenarios = await collectScenarios()
  const idx = buildIndex(entities)
  const payload = {
    _generated_at: new Date().toISOString(),
    entities,
    index: idx.quick,
    scenarios
  }
  await fs.mkdir(OUT_DIR, { recursive: true })
  await fs.writeFile(OUT, JSON.stringify(payload, null, 2), 'utf8')
  console.log('registry.json written:', OUT)
}
main().catch(e => { console.error(e); process.exit(1) })
