/**
 * A photo made smaller to send, the right way up, as JPEG, no bigger than
 * `max` on its long side, or across for a tall screenshot whose print has
 * to stay readable. One the browser can't draw goes as it is, for the
 * server to say what's wrong with it.
 */
export async function shrinkPhoto(
  file: File,
  max: number,
  side: "long" | "width" = "long"
): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(
      1,
      max /
        (side === "width"
          ? bitmap.width
          : Math.max(bitmap.width, bitmap.height))
    )
    if (scale === 1 && file.type === "image/jpeg") {
      bitmap.close()
      return file
    }
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    )
    return blob ?? file
  } catch {
    return file
  }
}
