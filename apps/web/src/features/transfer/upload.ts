/** A file as a request's whole body, not JSON. */
export const asFileBody = (file: File) => ({
  body: file as unknown as string,
  bodySerializer: (body: unknown) => body as BodyInit,
  headers: {
    "content-type": file.name.toLowerCase().endsWith(".zip")
      ? "application/zip"
      : "application/octet-stream",
  },
})
