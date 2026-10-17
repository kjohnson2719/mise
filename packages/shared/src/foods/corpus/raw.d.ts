// The corpus files, read as text by the tests (Vite's "?raw").
declare module "*.txt?raw" {
  const text: string
  export default text
}
