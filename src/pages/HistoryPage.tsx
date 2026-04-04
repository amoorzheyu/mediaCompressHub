import { useCallback, useEffect, useMemo, useState } from 'react'
import { Avatar, Button, Empty, Flex, List, Spin, Tag, Typography } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { deleteJob, listJobs, type JobRecord } from '../lib/idb/db'
import { formatBytes } from '../lib/formatBytes'
import styles from './HistoryPage.module.css'

const { Title, Paragraph, Text } = Typography

const kindLabel: Record<JobRecord['kind'], string> = {
  image: '图片',
  gif: 'GIF',
  video: '视频',
}

function JobThumb({ blob, fallback }: { blob: Blob | undefined; fallback: string }) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [url])
  if (!url) {
    return (
      <Avatar shape="square" size={56} className={styles.thumbFallback}>
        {fallback.slice(0, 1)}
      </Avatar>
    )
  }
  return <Avatar shape="square" size={56} src={url} className={styles.thumbImg} />
}

export function HistoryPage() {
  const [rows, setRows] = useState<JobRecord[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listJobs()
      setRows(list)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onDelete = async (id: string) => {
    await deleteJob(id)
    await refresh()
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Title level={2} style={{ marginBottom: 8 }}>
          处理历史
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 640 }}>
          以下仅为本机 IndexedDB 中的元数据与可选缩略图；压缩成品默认不长期保存，需当时下载。
        </Paragraph>
      </header>

      {loading ? (
        <Flex justify="center" style={{ marginTop: 56 }}>
          <Spin size="large" />
        </Flex>
      ) : rows.length === 0 ? (
        <Empty style={{ marginTop: 48 }} description="暂无记录，去「压缩」页面试试吧" />
      ) : (
        <List
          style={{ marginTop: 24 }}
          dataSource={rows}
          renderItem={(job) => (
            <List.Item
              style={{ paddingLeft: 0, paddingRight: 0 }}
              actions={[
                <Button
                  key="delete"
                  danger
                  type="link"
                  icon={<DeleteOutlined />}
                  onClick={() => void onDelete(job.id)}
                >
                  删除记录
                </Button>,
              ]}
            >
              <List.Item.Meta
                avatar={<JobThumb blob={job.thumbnailBlob} fallback={kindLabel[job.kind]} />}
                title={
                  <Flex align="center" gap={8} wrap>
                    <Text strong ellipsis={{ tooltip: job.inputName }}>
                      {job.inputName}
                    </Text>
                    <Tag>{kindLabel[job.kind]}</Tag>
                  </Flex>
                }
                description={
                  <>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      <time dateTime={new Date(job.createdAt).toISOString()}>
                        {new Date(job.createdAt).toLocaleString()}
                      </time>
                    </Text>
                    {job.status === 'done' ? (
                      <div style={{ marginTop: 4 }}>
                        <Text type="secondary" style={{ fontSize: 13 }}>
                          {formatBytes(job.inputBytes)} → {formatBytes(job.outputBytes)}
                          {job.outputMime && <> · {job.outputMime}</>}
                          {job.width != null && job.height != null && (
                            <> · {job.width}×{job.height}</>
                          )}
                        </Text>
                      </div>
                    ) : (
                      <div style={{ marginTop: 4 }}>
                        <Text type="danger" style={{ fontSize: 13 }}>
                          失败：{job.errorMessage ?? '未知错误'}
                        </Text>
                      </div>
                    )}
                  </>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  )
}
