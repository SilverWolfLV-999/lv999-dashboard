/**
 * 知识库文件上传的前端 accept 配置（react-dropzone 格式：MIME → 扩展名列表）。
 * 与后端白名单 `lib/extract.ts` 的 ACCEPTED_FILE_EXTENSIONS 对应；
 * 前端仅作选择器过滤（非强制），后端扩展名白名单是强制防线。
 */
export const KNOWLEDGE_FILE_ACCEPT: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx', '.docm'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.oasis.opendocument.text': ['.odt'],
  'application/vnd.oasis.opendocument.spreadsheet': ['.ods'],
  'application/vnd.oasis.opendocument.presentation': ['.odp'],
  'application/rtf': ['.rtf'],
  'application/epub+zip': ['.epub'],
  'text/csv': ['.csv'],
  'text/markdown': ['.md', '.markdown'],
  'text/plain': ['.txt'],
  'text/html': ['.html', '.htm']
};
