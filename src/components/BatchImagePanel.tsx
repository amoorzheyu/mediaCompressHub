import { useEffect, useRef, useState } from 'react'
import { Alert, App, Button, Card, Flex, Modal, Progress, Space, Table, Tag, Typography, Upload } from 'antd'
import { DeleteOutlined, DownloadOutlined, EyeOutlined, InboxOutlined } from '@ant-design/icons'
import { useBatchImages } from '../hooks/useBatchImages'
import type { BatchImageItem } from '../hooks/useBatchImages'
import { zipImageResults } from '../lib/compress/batchImage'
import type { BatchImageSettings } from '../lib/compress/batchImage'
import { formatBytes } from '../lib/formatBytes'
import { readImageMaxUploadBytes } from '../lib/fileUploadLimitSettings'
import { FileComparePreview } from './ImageCompareSlider'
import styles from './BatchImagePanel.module.css'

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function BatchImagePanel({ settings, concurrency, onBusyChange }: {
  settings: BatchImageSettings
  concurrency: number | null
  onBusyChange: (busy: boolean) => void
}) {
  const { message } = App.useApp()
  const batch = useBatchImages(settings, onBusyChange)
  const [errors, setErrors] = useState<string[]>([])
  const [preview, setPreview] = useState<{ item: BatchImageItem; url: string } | null>(null)
  const previewUrl = useRef<string | null>(null)
  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current) }, [])
  function closePreview() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = null
    setPreview(null)
  }
  function openPreview(item: BatchImageItem) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    const url = URL.createObjectURL(item.result!.blob)
    previewUrl.current = url
    setPreview({ item, url })
  }
  const [packing, setPacking] = useState(false)
  const [stopping, setStopping] = useState(false)
  const completed = batch.items.filter(item => item.status === 'done' && item.result)
  const failed = batch.items.filter(item => item.status === 'error').length
  const progress = batch.items.length
    ? Math.floor(batch.items.reduce((sum, item) => sum + (item.status === 'done' || item.status === 'error' ? 100 : item.progress), 0) / batch.items.length)
    : 0
  const inBytes = completed.reduce((sum, item) => sum + item.file.size, 0)
  const outBytes = completed.reduce((sum, item) => sum + item.result!.blob.size, 0)
  const invalidTarget = settings.mode === 'smart' && (!settings.targetBytes || !Number.isFinite(settings.targetBytes) || settings.targetBytes <= 0)

  async function downloadAll() {
    setPacking(true)
    try {
      download(await zipImageResults(completed.map(item => item.result!)), 'compressed-images.zip')
    } catch {
      message.error('打包失败，请重试或逐张下载')
    } finally { setPacking(false) }
  }

  return (
    <Space orientation="vertical" size="middle" className={styles.panel}>
      <div onDragOver={event => event.preventDefault()} onDropCapture={event => {
        event.preventDefault()
        event.stopPropagation()
        if (!batch.busy && !packing) setErrors(batch.addFiles(Array.from(event.dataTransfer.files)))
      }}>
      <Upload.Dragger
        accept="image/jpeg,image/png,image/webp,image/bmp,image/avif,.jpg,.jpeg,.png,.webp,.bmp,.avif"
        multiple disabled={batch.busy || packing} showUploadList={false}
        beforeUpload={(file, files) => {
          if (file === files[0]) setErrors(batch.addFiles(files))
          return false
        }}
      >
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <Typography.Title level={5}>拖入多张图片或点击选择</Typography.Title>
        <Typography.Paragraph type="secondary" className={styles.hint}>
          支持 JPG、PNG、WebP、AVIF、BMP；单文件最大 {formatBytes(readImageMaxUploadBytes())}
        </Typography.Paragraph>
      </Upload.Dragger>
      </div>
      {errors.length > 0 && <Alert type="warning" showIcon title="部分文件未添加" description={errors.join('；')} />}
      {batch.items.length > 0 && (
        <Card size="small" title={`图片队列（${batch.items.length} 张）`}>
          <Space orientation="vertical" className={styles.panel}>
            <Typography.Text type="secondary">
              所有图片使用下方输出选项，目标体积按每张图片计算。支持继续添加图片。
            </Typography.Text>
            <Flex gap={8} wrap align="center">
              <Button type="primary" loading={batch.busy} disabled={invalidTarget || packing || concurrency == null}
                onClick={() => { closePreview(); setStopping(false); if (concurrency != null) void batch.start(concurrency) }}>
                {batch.busy ? '压缩中' : batch.restarting ? '重新批量压缩' : failed ? '压缩待处理图片 / 重试失败项' : '开始批量压缩'}
              </Button>
              {batch.busy && <Button disabled={stopping} onClick={() => { batch.stop(); setStopping(true) }}>
                {stopping ? '完成正在压缩的图片后停止' : '停止后续任务'}
              </Button>}
              <Button icon={<DownloadOutlined />} disabled={!completed.length || batch.busy} loading={packing} onClick={() => void downloadAll()}>
                打包下载（{completed.length}）
              </Button>
              <Button disabled={batch.busy || packing} onClick={() => { batch.clear(); setErrors([]) }}>清空队列</Button>
            </Flex>
            <Progress percent={progress} status={batch.busy ? 'active' : failed ? 'exception' : undefined} />
            <Typography.Text type="secondary" aria-live="polite">
              已完成 {completed.length} / {batch.items.length} 张{failed ? `，失败 ${failed} 张` : ''}
              {completed.length > 0 ? ` · ${formatBytes(inBytes)} → ${formatBytes(outBytes)}` : ''}
            </Typography.Text>
            <Table<BatchImageItem> rowKey="id" size="small" dataSource={batch.items}
              pagination={batch.items.length > 10 ? { pageSize: 10, showSizeChanger: false } : false}
              scroll={{ x: 600 }} columns={[
                { title: '图片', key: 'file', render: (_, item) => (
                  <Space orientation="vertical" size={0}>
                    <Typography.Text className={styles.filename}>{item.file.name}</Typography.Text>
                    <Typography.Text type="secondary">{formatBytes(item.file.size)}{item.result ? ` → ${formatBytes(item.result.blob.size)}` : ''}</Typography.Text>
                  </Space>
                ) },
                { title: '状态', key: 'status', width: 220, render: (_, item) => (
                  item.status === 'running' ? <Progress percent={item.progress} size="small" status="active" /> :
                  item.status === 'error' ? <Typography.Text type="danger">{item.error}</Typography.Text> :
                  item.status === 'done' ? <Space orientation="vertical" size={0}>
                    <Tag color={item.result?.targetUnmet || item.result?.sizeNotReduced ? 'warning' : 'success'}>
                      {item.result?.targetUnmet ? '完成，未达目标体积'
                        : item.result?.sizeNotReduced ? '完成，体积未减小' : '已完成'}
                    </Tag>
                    {item.result?.historyError && <Typography.Text type="warning">{item.result.historyError}</Typography.Text>}
                  </Space> : <Tag>等待压缩</Tag>
                ) },
                { title: '操作', key: 'actions', width: 145, render: (_, item) => (
                  <Space size="small">
                    {item.result && <>
                      <Button icon={<EyeOutlined />} aria-label={`预览 ${item.file.name}`} onClick={() => openPreview(item)} />
                      <Button icon={<DownloadOutlined />} aria-label={`下载 ${item.file.name}`} onClick={() => download(item.result!.blob, item.result!.name)} />
                    </>}
                    <Button icon={<DeleteOutlined />} disabled={batch.busy || packing} aria-label={`移除 ${item.file.name}`} onClick={() => batch.remove(item.id)} />
                  </Space>
                ) },
              ]} />
          </Space>
        </Card>
      )}
      {preview && <Modal open title={preview.item.file.name} footer={null} onCancel={closePreview} width={900} centered>
        <FileComparePreview file={preview.item.file} processedSrc={preview.url} altProcessed={preview.item.result!.name} />
      </Modal>}
    </Space>
  )
}
