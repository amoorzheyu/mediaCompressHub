import { useCallback, useEffect, useMemo, useState } from 'react'
import { Avatar, Button, Card, Empty, Flex, List, Pagination, Space, Spin, Tag, Typography } from 'antd'
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

const PAGE_SIZE_OPTIONS: number[] = [10, 20, 50]
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0]

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
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

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

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return rows.slice(start, start + pageSize)
  }, [rows, page, pageSize])

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(rows.length / pageSize) || 1)
    if (page > maxPage) setPage(maxPage)
  }, [rows.length, pageSize, page])

  const onPaginationChange = (p: number, ps: number) => {
    if (ps !== pageSize) {
      setPageSize(ps)
      setPage(1)
    } else {
      setPage(p)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Title level={2} style={{ marginBottom: 8 }}>
          处理历史
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 640 }}>
          以下仅为本机 IndexedDB 中的元数据与可选缩略图（视频为结果首帧截图）；压缩成品默认不长期保存，需当时下载。
        </Paragraph>
      </header>

      {loading ? (
        <Flex justify="center" style={{ marginTop: 56 }}>
          <Spin size="large" />
        </Flex>
      ) : rows.length === 0 ? (
        <Empty style={{ marginTop: 48 }} description="暂无记录，去「压缩」页面试试吧" />
      ) : (
        <Card
          className={styles.listCard}
          title="记录列表"
          extra={
            <Text type="secondary" style={{ fontSize: 13 }}>
              共 {rows.length} 条
            </Text>
          }
          styles={{ body: { padding: 0 } }}
        >
          <List
            className={styles.historyList}
            bordered
            itemLayout="horizontal"
            size="large"
            dataSource={paginatedRows}
            renderItem={(job) => (
              <List.Item
                className={styles.listItem}
                actions={[
                  <Button
                    key="delete"
                    danger
                    type="link"
                    icon={<DeleteOutlined />}
                    onClick={() => void onDelete(job.id)}
                  >
                    删除
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={<JobThumb blob={job.thumbnailBlob} fallback={kindLabel[job.kind]} />}
                  title={
                    <Flex align="center" gap={8} wrap="wrap">
                      <Text strong ellipsis={{ tooltip: job.inputName }} className={styles.itemTitle}>
                        {job.inputName}
                      </Text>
                      <Space size={6} wrap>
                        <Tag>{kindLabel[job.kind]}</Tag>
                        {job.status === 'done' ? (
                          <Tag color="success">已完成</Tag>
                        ) : (
                          <Tag color="error">失败</Tag>
                        )}
                      </Space>
                    </Flex>
                  }
                  description={
                    <>
                      <Text type="secondary" className={styles.metaLine}>
                        <time dateTime={new Date(job.createdAt).toISOString()}>
                          {new Date(job.createdAt).toLocaleString()}
                        </time>
                      </Text>
                      {job.status === 'done' ? (
                        <div className={styles.metaBlock}>
                          <Text type="secondary" className={styles.metaLine}>
                            {formatBytes(job.inputBytes)} → {formatBytes(job.outputBytes)}
                            {job.outputMime && <> · {job.outputMime}</>}
                            {job.width != null && job.height != null && (
                              <> · {job.width}×{job.height}</>
                            )}
                          </Text>
                        </div>
                      ) : (
                        <div className={styles.metaBlock}>
                          <Text type="danger" className={styles.metaLine}>
                            {job.errorMessage ?? '未知错误'}
                          </Text>
                        </div>
                      )}
                    </>
                  }
                />
              </List.Item>
            )}
          />
          <Flex justify="center" className={styles.paginationBar}>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={rows.length}
              showSizeChanger
              showTotal={(total, range) => `${range[0]}-${range[1]} / 共 ${total} 条`}
              pageSizeOptions={PAGE_SIZE_OPTIONS.map(String)}
              onChange={onPaginationChange}
              hideOnSinglePage
            />
          </Flex>
        </Card>
      )}
    </div>
  )
}
