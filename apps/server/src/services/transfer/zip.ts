import type { Readable } from "node:stream"
import yauzl from "yauzl"

/** The most any one file in an upload is read into memory. */
const MAX_FILE_BYTES = 500_000_000

async function toBuffer(stream: Readable) {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer))
  return Buffer.concat(chunks)
}

/**
 * A zip on disk: the names of what's in it, and each file read only when
 * it's wanted. Close it when done.
 */
export async function openZip(path: string) {
  const zip = await yauzl.openPromise(path, {
    autoClose: false,
    lazyEntries: true,
  })
  const list: yauzl.Entry[] = []
  const byName = new Map<string, yauzl.Entry>()
  try {
    for await (const entry of zip.eachEntry()) {
      // Folders are only in the names of what's in them.
      if (entry.fileName.endsWith("/")) continue
      list.push(entry)
      if (!byName.has(entry.fileName)) byName.set(entry.fileName, entry)
    }
  } catch (err) {
    zip.close()
    throw err
  }

  const readEntry = async (entry: yauzl.Entry) => {
    if (entry.uncompressedSize > MAX_FILE_BYTES) {
      throw new Error(`${entry.fileName} is too big to read`)
    }
    return toBuffer(await zip.openReadStreamPromise(entry))
  }

  let open = true
  return {
    /** Every file's path in the zip, as "photos/1.webp". */
    names: () => [...byName.keys()],
    /**
     * Every file, even two with the same name (Paprika names its files
     * after recipes, and two recipes can share one).
     */
    files: () =>
      list.map((entry) => ({
        name: entry.fileName,
        read: () => readEntry(entry),
      })),
    /** A file in the zip, or null if it's not there. */
    async read(name: string): Promise<Buffer | null> {
      const entry = byName.get(name)
      return entry ? readEntry(entry) : null
    },
    close() {
      if (open) zip.close()
      open = false
    },
  }
}

export type OpenZip = Awaited<ReturnType<typeof openZip>>
