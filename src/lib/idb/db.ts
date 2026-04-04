import Dexie, { type EntityTable } from 'dexie'

export type JobKind = 'image' | 'gif' | 'video'

export interface JobRecord {
  id: string
  createdAt: number
  kind: JobKind
  inputName: string
  inputMime: string
  inputBytes: number
  outputMime: string
  outputBytes: number
  ratio: number
  status: 'done' | 'error'
  errorMessage?: string
  width?: number
  height?: number
  thumbnailBlob?: Blob
}

export class MediaCompressDB extends Dexie {
  jobs!: EntityTable<JobRecord, 'id'>

  constructor() {
    super('media-compress-hub')
    this.version(1).stores({
      jobs: 'id, createdAt, kind, status',
    })
  }
}

export const db = new MediaCompressDB()

export async function addJob(record: JobRecord): Promise<void> {
  await db.jobs.put(record)
}

export async function listJobs(limit = 200): Promise<JobRecord[]> {
  return db.jobs.orderBy('createdAt').reverse().limit(limit).toArray()
}

export async function deleteJob(id: string): Promise<void> {
  await db.jobs.delete(id)
}

export async function clearAllJobs(): Promise<void> {
  await db.jobs.clear()
}
