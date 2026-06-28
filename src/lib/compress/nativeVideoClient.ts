export type NativeVideoCompressResult = {
  buffer: ArrayBuffer
  outputMime: string
  outputFileName: string
}

export function canUseNativeVideoCompress(): boolean {
  return typeof window !== 'undefined' && Boolean(window.mediaCompressHub?.compressVideoNative)
}

export function runNativeVideoCompress(
  jobId: string,
  buffer: ArrayBuffer,
  inputFileName: string,
  crf: number,
  onProgress: (p: number) => void,
  keepAudio = true,
): Promise<NativeVideoCompressResult> {
  const api = window.mediaCompressHub
  if (!api) {
    return Promise.reject(new Error('原生视频压缩能力不可用'))
  }

  return new Promise((resolve, reject) => {
    const offProgress = api.onNativeVideoProgress((msg) => {
      if (msg.jobId === jobId) {
        onProgress(msg.progress)
      }
    })

    api
      .compressVideoNative({
        jobId,
        buffer,
        inputFileName,
        crf,
        keepAudio,
      })
      .then(resolve, reject)
      .finally(offProgress)
  })
}
