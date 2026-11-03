import { InputNumber, Typography } from 'antd'
import {
  MAX_BATCH_IMAGE_CONCURRENCY,
  clampBatchImageConcurrency,
  readBatchImageConcurrency,
  writeBatchImageConcurrency,
} from '../lib/batchImageConcurrencySettings'

export function BatchImageConcurrencyField({ value, onChange }: {
  value: number | null
  onChange: (value: number | null) => void
}) {
  return (
    <div>
      <label htmlFor="batch-image-concurrency" style={{ display: 'block', marginBottom: 8 }}>
        <Typography.Text type="secondary">同时压缩数量</Typography.Text>
      </label>
      <InputNumber
        id="batch-image-concurrency"
        aria-label="同时压缩数量"
        aria-describedby="batch-image-concurrency-description"
        min={1}
        max={MAX_BATCH_IMAGE_CONCURRENCY}
        precision={0}
        value={value}
        onChange={nextValue => {
          if (nextValue == null) { onChange(null); return }
          const next = clampBatchImageConcurrency(nextValue)
          onChange(next)
          writeBatchImageConcurrency(next)
        }}
        onBlur={() => { if (value == null) onChange(readBatchImageConcurrency()) }}
        style={{ width: '100%', maxWidth: 360 }}
      />
      <Typography.Paragraph
        id="batch-image-concurrency-description"
        type="secondary"
        style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}
      >
        请根据硬件负载情况调整同时压缩数量
      </Typography.Paragraph>
    </div>
  )
}
