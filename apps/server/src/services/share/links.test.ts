import { describe, expect, test } from "vitest"
import {
  findLinks,
  linksInText,
  sharedLinks,
  type SharedFile,
} from "./links.ts"

const file = (content: string | Buffer, type = "", name = ""): SharedFile => ({
  body: Buffer.from(content),
  type,
  name,
})

describe("links in shared text", () => {
  test("are found on their own, or with a line around them", () => {
    expect(linksInText("https://example.com/soup")).toEqual([
      "https://example.com/soup",
    ])
    expect(
      linksInText("Making this tonight! https://example.com/soup.")
    ).toEqual(["https://example.com/soup"])
    expect(
      linksInText("https://example.com/soup\nhttps://example.com/bread")
    ).toEqual(["https://example.com/soup", "https://example.com/bread"])
  })

  test("aren't found in a long text that happens to mention a site", () => {
    const email = `${"Thanks for your order. ".repeat(20)} https://shop.example.com/help`
    expect(linksInText(email)).toEqual([])
    expect(linksInText("Lemon chicken: 4 thighs, 2 lemons")).toEqual([])
    expect(linksInText(null)).toEqual([])
  })

  test("lose the punctuation after them, and come once each", () => {
    expect(
      findLinks("(see https://example.com/soup), or https://example.com/soup!")
    ).toEqual(["https://example.com/soup"])
  })
})

describe("links in a share", () => {
  test("come from what a Shortcut makes of a link", () => {
    // A text file with the address.
    expect(
      sharedLinks({
        files: [file("https://example.com/soup\n", "text/plain")],
        text: null,
      })
    ).toEqual(["https://example.com/soup"])
    // A .webloc, whose own header mentions apple.com.
    const webloc = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>URL</key><string>https://example.com/soup?a=1&amp;b=2</string></dict></plist>`
    expect(
      sharedLinks({ files: [file(webloc, "", "Soup.webloc")], text: null })
    ).toEqual(["https://example.com/soup?a=1&b=2"])
    // The web page itself, which carries its own address.
    const page = `<!doctype html><html><head><title>Soup</title>
<link rel="canonical" href="https://example.com/soup"></head><body><a href="https://example.com/other">Other</a></body></html>`
    expect(
      sharedLinks({ files: [file(page, "text/html")], text: null })
    ).toEqual(["https://example.com/soup"])
  })

  test("prefer the files to the text, and take no notice of a photo", () => {
    expect(
      sharedLinks({
        files: [
          file("https://example.com/soup", "text/plain"),
          file(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg"),
        ],
        text: "Soup https://example.com/soup",
      })
    ).toEqual(["https://example.com/soup"])
  })

  test("come from the text when the files have none", () => {
    expect(
      sharedLinks({
        files: [file(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg")],
        text: "https://example.com/soup",
      })
    ).toEqual(["https://example.com/soup"])
  })

  test("aren't there when a PDF is, or only a photo", () => {
    expect(
      sharedLinks({
        files: [file("%PDF-1.7 https://example.com", "application/pdf")],
        text: "https://example.com/soup",
      })
    ).toEqual([])
    expect(
      sharedLinks({
        files: [file(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg")],
        text: null,
      })
    ).toEqual([])
  })
})
