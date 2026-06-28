/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_USE_HASH_ROUTER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

type NativeVideoCompressPayload = {
  jobId: string
  buffer: ArrayBuffer
  inputFileName: string
  crf: number
  keepAudio?: boolean
}

type NativeVideoCompressResult = {
  buffer: ArrayBuffer
  outputMime: string
  outputFileName: string
}

type NativeVideoProgressMessage = {
  jobId: string
  progress: number
}

interface Window {
  mediaCompressHub?: {
    compressVideoNative(payload: NativeVideoCompressPayload): Promise<NativeVideoCompressResult>
    onNativeVideoProgress(listener: (message: NativeVideoProgressMessage) => void): () => void
  }
}
