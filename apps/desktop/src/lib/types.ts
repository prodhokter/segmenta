export interface TaskRecord {
  id: string;
  url: string;
  filename: string;
  save_path: string;
  temp_path: string;
  status: 'Queued' | 'Downloading' | 'Paused' | 'Completed' | 'Failed' | 'Cancelled';
  total_size: number | null;
  downloaded_size: number;
  segments_count: number;
  speed_limit_bytes: number | null;
  priority: number;
  category_id: string | null;
  headers: Record<string, string>;
  etag: string | null;
  last_modified: string | null;
  checksum_sha256: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface SegmentRecord {
  id: string;
  task_id: string;
  segment_index: number;
  start_offset: number;
  end_offset: number | null;
  downloaded_bytes: number;
  status: 'Pending' | 'Downloading' | 'Completed' | 'Failed';
  part_filename: string;
  attempts: number;
  last_error: string | null;
  updated_at: string;
}
